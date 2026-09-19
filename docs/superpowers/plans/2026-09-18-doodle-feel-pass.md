# Doodle Feel Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four independent feedback features to the doodle sandbox — flick-to-throw momentum, per-shapeType oscillator timbre, rate-limited haptics, and a slow-motion/freeze toggle.

**Architecture:** Every change follows the existing doodle split: pure, rng-threaded helpers and their `DEFAULT_*` constants live in `lib/doodle*.js`; state mutation lives in `lib/useDoodleObjects.js`; `components/doodle/DoodleCanvas.jsx` is the only place that threads live tuning state and browser APIs in. Feel constants that a parent might live-tweak go through `TuningPanel.jsx`; gesture thresholds and anti-spam gates stay plain constants.

**Tech Stack:** Next.js (pages router), React 18, SVG, Web Audio API, Vibration API, vitest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-doodle-feel-pass-design.md`

## Global Constraints

- **Four commits, in this order: flick-throw, timbre, haptics, slow-mo.** Each must be green on `npm test` and `npm run lint` on its own, before the next task starts.
- No new dependencies. Do not touch `package.json` or `package-lock.json`.
- Commit subject shape is Conventional Commits with the rule file's scope: `feat(doodle): ...` (from `scope: doodle` in `.claude/rules/doodle.md`). Use the `commit-message` skill to draft each one.
- **Add no new `rng()` draws.** `seq([...])` tests hand-compute expected values from rng call position; an extra draw silently breaks tests far from the change. None of these four features needs randomness.
- Test files sit next to their source. `.test.jsx` only for files containing JSX — `lib/doodleHaptics.test.js`, `lib/doodleSound.test.js`, `lib/doodlePhysics.test.js` and `lib/doodleShapes.test.js` are `.js`; `lib/useDoodleObjects.test.jsx` and `components/doodle/*.test.jsx` are `.jsx`.
- Airbnb ESLint: use `i += 1` not `i++`, no JSX prop spreading, `prop-types` on every component.
- Every `localStorage` access is wrapped in `try/catch` that no-ops on failure, and every preference is read in a mount effect, never a lazy `useState` initializer.
- Run `npm test` and `npm run lint` before every commit. Both must be clean.

---

### Task 1: Flick-to-throw

**Files:**
- Modify: `lib/doodleShapes.js` (add `throwVelocity` + constants)
- Modify: `lib/doodleShapes.test.js`
- Modify: `lib/useDoodleObjects.js` (add `throwShape` mutator)
- Modify: `lib/useDoodleObjects.test.jsx`
- Modify: `components/doodle/TuningPanel.jsx` (add `maxThrowSpeed` field)
- Modify: `components/doodle/TuningPanel.test.jsx`
- Modify: `components/doodle/DoodleCanvas.jsx` (sampling, release, cancel, tuning default)
- Modify: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `moveShape`, `transformShape`, `popShape` from `lib/useDoodleObjects.js`; `pointersRef` entry shape in `DoodleCanvas.jsx`.
- Produces:
  - `DEFAULT_MAX_THROW_SPEED: number` (600), `THROW_SAMPLE_WINDOW_MS: number` (100), `MIN_THROW_SPEED: number` (20) from `lib/doodleShapes.js`.
  - `throwVelocity(samples, releaseTime, maxSpeed = DEFAULT_MAX_THROW_SPEED) => { vx: number, vy: number }` where `samples` is `Array<{ x: number, y: number, t: number }>` in chronological order and `releaseTime` is a `Date.now()` millisecond stamp.
  - `throwShape(id: string, vx: number, vy: number) => void` from `useDoodleObjects`.
  - `tuning.maxThrowSpeed: number` in `DEFAULT_TUNING` and the `TuningPanel` `tuning` shape.

- [ ] **Step 1: Write the failing `throwVelocity` tests**

Append to `lib/doodleShapes.test.js`. Add `throwVelocity`, `DEFAULT_MAX_THROW_SPEED` and `MIN_THROW_SPEED` to the existing import block from `./doodleShapes` at the top of the file.

```js
describe('throwVelocity', () => {
  it('returns zero for fewer than two samples', () => {
    expect(throwVelocity([], 100)).toEqual({ vx: 0, vy: 0 });
    expect(throwVelocity([{ x: 0, y: 0, t: 90 }], 100)).toEqual({ vx: 0, vy: 0 });
  });

  it('returns zero when every sample predates the release window', () => {
    // Finger dragged fast, then held still: pointermove stops firing, so the
    // newest sample is stale. Measuring the window from release time — not
    // from the last sample — is what makes this read as "put it down".
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 50 },
    ];
    expect(throwVelocity(samples, 1000)).toEqual({ vx: 0, vy: 0 });
  });

  it('derives velocity in px/s from the samples inside the window', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 10, t: 50 },
    ];
    const { vx, vy } = throwVelocity(samples, 60, 5000);
    expect(vx).toBeCloseTo(400); // 20px / 0.05s
    expect(vy).toBeCloseTo(200);
  });

  it('ignores samples older than the window but keeps the recent ones', () => {
    const samples = [
      { x: 999, y: 999, t: 0 }, // stale, must not skew the result
      { x: 0, y: 0, t: 950 },
      { x: 20, y: 0, t: 1000 },
    ];
    const { vx, vy } = throwVelocity(samples, 1000, 5000);
    expect(vx).toBeCloseTo(400);
    expect(vy).toBeCloseTo(0);
  });

  it('clamps to maxSpeed while preserving direction', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 300, y: 400, t: 50 },
    ];
    const { vx, vy } = throwVelocity(samples, 60, 1000);
    expect(Math.hypot(vx, vy)).toBeCloseTo(1000);
    expect(vy / vx).toBeCloseTo(400 / 300); // same heading
  });

  it('returns exactly zero below the deadzone so a gentle release parks the shape', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 0.5, y: 0, t: 50 }, // 0.5px / 0.05s = 10px/s, under MIN_THROW_SPEED
    ];
    expect(MIN_THROW_SPEED).toBeGreaterThan(10);
    expect(throwVelocity(samples, 60)).toEqual({ vx: 0, vy: 0 });
  });

  it('returns zero when two samples share a timestamp', () => {
    const samples = [
      { x: 0, y: 0, t: 50 },
      { x: 30, y: 0, t: 50 },
    ];
    expect(throwVelocity(samples, 60)).toEqual({ vx: 0, vy: 0 });
  });

  it('defaults maxSpeed to DEFAULT_MAX_THROW_SPEED', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 500, y: 0, t: 50 }, // 10000 px/s raw
    ];
    expect(throwVelocity(samples, 60).vx).toBeCloseTo(DEFAULT_MAX_THROW_SPEED);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: FAIL — `throwVelocity is not a function` (and the constants import as `undefined`).

- [ ] **Step 3: Implement `throwVelocity` in `lib/doodleShapes.js`**

Add after the `SPLIT_GRACE_S` block, before `const randRange = ...`:

```js
// Flick-to-throw release velocity ceiling (px/s). Nothing in the sandbox
// damps velocity in free flight — advanceShape's wall bounce flips the sign
// and keeps the magnitude exactly, and RESTITUTION only applies on
// shape-to-shape impact — so an unclamped flick ping-pongs forever at flick
// speed. Exposed through the tuning panel (see .claude/rules/doodle.md).
export const DEFAULT_MAX_THROW_SPEED = 600;

// Only pointer samples from this many ms before the release count toward the
// throw. Measured from the release, NOT from the newest sample: a finger that
// stops moving stops producing pointermove events, so the newest sample can
// be a second old and still describe fast motion. Ageing those out is exactly
// what makes "drag fast, hold still, lift" release the shape stationary.
export const THROW_SAMPLE_WINDOW_MS = 100;

// Below this (px/s) a release parks the shape outright instead of leaving it
// crawling. A gesture-recognition threshold like MOVE_THRESHOLD, not a feel
// knob — it stays a plain constant, out of the tuning panel.
export const MIN_THROW_SPEED = 20;

// samples: chronological [{ x, y, t }], t in ms. releaseTime: ms stamp of the
// pointerup. Returns the velocity to hand to throwShape.
export function throwVelocity(samples, releaseTime, maxSpeed = DEFAULT_MAX_THROW_SPEED) {
  const recent = (samples || []).filter((s) => releaseTime - s.t <= THROW_SAMPLE_WINDOW_MS);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed < MIN_THROW_SPEED) return { vx: 0, vy: 0 };
  if (speed <= maxSpeed) return { vx, vy };
  return { vx: (vx / speed) * maxSpeed, vy: (vy / speed) * maxSpeed };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: PASS, including every pre-existing test in the file (no rng draw was added, so `seq([...])` parity holds).

- [ ] **Step 5: Write the failing `throwShape` test**

Append inside the existing `describe('useDoodleObjects', ...)` in `lib/useDoodleObjects.test.jsx`:

```js
it('throwShape replaces a shape velocity without moving it', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
  let shape;
  act(() => { shape = result.current.spawnShape(50, 60); });
  act(() => result.current.throwShape(shape.id, 400, -200));
  const thrown = result.current.objects.find((o) => o.id === shape.id);
  expect(thrown.vx).toBe(400);
  expect(thrown.vy).toBe(-200);
  expect(thrown.x).toBe(50);
  expect(thrown.y).toBe(60);
});

it('throwShape ignores strokes', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
  let id;
  act(() => { id = result.current.startStroke(0, 0); });
  act(() => result.current.throwShape(id, 400, 400));
  const stroke = result.current.objects.find((o) => o.id === id);
  expect(stroke.vx).toBeUndefined();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: FAIL — `result.current.throwShape is not a function`.

- [ ] **Step 7: Add the `throwShape` mutator**

In `lib/useDoodleObjects.js`, add immediately after `moveShape`:

```js
  // Flick-to-throw: moveShape rewrites position only, so a released shape
  // would otherwise resume the ambient drift it had before the grab. This is
  // the one mutator that writes velocity from a gesture.
  const throwShape = useCallback((id, vx, vy) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape' ? { ...o, vx, vy } : o
    )));
  }, [commit]);
```

Add `throwShape,` to the returned object, on the line after `moveShape,`.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS.

- [ ] **Step 9: Write the failing TuningPanel field test**

In `components/doodle/TuningPanel.test.jsx`, add `maxThrowSpeed: 600,` to the `baseTuning` object, and add this assertion to the end of the existing `'renders a number input for every tuning field with its current value'` test:

```js
    expect(getByLabelText('Max throw speed (px/s)').value).toBe('600');
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Max throw speed (px/s)`.

- [ ] **Step 11: Add the tuning field**

In `components/doodle/TuningPanel.jsx`, append to the `FIELDS` array:

```js
  {
    key: 'maxThrowSpeed', label: 'Max throw speed (px/s)', min: 0, max: 3000, step: 50,
  },
```

And add to the `TuningPanel.propTypes.tuning` shape, after `driftMax`:

```js
    maxThrowSpeed: PropTypes.number.isRequired,
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: PASS.

- [ ] **Step 13: Write the failing DoodleCanvas throw tests**

Append inside the existing `describe('DoodleCanvas', ...)` in `components/doodle/DoodleCanvas.test.jsx`. These assert the persisted velocity, following the existing `'never persists particles to localStorage'` test's fake-timer flush pattern. `vi.useFakeTimers()` also controls `Date.now()`, which is what drives the sample timestamps.

```js
  const persistedShape = () => {
    act(() => { vi.advanceTimersByTime(1000); }); // flush the persistence interval
    return JSON.parse(localStorage.getItem('doodle-objects')).find((o) => o.kind === 'shape');
  };

  // Spawns one shape, then drags it along `path`: pointerdown on the shape
  // group, moves on the stage — the pattern the existing drag tests use. A
  // pointerdown on the svg itself has no [data-id] ancestor, so it would
  // become an inert empty-canvas drag, never a shape drag. Each move sets the
  // fake clock so the drag samples carry distinct timestamps.
  const spawnAndDrag = (container, path) => {
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    path.forEach(({ x, y, t }) => {
      vi.setSystemTime(t);
      fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 2 });
    });
    return svg;
  };

  it('a flick release throws the shape along the flick direction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    // First move clears MOVE_THRESHOLD (8px) so the pointer becomes a drag;
    // then 60px in 30ms = 2000px/s raw, clamped down to maxThrowSpeed.
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 170, y: 100, t: 120 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBeGreaterThan(0);
    expect(shape.vy).toBeCloseTo(0);
    expect(Math.hypot(shape.vx, shape.vy)).toBeCloseTo(600); // DEFAULT_MAX_THROW_SPEED
    vi.useRealTimers();
  });

  it('a release after the finger stops moving parks the shape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 200, y: 100, t: 130 },
    ]);
    // Finger held still for 400ms: no pointermove fires, so every sample ages
    // out of the window that ends at the release.
    vi.setSystemTime(530);
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBe(0);
    expect(shape.vy).toBe(0);
    vi.useRealTimers();
  });

  it('pointercancel parks the shape instead of throwing it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = spawnAndDrag(container, [
      { x: 140, y: 100, t: 100 },
      { x: 200, y: 100, t: 130 },
    ]);
    vi.setSystemTime(135);
    fireEvent.pointerCancel(svg, { clientX: 200, clientY: 100, pointerId: 2 });

    const shape = persistedShape();
    expect(shape.vx).toBe(0);
    expect(shape.vy).toBe(0);
    vi.useRealTimers();
  });
```

- [ ] **Step 14: Run them to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — the thrown shape keeps its spawn drift velocity, so the clamp assertion misses and the park assertions get non-zero values.

- [ ] **Step 15: Wire sampling and release into `DoodleCanvas.jsx`**

a. Extend the `doodleShapes` import:

```js
import {
  MIN_SIZE, MAX_SIZE, DEFAULT_MAX_THROW_SPEED, THROW_SAMPLE_WINDOW_MS, throwVelocity,
} from '../../lib/doodleShapes';
```

b. Pull `throwShape` out of the hook alongside `moveShape`:

```js
  const {
    objects, spawnShape, startStroke, appendStrokePoint, moveShape, throwShape, transformShape, popShape, advance, clear,
  } = useDoodleObjects(rng);
```

c. Add to `DEFAULT_TUNING`, after `driftMax`:

```js
  maxThrowSpeed: DEFAULT_MAX_THROW_SPEED,
```

d. Add `samples: [],` to **all three** `pointersRef.current.set(...)` object literals in `onPointerDown` (the inert branch, the pinch branch, and the default branch at the end).

e. In `endPinchMember`, give the promoted pointer a fresh buffer — without it, the pinch-to-drag handoff releases against an undefined array:

```js
    if (other) {
      other.mode = 'drag';
      other.moved = true;
      other.startX = other.x;
      other.startY = other.y;
      other.samples = [];
    }
```

f. Replace the last two lines of `onPointerMove`:

```js
    if (p.mode === 'drag') {
      // Sample the drag so pointerup can derive a release velocity. Trimmed
      // to the window on every move so the buffer stays ~6 entries at 60Hz.
      const t = Date.now();
      p.samples = p.samples.filter((s) => t - s.t <= THROW_SAMPLE_WINDOW_MS);
      p.samples.push({ x: pt.x, y: pt.y, t });
      moveShape(p.shapeId, pt.x, pt.y);
    } else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
```

g. In `onPointerUp`, insert the throw branch after the `pinch-member` branch and before `if (p.moved) return;`:

```js
    if (p.mode === 'drag') {
      const { vx, vy } = throwVelocity(p.samples, Date.now(), tuningRef.current.maxThrowSpeed);
      throwShape(p.shapeId, vx, vy);
      return;
    }
```

h. In `onPointerCancel`, park a cancelled drag. A cancel is palm rejection or the OS reclaiming the touch, so it must not launch a shape:

```js
  const onPointerCancel = (e) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.delete(e.pointerId);
    if (p.mode === 'pinch-member') endPinchMember(p, e.pointerId);
    else if (p.mode === 'drag') throwShape(p.shapeId, 0, 0);
  };
```

- [ ] **Step 16: Run the full suite and lint**

Run: `npm test`
Expected: PASS, all files.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 17: Commit**

Draft the message with the `commit-message` skill, then:

```bash
git add lib/doodleShapes.js lib/doodleShapes.test.js lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx components/doodle/TuningPanel.jsx components/doodle/TuningPanel.test.jsx components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit
```

Subject: `feat(doodle): throw shapes with a flick release`. The body should record that release velocity is measured over a window ending at the release rather than over the last N samples, that `pointercancel` parks rather than throws, and that the clamp substitutes for damping the sandbox does not have.

---

### Task 2: Timbre per shapeType

**Files:**
- Modify: `lib/doodleSound.js`
- Modify: `lib/doodleSound.test.js`
- Modify: `lib/doodlePhysics.js:60-75` (the merge event push)
- Modify: `lib/doodlePhysics.test.js`
- Modify: `components/doodle/DoodleCanvas.jsx` (three `playNote` call sites)
- Modify: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `createDoodleSound()` from Task 0 (pre-existing), the merge event object from `resolveCollisions`.
- Produces:
  - `playNote(freq: number, shapeType?: string) => void` — `shapeType` is optional and falls back to `'sine'`, so existing single-argument calls keep working.
  - The `'merge'` event object gains `shapeType: string`.

- [ ] **Step 1: Write the failing timbre tests**

Append inside the existing `describe('doodleSound', ...)` in `lib/doodleSound.test.js`:

```js
  it('maps each shapeType to its own oscillator type', () => {
    const cases = [
      ['circle', 'sine'],
      ['square', 'square'],
      ['triangle', 'triangle'],
      ['star', 'sawtooth'],
    ];
    cases.forEach(([shapeType, expected]) => {
      const { osc } = installMockAudio();
      const sound = createDoodleSound();
      sound.playNote(440, shapeType);
      expect(osc.type).toBe(expected);
      vi.unstubAllGlobals();
    });
  });

  it('falls back to sine for a missing or unknown shapeType', () => {
    const { osc } = installMockAudio();
    const sound = createDoodleSound();
    sound.playNote(440);
    expect(osc.type).toBe('sine');
    sound.playNote(440, 'hexagon');
    expect(osc.type).toBe('sine');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/doodleSound.test.js`
Expected: FAIL — `expected 'sine' to be 'square'` on the mapping test.

- [ ] **Step 3: Add the map to `lib/doodleSound.js`**

Add above `export function createDoodleSound()`:

```js
// Each shape gets its own voice so a circle and a star at the same pitch are
// distinguishable by ear. The map lives here, not in DoodleCanvas: call sites
// pass a shapeType and never name an oscillator type.
const OSC_BY_SHAPE = {
  circle: 'sine',
  square: 'square',
  triangle: 'triangle',
  star: 'sawtooth',
};
```

Replace the `playNote` line in the returned object:

```js
    playNote: (freq, shapeType) => tone(freq, {
      type: OSC_BY_SHAPE[shapeType] || 'sine', duration: 0.35, gain: 0.2,
    }),
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/doodleSound.test.js`
Expected: PASS, including the pre-existing `playNote(440)` test, which still gets `sine`.

- [ ] **Step 5: Write the failing merge-event test**

Append inside the existing top-level `describe` in `lib/doodlePhysics.test.js`:

```js
  it('the merge event carries the merged shapeType so the caller can pick a timbre', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', shapeType: 'square',
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: 20, color: '#2a9d8f', shapeType: 'square',
    });
    const { shapes, events } = resolveCollisions([a, b], null, () => 0.1);
    expect(events[0].type).toBe('merge');
    expect(events[0].shapeType).toBe(shapes[0].shapeType);
    expect(events[0].shapeType).toBe('square');
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/doodlePhysics.test.js`
Expected: FAIL — `expected undefined to be 'square'`.

- [ ] **Step 7: Add `shapeType` to the merge event**

In `lib/doodlePhysics.js`, inside the `events.push({ type: 'merge', ... })` call, add after `color: result.color,`:

```js
                  shapeType: result.shapeType,
```

`result` is the already-computed `mergeShapes(a, b, rng)` return value, so this reads an existing field and adds no `rng()` draw.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run lib/doodlePhysics.test.js`
Expected: PASS.

- [ ] **Step 9: Write the failing DoodleCanvas threading test**

Append inside `describe('DoodleCanvas', ...)` in `components/doodle/DoodleCanvas.test.jsx`:

```js
  it('passes the shape type to playNote on spawn and on tap', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });

    const [, spawnType] = sound.playNote.mock.calls[0];
    expect(['circle', 'square', 'triangle', 'star']).toContain(spawnType);

    // Tap the shape itself: a pointerdown on the svg has no [data-id]
    // ancestor and would spawn a second shape instead of tapping this one.
    sound.playNote.mockClear();
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    const [, tapType] = sound.playNote.mock.calls[0];
    expect(tapType).toBe(spawnType);
  });

  it('passes the merged shape type to playNote on a merge chime', () => {
    const sound = mockSound();
    const rng = seq([0, 0, 0, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    sound.playNote.mockClear();

    act(() => { cbs[cbs.length - 1](16); });

    expect(sound.playNote).toHaveBeenCalledTimes(1);
    const [, mergeType] = sound.playNote.mock.calls[0];
    expect(['circle', 'square', 'triangle', 'star']).toContain(mergeType);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });
```

- [ ] **Step 10: Run them to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — `expected [...] to contain undefined`; `playNote` is still called with one argument.

- [ ] **Step 11: Thread `shapeType` through all three call sites**

In `components/doodle/DoodleCanvas.jsx`:

a. In the rAF loop's merge branch:

```js
            soundRef.current.playNote(event.note, event.shapeType);
```

b. In `handleShapeTap`, the non-pop path:

```js
      soundRef.current.playNote(shape.note, shape.shapeType);
```

c. In `onPointerUp`'s spawn branch:

```js
      soundRef.current.playNote(shape.note, shape.shapeType);
```

- [ ] **Step 12: Run them to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS.

- [ ] **Step 13: Run the full suite and lint**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 14: Commit**

```bash
git add lib/doodleSound.js lib/doodleSound.test.js lib/doodlePhysics.js lib/doodlePhysics.test.js components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit
```

Subject: `feat(doodle): give each shape type its own timbre`. The body should note that `playNote`'s second parameter is optional so existing calls keep the sine default, and that the merge event gained `shapeType` because it was the one call site with no shape in scope.

---

### Task 3: Haptics

**Files:**
- Create: `lib/doodleHaptics.js`
- Create: `lib/doodleHaptics.test.js`
- Modify: `components/doodle/DoodleCanvas.jsx`
- Modify: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: the `'bounce'` and `'merge'` events from `advance()`, and the pop branch of `handleShapeTap`.
- Produces:
  - `createDoodleHaptics() => { vibrate(kind: 'pop' | 'merge' | 'bounce'): boolean, setMuted(value: boolean): void }`. `vibrate` returns `true` only when it actually called `navigator.vibrate`, which is what makes the rate limit testable.
  - `PATTERNS: Record<string, number[]>` and `MIN_INTERVAL_MS: Record<string, number>` exported for tests.

- [ ] **Step 1: Write the failing haptics tests**

Create `lib/doodleHaptics.test.js`:

```js
import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { createDoodleHaptics, PATTERNS, MIN_INTERVAL_MS } from './doodleHaptics';

// jsdom has no navigator.vibrate, so define it per test rather than stubbing
// the whole navigator object.
function installVibrate() {
  const vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  return vibrate;
}

afterEach(() => {
  delete navigator.vibrate;
  vi.restoreAllMocks();
});

describe('doodleHaptics', () => {
  it('vibrates with the pattern for the event kind', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('pop')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(PATTERNS.pop);
  });

  it('no-ops when navigator.vibrate is unavailable', () => {
    const haptics = createDoodleHaptics();
    expect(() => haptics.vibrate('pop')).not.toThrow();
    expect(haptics.vibrate('pop')).toBe(false);
  });

  it('never throws when navigator.vibrate throws', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => { throw new Error('blocked'); },
      configurable: true,
    });
    const haptics = createDoodleHaptics();
    expect(() => haptics.vibrate('pop')).not.toThrow();
    expect(haptics.vibrate('pop')).toBe(false);
  });

  it('ignores an unknown kind', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('explode')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('rate-limits bounce on the wall clock, not on call count', () => {
    const vibrate = installVibrate();
    const now = vi.spyOn(Date, 'now');
    const haptics = createDoodleHaptics();

    now.mockReturnValue(1000);
    expect(haptics.vibrate('bounce')).toBe(true);
    // 50 more bounce pairs in the same frame: resolveCollisions emits one
    // event per colliding pair, so this is the spam case.
    for (let i = 0; i < 50; i += 1) expect(haptics.vibrate('bounce')).toBe(false);

    now.mockReturnValue(1000 + MIN_INTERVAL_MS.bounce - 1);
    expect(haptics.vibrate('bounce')).toBe(false);
    now.mockReturnValue(1000 + MIN_INTERVAL_MS.bounce);
    expect(haptics.vibrate('bounce')).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('never rate-limits pop, which is already gated by the double-tap', () => {
    installVibrate();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('pop')).toBe(true);
    expect(haptics.vibrate('pop')).toBe(true);
    expect(now).toHaveBeenCalled();
  });

  it('gates each kind independently so a bounce never suppresses a merge', () => {
    installVibrate();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('bounce')).toBe(true);
    expect(haptics.vibrate('merge')).toBe(true);
  });

  it('stays silent while muted', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    haptics.setMuted(true);
    expect(haptics.vibrate('pop')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    haptics.setMuted(false);
    expect(haptics.vibrate('pop')).toBe(true);
  });

  it('keeps every pattern shorter than its own gate so patterns never truncate each other', () => {
    // navigator.vibrate() replaces the running vibration rather than queueing.
    Object.keys(PATTERNS).forEach((kind) => {
      const total = PATTERNS[kind].reduce((sum, ms) => sum + ms, 0);
      if (MIN_INTERVAL_MS[kind] > 0) expect(total).toBeLessThan(MIN_INTERVAL_MS[kind]);
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/doodleHaptics.test.js`
Expected: FAIL — cannot resolve `./doodleHaptics`.

- [ ] **Step 3: Create `lib/doodleHaptics.js`**

```js
// Touch feedback for the doodle sandbox, mirroring doodleSound.js: every
// access is guarded so a missing API or a blocked call degrades to a silent
// no-op instead of throwing.
//
// Platform note: the Vibration API is a W3C spec implemented by Blink and
// Gecko, not by WebKit. That is an engine gap, not an OS one — WebKit on any
// platform lacks it. Because iOS forces every browser onto WebKit, this is an
// Android-only feature in practice, and feature-detects away elsewhere.

// Short and distinct per kind. A pop is the only one with texture (two
// pulses) because it is the rarest and most deliberate.
export const PATTERNS = {
  pop: [18, 30, 18],
  merge: [25],
  bounce: [10],
};

// Wall-clock minimum between vibrations of the same kind. resolveCollisions
// emits one bounce event per colliding pair per frame, so an unguarded call
// buzzes continuously once there are a few shapes. Coalescing per rAF tick
// would bound the work but not the rate — a tick is a frame, so the ceiling
// would be 60/s on one device and 120/s on another. A wall-clock gate is
// O(1) per event and independent of both frame rate and shape count.
//
// pop is ungated: a double-tap is already human-rate-limited, and it is the
// one event that must never be swallowed. Each pattern above is shorter than
// its own gate, because navigator.vibrate() replaces the running vibration
// rather than queueing it.
export const MIN_INTERVAL_MS = {
  pop: 0,
  merge: 40,
  bounce: 100,
};

// eslint-disable-next-line import/prefer-default-export
export function createDoodleHaptics() {
  let muted = false;
  const lastAt = { pop: 0, merge: 0, bounce: 0 };

  return {
    // Returns true only when navigator.vibrate was actually called.
    vibrate: (kind) => {
      if (muted) return false;
      const pattern = PATTERNS[kind];
      if (!pattern) return false;
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
      const now = Date.now();
      if (now - lastAt[kind] < MIN_INTERVAL_MS[kind]) return false;
      try {
        navigator.vibrate(pattern);
      } catch {
        return false; // vibration blocked by policy — stay silent, no crash
      }
      lastAt[kind] = now;
      return true;
    },
    setMuted: (value) => {
      muted = value;
    },
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/doodleHaptics.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing DoodleCanvas haptics tests**

First, make the stubbed API self-cleaning. Add `afterEach` to the vitest import at the top of `components/doodle/DoodleCanvas.test.jsx` and, next to the existing top-level `beforeEach`, add:

```js
afterEach(() => {
  delete navigator.vibrate;
});
```

Then append inside `describe('DoodleCanvas', ...)`:

```jsx
  // jsdom has no navigator.vibrate, so define it per test rather than
  // stubbing the whole navigator object.
  const installVibrate = () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    return vibrate;
  };

  // Spawns one shape and double-taps it to pop. rng high so the shape is
  // large enough to split, matching the existing pop tests. pointerdown and
  // pointerup both fire on the shape group — a pointerdown on the svg has no
  // [data-id] ancestor and would spawn another shape instead of tapping this
  // one. Both taps land inside DOUBLE_TAP_MS (300ms) because fireEvent is
  // synchronous under real timers.
  const spawnAndPop = (container) => {
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 3 });
  };

  it('vibrates on a pop', () => {
    const vibrate = installVibrate();
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={mockSound()} />);
    spawnAndPop(container);
    expect(vibrate).toHaveBeenCalled();
  });

  it('stays silent on a pop while muted', () => {
    const vibrate = installVibrate();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.99])} sound={mockSound()} />,
    );
    fireEvent.click(getByLabelText('Mute'));
    spawnAndPop(container);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('runs without navigator.vibrate', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={mockSound()} />);
    expect(() => spawnAndPop(container)).not.toThrow();
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — `expected "spy" to be called at least once`.

- [ ] **Step 7: Wire haptics into `DoodleCanvas.jsx`**

a. Import it next to the sound import:

```js
import { createDoodleHaptics } from '../../lib/doodleHaptics';
```

b. Add a ref next to `soundRef`:

```js
  const hapticsRef = useRef(null);
  if (hapticsRef.current === null) hapticsRef.current = createDoodleHaptics();
```

c. In the existing mute-persistence effect, drive haptics from the same flag — vibration is audible on a hard surface, so muting in public means both:

```js
  useEffect(() => {
    soundRef.current.setMuted(muted);
    hapticsRef.current.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // ignore — preference just won't persist
    }
  }, [muted]);
```

d. In the rAF loop's event handling:

```js
          if (event.type === 'bounce') {
            addParticles(spawnBurst(event.x, event.y, event.color, event.normal, COLLISION_BURST_MAX_AGE));
            hapticsRef.current.vibrate('bounce');
          } else if (event.type === 'merge') {
            addParticles(spawnSpiral(event.fromX, event.fromY, event.x, event.y, event.color));
            soundRef.current.playNote(event.note, event.shapeType);
            hapticsRef.current.vibrate('merge');
          }
```

e. In `handleShapeTap`'s pop branch, after `soundRef.current.playPop();`:

```js
      hapticsRef.current.vibrate('pop');
```

- [ ] **Step 8: Run them to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS.

- [ ] **Step 9: Run the full suite and lint**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add lib/doodleHaptics.js lib/doodleHaptics.test.js components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit
```

Subject: `feat(doodle): add haptic feedback for pop, merge and bounce`. The body **must** state the gating decision explicitly — haptics follow the existing mute toggle rather than getting their own control — and should record that the rate limit is wall-clock per event kind rather than per rAF tick, and that WebKit's lack of the Vibration API makes this Android-only in practice.

---

### Task 4: Slow-mo / freeze toggle

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Modify: `components/doodle/DoodleCanvas.test.jsx`
- Modify: `components/doodle/doodle.module.css` (`.toolbar` wrap)

**Interfaces:**
- Consumes: the rAF `tick` closure, `advanceParticles`, `advance`.
- Produces: `TIME_SCALE_KEY = 'doodle-time-scale'`, `TIME_SCALES = [1, 0.25, 0]`, and a sixth toolbar button. No exported API.

- [ ] **Step 1: Write the failing slow-mo tests**

Append inside `describe('DoodleCanvas', ...)` in `components/doodle/DoodleCanvas.test.jsx`:

```js
  it('cycles the toolbar speed button through slow motion, freeze and normal', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Slow motion'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('0.25');
    fireEvent.click(getByLabelText('Freeze'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('0');
    fireEvent.click(getByLabelText('Normal speed'));
    expect(localStorage.getItem('doodle-time-scale')).toBe('1');
  });

  it('restores a stored slow-motion choice but never opens frozen', () => {
    localStorage.setItem('doodle-time-scale', '0.25');
    const { getByLabelText, unmount } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Freeze')).toBeInTheDocument(); // next action from 0.25
    unmount();

    localStorage.setItem('doodle-time-scale', '0');
    const second = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    // A child cannot diagnose why nothing moves, so a stored freeze opens at 1.
    expect(second.getByLabelText('Slow motion')).toBeInTheDocument();
  });

  it('freezing stops the shape moving but leaves pointer interaction working', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    fireEvent.click(getByLabelText('Slow motion'));
    fireEvent.click(getByLabelText('Freeze'));

    const before = shapeGroups(container)[0].getAttribute('transform');
    act(() => { cbs[cbs.length - 1](16); });
    act(() => { cbs[cbs.length - 1](32); });
    expect(shapeGroups(container)[0].getAttribute('transform')).toBe(before);
    // No dust accumulates either: advanceParticles(p, 0) would age nothing,
    // so the tick must skip the body rather than pass a zero delta.
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(0);

    // Pointer interaction still works while frozen.
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('keeps advancing shapes at normal speed', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    const before = shapeGroups(container)[0].getAttribute('transform');
    act(() => { cbs[cbs.length - 1](16); });
    expect(shapeGroups(container)[0].getAttribute('transform')).not.toBe(before);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Slow motion`.

- [ ] **Step 3: Add the time-scale state and persistence**

In `components/doodle/DoodleCanvas.jsx`:

a. Next to the other storage keys:

```js
const TIME_SCALE_KEY = 'doodle-time-scale';
// Multipliers applied to the frame delta, cycled by the toolbar button.
const TIME_SCALES = [1, 0.25, 0];
// Keyed by the current scale; like the mode and mute buttons, the label names
// what a click does next, not the current state.
const TIME_SCALE_LABELS = { 1: 'Slow motion', 0.25: 'Freeze', 0: 'Normal speed' };
const TIME_SCALE_ICONS = { 1: '▶️', 0.25: '🐢', 0: '⏸️' };
```

b. Next to the other preference state:

```js
  const [timeScale, setTimeScale] = useState(1);
  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;
```

c. Load and persist, alongside the other preference effects:

```js
  // Load + persist the slow-motion choice. A stored freeze (0) is coerced
  // back to 1: the app must never open frozen, because a kid cannot work out
  // why nothing moves.
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(TIME_SCALE_KEY));
      if (TIME_SCALES.includes(stored) && stored !== 0) setTimeScale(stored);
    } catch {
      // ignore — default to normal speed
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TIME_SCALE_KEY, String(timeScale));
    } catch {
      // ignore — preference just won't persist
    }
  }, [timeScale]);
```

Note `Number(null)` is `0`, which `stored !== 0` already rejects, so an absent key falls through to the default.

- [ ] **Step 4: Apply the scale in the rAF tick**

Replace the first two lines of the `tick` body:

```js
    const tick = (now) => {
      const rawDt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      // A frozen canvas skips the whole body rather than advancing with a
      // zero delta. Two parts of this loop are not dt-driven, so dt === 0
      // does not actually freeze anything: resolveCollisions is purely
      // positional, so already-overlapping shapes keep merging and
      // position-correcting; and dust spawning is gated on vx/vy, which a
      // zero delta never changes, while advanceParticles(p, 0) ages nothing
      // and its age < maxAge filter drops nothing — so particles pile up to
      // maxParticles and never expire. `last` is still updated above, or
      // unfreezing would feed one huge delta.
      if (timeScaleRef.current === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = rawDt * timeScaleRef.current;
```

The rest of the body is unchanged and already reads `dt`.

- [ ] **Step 5: Add the toolbar button**

In the toolbar `<div>`, after the trails button and before the tuning button. The `aria-label` names the next action, matching the mode and mute buttons:

```jsx
        <button
          type="button"
          className={styles.toolButton}
          aria-label={TIME_SCALE_LABELS[timeScale]}
          onClick={() => setTimeScale(
            (t) => TIME_SCALES[(TIME_SCALES.indexOf(t) + 1) % TIME_SCALES.length],
          )}
        >
          {TIME_SCALE_ICONS[timeScale]}
        </button>
```

- [ ] **Step 6: Let the toolbar wrap**

In `components/doodle/doodle.module.css`, add to the `.toolbar` rule:

```css
  flex-wrap: wrap;
```

Six 48 px buttons plus five 8 px gaps is 328 px — fine on a 375 px phone, over the edge on a 320 px one.

- [ ] **Step 7: Run them to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx components/doodle/doodle.module.css.test.js`
Expected: PASS. The CSS test matches on regexes for the 768px breakpoint and the `.toolButton` sizes, so the added `flex-wrap` does not affect it.

- [ ] **Step 8: Run the full suite and lint**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx components/doodle/doodle.module.css
git commit
```

Subject: `feat(doodle): add a slow-motion and freeze toggle`. The body should record why freeze skips the tick body instead of passing a zero delta (`resolveCollisions` is positional and dust spawning is velocity-gated, so a zero delta merges shapes and accumulates immortal particles), and why a stored freeze is coerced back to normal speed on load.

---

### Task 5: Pull request description

- [ ] **Step 1: Confirm the branch is clean and all four commits are present**

```bash
git log --oneline origin/master..HEAD
git status --short
```

Expected: exactly four commits in order (flick-throw, timbre, haptics, slow-mo), clean working tree.

- [ ] **Step 2: Draft the PR description**

Use the `pr-description` skill, aggregating across all four commits and pruning for concision. Keep it at spec level — what changed and why — not a diff narration.

- [ ] **Step 3: Push**

```bash
git push -u origin claude/peaceful-mayer-mimq7j
```

Do not open the PR unless the user asks for one.
