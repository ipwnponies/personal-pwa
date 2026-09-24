# Doodle Gravity Well Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holding one finger still on empty canvas in shape mode opens a gravity well that accelerates nearby shapes toward it until the finger lifts.

**Architecture:** Three separable pieces. A pure force function in `lib/doodleWell.js` that turns one shape plus one well into a new velocity. A gesture recogniser derived inside the existing `requestAnimationFrame` loop in `DoodleCanvas.jsx`, with no `setTimeout` — every pointer entry already carries `downTime`, and the loop already runs every frame. An SVG overlay component that layers like `Particles` does: a plain sibling, last inside the canvas `<svg>`, reading a ref rather than React state.

**Tech Stack:** React 18 (JavaScript, no TypeScript), SVG, Vitest + jsdom + React Testing Library, ESLint Airbnb + Prettier, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-18-doodle-gravity-well-design.md`

## Global Constraints

- **No new dependencies.** Do not touch `package.json` or `package-lock.json`. This feature needs nothing that is not already installed.
- **JavaScript only.** No TypeScript files. `prop-types` for React prop validation, functional components with hooks.
- **Any file containing JSX needs a `.jsx` extension**, including tests. Vitest's JSX transform errors on a plain `.js` file containing JSX.
- **Tests co-locate next to the source file** they test. Never under `pages/`.
- **`npm test` and `npm run lint` must both be green** at every commit.
- Commit scope is `doodle`, from the `scope:` frontmatter in `.claude/rules/doodle.md`. Conventional Commits shape.
- **Do not change `resolveCollisions`, `advanceShape`, the merge rules, or the pinch/drag/tap state machine.** The well adds velocity before integration; everything downstream stays untouched.
- **No `rng` parameter anywhere in this feature.** Nothing here is random. Adding an `rng()` draw would shift every `seq([...])` expectation in `lib/doodle*.test.js` and `DoodleCanvas.test.jsx`, breaking tests far from the change.
- Target audience is young children: forgiving gesture thresholds, immediate feedback.
- Default tuning values in this plan are starting points, not tuned numbers. Tuning them on a device is why they are in the tuning panel.

## Spec Deviations

Four defects in the spec surfaced while writing executable code against the
merged `master` (`c79dc24`). The plan implements the corrected behavior. Each
is called out again at the step that depends on it.

| # | Spec says | Why it is wrong | Plan does |
| --- | --- | --- | --- |
| 1 | Eligibility requires `mode === null` and `moved === false` | Engage itself sets `mode = 'well'` and `moved = true`, so the very next frame fails eligibility and cancels the well it just opened | Eligibility accepts `mode === 'well'` (already open) **or** `mode === null && !moved` (still charging) |
| 2 | The engaged ring carries the existing `styles.pulse` class | `.pulse` is `animation: doodlePulse 300ms ease` — a one-shot tap animation. React keeps the same DOM node across frames, so it fires once and stops; the ring would not pulse | New `.wellRing` class reusing the `doodlePulse` keyframes at `1.2s ease-in-out infinite` |
| 3 | `<Well well progress radius />` | The render rule "nothing while `progress * wellHoldMs < WELL_CHARGE_VISIBLE_MS`" needs `wellHoldMs`, which that signature does not pass | Adds a `holdMs` prop, keeping the threshold rule inside the component where it is testable |
| 4 | Movement past `MOVE_THRESHOLD` cancels | Engage sets `moved = true`, which bypasses the handler's threshold logic entirely, so any 1 px jitter would cancel an open well. A held toddler finger jitters | The `mode === 'well'` branch measures against `startX`/`startY` and applies `MOVE_THRESHOLD` itself |

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/doodleWell.js` | New. `applyWell` plus the four `DEFAULT_WELL_*` constants and `MIN_WELL_DISTANCE`. Pure, no React, no rng. |
| `lib/doodleWell.test.js` | New. Force math, falloff, clamp, degenerate inputs. |
| `lib/doodleSound.js` | Gains `playWell()`. |
| `lib/doodleSound.test.js` | Coverage for `playWell()`. |
| `lib/useDoodleObjects.js` | `advance` gains a fourth parameter, `well`. |
| `lib/useDoodleObjects.test.jsx` | Coverage for the new parameter. |
| `components/doodle/Well.jsx` | New. Charging ring and engaged ring. |
| `components/doodle/Well.test.jsx` | New. |
| `components/doodle/doodle.module.css` | New `.wellRing` class. |
| `components/doodle/TuningPanel.jsx` | Four new `FIELDS` rows. |
| `components/doodle/TuningPanel.test.jsx` | Coverage for the new rows. |
| `components/doodle/DoodleCanvas.jsx` | Four `DEFAULT_TUNING` keys, `wellRef`, frame-loop recognition, cancel paths, render `<Well>`, `playWell` in propTypes. |
| `components/doodle/DoodleCanvas.test.jsx` | Gesture coverage; `mockSound()` gains `playWell`. |
| `.claude/rules/doodle.md` | Two entries added to the layout list. |

Tasks 1 through 5 are each independently green and touch no shared behavior.
Task 6 is the only one that changes the gesture state machine. Task 7 is
documentation plus a history tidy.

---

### Task 1: Pure gravity-well force

**Files:**
- Create: `lib/doodleWell.js`
- Test: `lib/doodleWell.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `applyWell(shape, well, dtSeconds, radius, strength, maxSpeed) -> shape`, returning the *same object reference* when unaffected and a new object when accelerated. Also `DEFAULT_WELL_RADIUS` (200), `DEFAULT_WELL_STRENGTH` (600), `DEFAULT_WELL_MAX_SPEED` (400), `DEFAULT_WELL_HOLD_MS` (800), `MIN_WELL_DISTANCE` (1). Task 3 calls `applyWell`; Task 5 imports the four `DEFAULT_WELL_*` constants.

- [ ] **Step 1: Write the failing test**

Create `lib/doodleWell.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  applyWell,
  DEFAULT_WELL_MAX_SPEED,
  DEFAULT_WELL_RADIUS,
  DEFAULT_WELL_STRENGTH,
  MIN_WELL_DISTANCE,
} from './doodleWell';

const shapeAt = (x, y, vx = 0, vy = 0) => ({
  id: 's1', kind: 'shape', x, y, vx, vy, size: 28, color: '#f00',
});

describe('applyWell', () => {
  it('returns the same shape object when there is no well', () => {
    const shape = shapeAt(100, 100);
    expect(applyWell(shape, null, 0.016)).toBe(shape);
  });

  it('returns the same shape object for a shape beyond the radius', () => {
    const shape = shapeAt(400, 0);
    expect(applyWell(shape, { x: 0, y: 0 }, 0.5, 200, 600)).toBe(shape);
  });

  it('adds strength * (1 - d/radius) * dt at half radius', () => {
    // d = 100, radius 200 -> falloff 0.5. strength 600 * 0.5 * dt 0.5 = 150,
    // directed at the well, which sits on the -x side. Default maxSpeed 400
    // is above 150, so nothing clamps.
    const pulled = applyWell(shapeAt(100, 0), { x: 0, y: 0 }, 0.5, 200, 600);
    expect(pulled.vx).toBeCloseTo(-150, 6);
    expect(pulled.vy).toBeCloseTo(0, 6);
  });

  it('accelerates a shape near the center far harder than one near the rim', () => {
    const well = { x: 0, y: 0 };
    const near = applyWell(shapeAt(10, 0), well, 0.5, 200, 600);
    const rim = applyWell(shapeAt(199, 0), well, 0.5, 200, 600);
    expect(Math.abs(near.vx)).toBeGreaterThan(Math.abs(rim.vx) * 10);
    expect(Math.abs(rim.vx)).toBeLessThan(2); // falloff is 0.005 at the rim
  });

  it('points the acceleration at the well from every direction', () => {
    const well = { x: 500, y: 500 };
    const left = applyWell(shapeAt(400, 500), well, 0.1, 200, 600);
    const right = applyWell(shapeAt(600, 500), well, 0.1, 200, 600);
    const above = applyWell(shapeAt(500, 400), well, 0.1, 200, 600);
    const below = applyWell(shapeAt(500, 600), well, 0.1, 200, 600);
    expect(left.vx).toBeGreaterThan(0);
    expect(right.vx).toBeLessThan(0);
    expect(above.vy).toBeGreaterThan(0);
    expect(below.vy).toBeLessThan(0);
  });

  it('clamps the resulting speed to maxSpeed and keeps the direction', () => {
    // Shape at (60, 80) from a well at the origin: d = 100, radius 200 ->
    // falloff 0.5, strength 3000 * 0.5 * dt 1 = 1500 along (-0.6, -0.8), so
    // (-900, -1200) at speed 1500. Clamped to 100 that is exactly (-60, -80).
    const pulled = applyWell(shapeAt(60, 80), { x: 0, y: 0 }, 1, 200, 3000, 100);
    expect(Math.hypot(pulled.vx, pulled.vy)).toBeCloseTo(100, 6);
    expect(pulled.vx).toBeCloseTo(-60, 6);
    expect(pulled.vy).toBeCloseTo(-80, 6);
  });

  it('leaves a shape sitting exactly on the well point alone, with no NaN', () => {
    const shape = shapeAt(500, 500, 7, -3);
    const result = applyWell(shape, { x: 500, y: 500 }, 0.5, 200, 600);
    expect(result).toBe(shape);
    expect(Number.isNaN(result.vx)).toBe(false);
    expect(Number.isNaN(result.vy)).toBe(false);
  });

  it('leaves a shape inside MIN_WELL_DISTANCE alone', () => {
    const shape = shapeAt(500, 500 + MIN_WELL_DISTANCE / 2);
    expect(applyWell(shape, { x: 500, y: 500 }, 0.5, 200, 600)).toBe(shape);
  });

  it('is inert at radius 0 rather than dividing by zero', () => {
    const shape = shapeAt(100, 100);
    const result = applyWell(shape, { x: 0, y: 0 }, 0.5, 0, 600);
    expect(result).toBe(shape);
  });

  it('is inert at strength 0 while still returning finite velocities', () => {
    const pulled = applyWell(shapeAt(100, 0, 5, 5), { x: 0, y: 0 }, 0.5, 200, 0);
    expect(pulled.vx).toBeCloseTo(5, 6);
    expect(pulled.vy).toBeCloseTo(5, 6);
  });

  it('exposes the documented defaults', () => {
    expect(DEFAULT_WELL_RADIUS).toBe(200);
    expect(DEFAULT_WELL_STRENGTH).toBe(600);
    expect(DEFAULT_WELL_MAX_SPEED).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/doodleWell.test.js`
Expected: FAIL. The module does not exist, so every test errors on the import.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/doodleWell.js`:

```js
// Long-press gravity well force. Pure: one shape plus one well in, a new
// velocity out. No rng — nothing here is random, so the rng-threading
// convention in .claude/rules/doodle.md does not apply and no seq([...])
// expectation elsewhere shifts.
//
// Linear falloff, not inverse-square. Inverse-square needs an epsilon and a
// cap to dodge the singularity at the center, and leaves most shapes sitting
// in a weak far tail where nothing visible happens. Linear has a natural zero
// at the rim, no singularity, and reads correctly to a child: closer means
// faster, evenly.

export const DEFAULT_WELL_RADIUS = 200; // px
export const DEFAULT_WELL_STRENGTH = 600; // px/s^2 at the center
export const DEFAULT_WELL_MAX_SPEED = 400; // px/s
export const DEFAULT_WELL_HOLD_MS = 800; // ms of stillness before the well engages

// Inside this distance the direction toward the well is undefined, so the
// shape is left alone rather than divided by a near-zero magnitude. A
// gesture-level guard like MOVE_THRESHOLD, not a feel knob, so it stays out of
// the tuning panel.
export const MIN_WELL_DISTANCE = 1; // px

// Shapes have no damping anywhere in the sandbox — advanceShape's wall bounce
// flips a velocity's sign and keeps its magnitude exactly, and RESTITUTION
// only applies on shape-to-shape impact — so without maxSpeed every well
// would permanently raise the canvas's energy.
export function applyWell(
  shape,
  well,
  dtSeconds,
  radius = DEFAULT_WELL_RADIUS,
  strength = DEFAULT_WELL_STRENGTH,
  maxSpeed = DEFAULT_WELL_MAX_SPEED,
) {
  if (!well) return shape;
  const dx = well.x - shape.x;
  const dy = well.y - shape.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius || d < MIN_WELL_DISTANCE) return shape;
  const accel = strength * (1 - d / radius) * dtSeconds;
  let vx = shape.vx + (dx / d) * accel;
  let vy = shape.vy + (dy / d) * accel;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    vx = (vx / speed) * maxSpeed;
    vy = (vy / speed) * maxSpeed;
  }
  return { ...shape, vx, vy };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/doodleWell.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors. `lib/doodleWell.js` has multiple named exports, so Airbnb's `import/prefer-default-export` does not fire and needs no disable comment.

- [ ] **Step 6: Commit**

```bash
git add lib/doodleWell.js lib/doodleWell.test.js
git commit -m "feat(doodle): add a linear-falloff gravity-well force function"
```

---

### Task 2: Engage sound

**Files:**
- Modify: `lib/doodleSound.js` (the returned object, beside `playPop`)
- Test: `lib/doodleSound.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `playWell()` on the object `createDoodleSound()` returns. Task 6 calls `soundRef.current.playWell()` at engage and adds `playWell` to `DoodleCanvas.propTypes.sound`.

Why not `playNote(110)`: `playNote` now takes `(freq, shapeType)` and uses the
second argument to pick an oscillator for per-shape timbre. A well is not a
shape and has no `shapeType`, so calling `playNote` with a bare frequency
would rely on that lookup falling through to its `'sine'` default. A named
method keeps the pitch and the voice beside the other non-shape sounds.

- [ ] **Step 1: Write the failing test**

Add to `lib/doodleSound.test.js`, inside the existing `describe('doodleSound')`:

```js
  it('playWell plays one low sine tone', () => {
    const { createOscillator, osc } = installMockAudio();
    const sound = createDoodleSound();
    sound.playWell();
    expect(createOscillator).toHaveBeenCalledTimes(1);
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.frequency.value).toBe(110);
    expect(osc.type).toBe('sine');
  });
```

In the same file, extend the existing `'does not play while muted'` test so the
mute gate covers the new method too. Replace its body's call block:

```js
    sound.playNote(440);
    sound.playPop();
    sound.playStroke();
    sound.playWell();
    expect(createOscillator).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/doodleSound.test.js`
Expected: FAIL with `sound.playWell is not a function`, on both tests.

- [ ] **Step 3: Write the minimal implementation**

In `lib/doodleSound.js`, add one line to the returned object, directly after
the `playPop` entry:

```js
    playWell: () => tone(110, { type: 'sine', duration: 0.4, gain: 0.15 }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/doodleSound.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green. Adding a method to the returned object breaks nothing:
`DoodleCanvas.propTypes.sound` validates only the keys it lists, and the test
mock in `DoodleCanvas.test.jsx` is not yet required to carry `playWell`
because nothing calls it until Task 6.

- [ ] **Step 6: Commit**

```bash
git add lib/doodleSound.js lib/doodleSound.test.js
git commit -m "feat(doodle): add a low well-engage tone to the sound synth"
```

---

### Task 3: Thread the well through `advance`

**Files:**
- Modify: `lib/useDoodleObjects.js` (the `advance` callback, around line 131)
- Test: `lib/useDoodleObjects.test.jsx`

**Interfaces:**
- Consumes: `applyWell` from Task 1.
- Produces: `advance(dtSeconds, bounds, grabbedIds, well = null)`, where `well` is `null` or `{ x, y, radius, strength, maxSpeed }`. Task 6 passes the fourth argument.

The feel bundle did not change this signature, so the fourth positional
parameter is free and no options object is needed. Defaulting it to `null`
keeps all existing three-argument call sites working untouched.

- [ ] **Step 1: Write the failing test**

Add to `lib/useDoodleObjects.test.jsx`, inside the existing `describe('useDoodleObjects')`:

```js
  it('advance accelerates a shape toward an open well', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    // d = 200 from the well at x 500, radius 400 -> falloff 0.5.
    // strength 600 * 0.5 * dt 0.1 = 30 px/s, straight along +x.
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      null,
      { x: 500, y: 500, radius: 400, strength: 600, maxSpeed: 400 },
    ));
    const pulled = result.current.objects.find((o) => o.id === shape.id);
    expect(pulled.vx).toBeCloseTo(shape.vx + 30, 6);
    expect(pulled.vy).toBeCloseTo(shape.vy, 6);
  });

  it('advance leaves a shape outside the well radius alone', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(100, 500); });
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      null,
      { x: 500, y: 500, radius: 200, strength: 600, maxSpeed: 400 },
    ));
    const untouched = result.current.objects.find((o) => o.id === shape.id);
    expect(untouched.vx).toBeCloseTo(shape.vx, 6);
    expect(untouched.vy).toBeCloseTo(shape.vy, 6);
  });

  it('advance skips the well for a grabbed shape', () => {
    // A grabbed shape is already infinite mass to resolveCollisions and has
    // its position restored afterwards, so a force applied to it would be
    // discarded anyway. In practice the set is empty during a well, because a
    // second pointer cancels it; the check keeps advance correct on its own.
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    act(() => result.current.advance(
      0.1,
      { width: 1000, height: 1000 },
      new Set([shape.id]),
      { x: 500, y: 500, radius: 400, strength: 600, maxSpeed: 400 },
    ));
    const held = result.current.objects.find((o) => o.id === shape.id);
    expect(held.vx).toBe(shape.vx);
    expect(held.vy).toBe(shape.vy);
  });

  it('advance with no well argument behaves as it did before', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0])));
    let shape;
    act(() => { shape = result.current.spawnShape(300, 500); });
    act(() => result.current.advance(0.1, { width: 1000, height: 1000 }, null));
    const drifted = result.current.objects.find((o) => o.id === shape.id);
    expect(drifted.vx).toBeCloseTo(shape.vx, 6);
    expect(drifted.x).toBeCloseTo(300 + shape.vx * 0.1, 6);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: the three well tests FAIL (the fourth argument is ignored, so
`pulled.vx` equals `shape.vx` instead of `shape.vx + 30`). The
no-well-argument test PASSES already — it is a regression guard, not a driver.

- [ ] **Step 3: Write the minimal implementation**

In `lib/useDoodleObjects.js`, add the import beside the existing `lib` imports:

```js
import { applyWell } from './doodleWell';
```

Change the `advance` signature:

```js
  const advance = useCallback((dtSeconds, bounds, grabbedIds, well = null) => {
```

Replace the `drifted` mapping. It currently reads:

```js
    const drifted = prev.map((o) => (
      o.kind === 'shape' && !grabbedIds?.has(o.id)
        ? advanceShape(o, dtSeconds, bounds)
        : o
    ));
```

with:

```js
    // The well adds velocity before integration, so advanceShape keeps sole
    // ownership of position integration and the edge bounce.
    const drifted = prev.map((o) => {
      if (o.kind !== 'shape' || grabbedIds?.has(o.id)) return o;
      const pulled = well
        ? applyWell(o, well, dtSeconds, well.radius, well.strength, well.maxSpeed)
        : o;
      return advanceShape(pulled, dtSeconds, bounds);
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green. `DoodleCanvas` still calls `advance` with three
arguments, so `well` defaults to `null` and every existing canvas test is
unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx
git commit -m "feat(doodle): let advance apply a gravity well before integration"
```

---

### Task 4: Well overlay component

**Files:**
- Create: `components/doodle/Well.jsx`
- Create: `components/doodle/Well.test.jsx`
- Modify: `components/doodle/doodle.module.css` (new `.wellRing` class, beside the existing `.pulse` block around line 47)
- Test: `components/doodle/Well.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: default export `Well`, taking props `well` (`null` or `{ x, y, engaged }`), `progress` (number, 0 upward), `radius` (number), `holdMs` (number). Also the named export `WELL_CHARGE_VISIBLE_MS` (150). Task 6 renders it as the last child of the canvas `<svg>`.

**Spec deviation 2:** the engaged ring cannot reuse `styles.pulse`.
`.pulse` is `animation: doodlePulse 300ms ease`, a one-shot tap animation.
React keeps the same DOM node across the per-frame re-renders, so the
animation would fire once at mount and never again. A sustained breathing ring
needs its own class with an infinite iteration count, reusing the same
`doodlePulse` keyframes.

**Spec deviation 3:** `holdMs` is a prop. The spec's signature omitted it, but
the "render nothing while `progress * wellHoldMs < WELL_CHARGE_VISIBLE_MS`"
rule needs it. Keeping the rule inside the component makes it directly
testable instead of scattered into the frame loop.

- [ ] **Step 1: Write the failing test**

Create `components/doodle/Well.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Well, { WELL_CHARGE_VISIBLE_MS } from './Well';
import styles from './doodle.module.css';

// Rendered inside an <svg> because the component returns a bare <circle>,
// exactly as Particles does.
const renderWell = (props) => render(
  <svg>
    <Well well={null} progress={0} radius={200} holdMs={800} {...props} />
  </svg>,
);

describe('Well', () => {
  it('renders nothing when there is no well', () => {
    const { container } = renderWell({ well: null });
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('renders nothing before the charge becomes visible', () => {
    // 0.1 * 800ms = 80ms held, under the 150ms threshold, so an ordinary
    // tap-to-spawn never flashes a ring.
    const { container } = renderWell({
      well: { x: 10, y: 20, engaged: false }, progress: 0.1,
    });
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('renders a charging ring once past the threshold, not a pulsing one', () => {
    const { container } = renderWell({
      well: { x: 10, y: 20, engaged: false }, progress: 0.5,
    });
    const charging = container.querySelector('[data-testid="well-charging"]');
    expect(charging).not.toBeNull();
    expect(charging.getAttribute('cx')).toBe('10');
    expect(charging.getAttribute('cy')).toBe('20');
    expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();
    expect(charging.getAttribute('class') || '').not.toContain(styles.wellRing);
  });

  it('fills the charging ring in proportion to progress', () => {
    const quarter = renderWell({
      well: { x: 0, y: 0, engaged: false }, progress: 0.25,
    });
    const most = renderWell({
      well: { x: 0, y: 0, engaged: false }, progress: 0.9,
    });
    const filled = (result) => Number(
      result.container
        .querySelector('[data-testid="well-charging"]')
        .getAttribute('stroke-dasharray')
        .split(' ')[0],
    );
    expect(filled(most)).toBeGreaterThan(filled(quarter));
  });

  it('renders a pulsing ring at the well radius once engaged', () => {
    const { container } = renderWell({
      well: { x: 300, y: 400, engaged: true }, progress: 1, radius: 250,
    });
    const engaged = container.querySelector('[data-testid="well-engaged"]');
    expect(engaged).not.toBeNull();
    expect(engaged.getAttribute('r')).toBe('250');
    expect(engaged.getAttribute('class')).toContain(styles.wellRing);
    expect(container.querySelector('[data-testid="well-charging"]')).toBeNull();
  });

  it('renders an engaged well even at zero progress', () => {
    // The charge-visible threshold gates the charging ring only. A well that
    // is already open must never blink out because of it.
    const { container } = renderWell({
      well: { x: 0, y: 0, engaged: true }, progress: 0,
    });
    expect(container.querySelector('[data-testid="well-engaged"]')).not.toBeNull();
  });

  it('exposes the charge-visible threshold', () => {
    expect(WELL_CHARGE_VISIBLE_MS).toBe(150);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/doodle/Well.test.jsx`
Expected: FAIL. `./Well` does not exist, so every test errors on the import.

- [ ] **Step 3: Add the CSS class**

In `components/doodle/doodle.module.css`, directly after the existing
`@keyframes doodlePulse` block (around line 57), add:

```css
/* The engaged gravity-well ring breathes for as long as the finger stays
   down, so it reuses the doodlePulse keyframes on an infinite, slower loop
   rather than .pulse's one-shot 300ms tap feedback — a one-shot animation
   fires once at mount and never restarts, because the ring keeps the same
   DOM node across the well's per-frame re-renders. */
.wellRing {
  transform-box: fill-box;
  transform-origin: center;
  animation: doodlePulse 1.2s ease-in-out infinite;
}
```

- [ ] **Step 4: Write the minimal implementation**

Create `components/doodle/Well.jsx`:

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import styles from './doodle.module.css';

// The long-press gravity well's overlay: a ring under the finger that fills as
// the hold charges, then a breathing ring at the well's radius once it opens.
// Layered like Particles — a plain sibling, last inside the canvas <svg>,
// reading a ref rather than React state.

// A press shorter than this renders nothing, so an ordinary tap-to-spawn never
// flashes a ring. A gesture-recognition threshold like MOVE_THRESHOLD, not a
// feel knob, so it stays out of the tuning panel.
export const WELL_CHARGE_VISIBLE_MS = 150;

// The charging ring reads as shape-sized rather than well-sized: it marks the
// finger, and the well's own radius only becomes meaningful once it opens.
// MIN_SIZE (28) is the smallest shape a tap can spawn.
const CHARGE_RADIUS = 28;
const CHARGE_CIRCUMFERENCE = 2 * Math.PI * CHARGE_RADIUS;

export default function Well({
  well, progress, radius, holdMs,
}) {
  if (!well) return null;

  if (well.engaged) {
    return (
      <circle
        className={styles.wellRing}
        data-testid="well-engaged"
        cx={well.x}
        cy={well.y}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        opacity={0.45}
      />
    );
  }

  if (progress * holdMs < WELL_CHARGE_VISIBLE_MS) return null;

  // Starts at twelve o'clock and fills clockwise, which is what a child
  // reading a loading ring expects.
  const filled = CHARGE_CIRCUMFERENCE * Math.min(progress, 1);
  return (
    <circle
      data-testid="well-charging"
      cx={well.x}
      cy={well.y}
      r={CHARGE_RADIUS}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeDasharray={`${filled} ${CHARGE_CIRCUMFERENCE}`}
      transform={`rotate(-90 ${well.x} ${well.y})`}
      opacity={0.7}
    />
  );
}

Well.propTypes = {
  well: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    engaged: PropTypes.bool.isRequired,
  }),
  progress: PropTypes.number.isRequired,
  radius: PropTypes.number.isRequired,
  holdMs: PropTypes.number.isRequired,
};

Well.defaultProps = {
  well: null,
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/doodle/Well.test.jsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green. `components/doodle/doodle.module.css.test.js` asserts
only the 768px breakpoint and the `.toolButton` sizes inside and outside it;
`.wellRing` sits before the `@media` block and changes neither slice's
assertions.

- [ ] **Step 7: Commit**

```bash
git add components/doodle/Well.jsx components/doodle/Well.test.jsx components/doodle/doodle.module.css
git commit -m "feat(doodle): add the gravity-well charging and engaged rings"
```

---

### Task 5: Tuning keys and panel rows

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx` (`DEFAULT_TUNING`, around line 105 after the feel bundle's `maxThrowSpeed` entry)
- Modify: `components/doodle/TuningPanel.jsx` (`FIELDS`, appended after the `maxThrowSpeed` row)
- Test: `components/doodle/TuningPanel.test.jsx`

**Interfaces:**
- Consumes: `DEFAULT_WELL_RADIUS`, `DEFAULT_WELL_STRENGTH`, `DEFAULT_WELL_MAX_SPEED`, `DEFAULT_WELL_HOLD_MS` from Task 1.
- Produces: `tuning.wellRadius`, `tuning.wellStrength`, `tuning.wellMaxSpeed`, `tuning.wellHoldMs`, live-adjustable and persisted under the existing `doodle-tuning` key. Task 6 reads all four from `tuningRef.current`.

This task is deliberately green on its own: the four keys exist, persist, and
render as panel rows, and nothing reads them yet. Per `.claude/rules/doodle.md`
all four shape how the feature feels, which is the bar the tuning-panel
convention sets. The existing merge-over-defaults load already tolerates a
stored `doodle-tuning` object that predates these keys.

- [ ] **Step 1: Write the failing test**

In `components/doodle/TuningPanel.test.jsx`, extend `baseTuning` with the four
new keys:

```js
const baseTuning = {
  maxParticles: 150,
  dustMaxAge: 0.3,
  dustFrameInterval: 3,
  driftMin: 18,
  driftMax: 18,
  maxThrowSpeed: 600,
  wellRadius: 200,
  wellStrength: 600,
  wellMaxSpeed: 400,
  wellHoldMs: 800,
};
```

Then add to the existing `describe('TuningPanel')`:

```js
  it('renders a row for every gravity-well tunable', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Well radius (px)').value).toBe('200');
    expect(getByLabelText('Well strength (px/s²)').value).toBe('600');
    expect(getByLabelText('Well max speed (px/s)').value).toBe('400');
    expect(getByLabelText('Well hold (ms)').value).toBe('800');
  });

  it('reports every gravity-well change through onChange', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Well radius (px)'), { target: { value: '350' } });
    fireEvent.change(getByLabelText('Well strength (px/s²)'), { target: { value: '1200' } });
    fireEvent.change(getByLabelText('Well max speed (px/s)'), { target: { value: '900' } });
    fireEvent.change(getByLabelText('Well hold (ms)'), { target: { value: '1000' } });
    expect(onChange).toHaveBeenCalledWith('wellRadius', 350);
    expect(onChange).toHaveBeenCalledWith('wellStrength', 1200);
    expect(onChange).toHaveBeenCalledWith('wellMaxSpeed', 900);
    expect(onChange).toHaveBeenCalledWith('wellHoldMs', 1000);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: FAIL. `getByLabelText('Well radius (px)')` throws "Unable to find a
label with the text of: Well radius (px)".

- [ ] **Step 3: Write the minimal implementation**

In `components/doodle/TuningPanel.jsx`, append four entries to `FIELDS`, after
the existing `maxThrowSpeed` row:

```js
  {
    key: 'wellRadius', label: 'Well radius (px)', min: 50, max: 600, step: 10,
  },
  {
    key: 'wellStrength', label: 'Well strength (px/s²)', min: 0, max: 3000, step: 50,
  },
  {
    key: 'wellMaxSpeed', label: 'Well max speed (px/s)', min: 50, max: 2000, step: 50,
  },
  {
    key: 'wellHoldMs', label: 'Well hold (ms)', min: 200, max: 2000, step: 50,
  },
```

In `components/doodle/DoodleCanvas.jsx`, add the import beside the other `lib`
imports:

```js
import {
  DEFAULT_WELL_HOLD_MS, DEFAULT_WELL_MAX_SPEED, DEFAULT_WELL_RADIUS, DEFAULT_WELL_STRENGTH,
} from '../../lib/doodleWell';
```

and four keys to `DEFAULT_TUNING`, after `maxThrowSpeed`:

```js
  wellRadius: DEFAULT_WELL_RADIUS,
  wellStrength: DEFAULT_WELL_STRENGTH,
  wellMaxSpeed: DEFAULT_WELL_MAX_SPEED,
  wellHoldMs: DEFAULT_WELL_HOLD_MS,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green. No behavior reads the new keys yet, so no canvas test
changes.

- [ ] **Step 6: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/TuningPanel.jsx components/doodle/TuningPanel.test.jsx
git commit -m "feat(doodle): expose the gravity-well feel constants in the tuning panel"
```

---

### Task 6: Recognise the hold and open the well

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx` — new refs beside `particlesRef`; recognition inside the existing frame loop's rect guard; one new branch in `onPointerMove`; one in `onPointerUp`; one in `onPointerCancel`; the unmount cleanup effect; the `<svg>` children; `propTypes.sound`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `advance(dt, bounds, grabbedIds, well)` from Task 3, `soundRef.current.playWell()` from Task 2, `Well` from Task 4, and the four `tuning.well*` keys from Task 5.
- Produces: the finished gesture. Nothing later depends on it.

Recognition derives from the pointer map rather than a timer. The loop already
runs every frame and already reads `pointersRef`, and every pointer entry
already carries `downTime`, so there is no `setTimeout` lifecycle to clean up.

**Use `Date.now()`, not the rAF timestamp.** `downTime` comes from
`Date.now()`; the `now` the browser hands the frame callback is a
`performance.now()` value with a different epoch. Subtracting one from the
other yields garbage.

**Spec deviation 1:** eligibility must accept an already-engaged pointer.
Engage sets `mode = 'well'` and `moved = true` on the holding entry, so a rule
that demands `mode === null && !moved` would fail on the very next frame and
cancel the well it just opened.

- [ ] **Step 1: Write the failing test**

In `components/doodle/DoodleCanvas.test.jsx`, first give `mockSound()` the new
method — `DoodleCanvas.propTypes.sound` will require it:

```js
const mockSound = () => ({
  playNote: vi.fn(),
  playStroke: vi.fn(),
  playPop: vi.fn(),
  playWell: vi.fn(),
  setMuted: vi.fn(),
  isMuted: () => false,
});
```

Then add a new `describe` block at the end of the file, inside the outer
`describe('DoodleCanvas')`:

```jsx
  describe('gravity well', () => {
    // driveOneFrame() stubs performance.now to 0 and collects rAF callbacks;
    // the well's own clock is Date.now(), which vi.setSystemTime drives. Fake
    // timers must be installed BEFORE driveOneFrame so its performance.now
    // spy is the outermost one.
    const holdAndDriveFrames = (svg, { holdMs, cbs, pointerId = 1 }) => {
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId });
      // One frame while still charging, then one past the hold threshold.
      vi.setSystemTime(Math.floor(holdMs / 2));
      act(() => { cbs[cbs.length - 1](16); });
      vi.setSystemTime(holdMs + 50);
      act(() => { cbs[cbs.length - 1](32); });
      return svg;
    };

    // Shape.jsx renders `translate(x y) rotate(r)`, so this reads the x it
    // was last placed at.
    const shapeX = (container) => Number(
      shapeGroups(container)[0].getAttribute('transform').match(/translate\(([-\d.]+)/)[1],
    );

    it('a hold past wellHoldMs opens a well and pulls a nearby shape toward it', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText } = render(
        <DoodleCanvas rng={seq([0])} sound={sound} />,
      );
      // Zero the drift before spawning, so the only motion the assertion can
      // see is the well's. With rng seq([0]) the spawn angle is 0, meaning a
      // drifting shape would travel +x on its own and the test would pass
      // whether or not the well did anything.
      fireEvent.click(getByLabelText('Open tuning panel'));
      fireEvent.change(getByLabelText('Drift speed min (px/s)'), { target: { value: '0' } });
      fireEvent.change(getByLabelText('Drift speed max (px/s)'), { target: { value: '0' } });
      fireEvent.click(getByLabelText('Close tuning panel'));

      const svg = stage(container);
      // Spawn a shape 100px to the left of where the hold will land, well
      // inside the 200px default wellRadius.
      fireEvent.pointerDown(svg, { clientX: 400, clientY: 500, pointerId: 9 });
      fireEvent.pointerUp(svg, { clientX: 400, clientY: 500, pointerId: 9 });
      expect(shapeGroups(container)).toHaveLength(1);
      expect(shapeX(container)).toBeCloseTo(400, 6); // parked, no drift

      holdAndDriveFrames(svg, { holdMs: 800, cbs });

      expect(sound.playWell).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-testid="well-engaged"]')).not.toBeNull();

      for (let i = 0; i < 20; i += 1) {
        act(() => { cbs[cbs.length - 1](48 + i * 16); });
      }

      // d = 100 at radius 200 -> falloff 0.5, so 600 * 0.5 = 300 px/s^2
      // accumulating over ~20 frames of 16ms. It only has to be unambiguously
      // rightward, not an exact figure.
      expect(shapeX(container)).toBeGreaterThan(405);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a shape does not move on its own once drift is zeroed and no well opens', () => {
      // The control for the test above: same setup, hold released early, so
      // nothing but the well could have produced that motion.
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText } = render(
        <DoodleCanvas rng={seq([0])} sound={mockSound()} />,
      );
      fireEvent.click(getByLabelText('Open tuning panel'));
      fireEvent.change(getByLabelText('Drift speed min (px/s)'), { target: { value: '0' } });
      fireEvent.change(getByLabelText('Drift speed max (px/s)'), { target: { value: '0' } });
      fireEvent.click(getByLabelText('Close tuning panel'));

      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 400, clientY: 500, pointerId: 9 });
      fireEvent.pointerUp(svg, { clientX: 400, clientY: 500, pointerId: 9 });

      for (let i = 0; i < 20; i += 1) {
        act(() => { cbs[cbs.length - 1](16 + i * 16); });
      }
      expect(shapeX(container)).toBeCloseTo(400, 6);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('releasing after the well engages spawns no shape', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
      const svg = stage(container);

      holdAndDriveFrames(svg, { holdMs: 800, cbs });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

      expect(shapeGroups(container)).toHaveLength(0);
      // The ring goes with it.
      act(() => { cbs[cbs.length - 1](64); });
      expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('releasing before wellHoldMs still spawns a shape', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
      const svg = stage(container);

      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      vi.setSystemTime(300); // under the 800ms default
      act(() => { cbs[cbs.length - 1](16); });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

      expect(shapeGroups(container)).toHaveLength(1);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a second pointer landing during the hold cancels the well', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={sound} />);
      const svg = stage(container);

      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      vi.setSystemTime(400);
      act(() => { cbs[cbs.length - 1](16); });
      fireEvent.pointerDown(svg, { clientX: 520, clientY: 500, pointerId: 2 });
      vi.setSystemTime(1200); // well past the hold for pointer 1
      act(() => { cbs[cbs.length - 1](32); });

      expect(sound.playWell).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('moving past MOVE_THRESHOLD during the hold cancels the well', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={sound} />);
      const svg = stage(container);

      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      vi.setSystemTime(400);
      act(() => { cbs[cbs.length - 1](16); });
      fireEvent.pointerMove(svg, { clientX: 560, clientY: 500, pointerId: 1 });
      vi.setSystemTime(1200);
      act(() => { cbs[cbs.length - 1](32); });

      expect(sound.playWell).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a small jitter during an open well does not close it', () => {
      // A held finger jitters, and a toddler's hold jitters more than most, so
      // an open well tolerates movement under MOVE_THRESHOLD (8px).
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
      const svg = stage(container);

      holdAndDriveFrames(svg, { holdMs: 800, cbs });
      fireEvent.pointerMove(svg, { clientX: 503, clientY: 502, pointerId: 1 });
      act(() => { cbs[cbs.length - 1](64); });

      expect(container.querySelector('[data-testid="well-engaged"]')).not.toBeNull();

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a hold in draw mode never opens a well and still draws a dot', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText } = render(
        <DoodleCanvas rng={seq([0])} sound={sound} />,
      );
      fireEvent.click(getByLabelText('Switch to draw mode'));
      const svg = stage(container);

      holdAndDriveFrames(svg, { holdMs: 800, cbs });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

      expect(sound.playWell).not.toHaveBeenCalled();
      expect(strokes(container)).toHaveLength(1);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a hold on a shape never opens a well', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container } = render(<DoodleCanvas rng={seq([0])} sound={sound} />);
      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 9 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 9 });
      const g = container.querySelector('svg > g[data-id]');

      fireEvent.pointerDown(g, { clientX: 500, clientY: 500, pointerId: 1 });
      vi.setSystemTime(1200);
      act(() => { cbs[cbs.length - 1](16); });

      expect(sound.playWell).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('a hold while frozen never opens a well and still spawns on release', () => {
      // A frozen tick returns before advance runs, so an engaged well could
      // not pull anything; a pulsing ring over a still canvas would lie about
      // what the gesture did.
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const sound = mockSound();
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText } = render(
        <DoodleCanvas rng={seq([0])} sound={sound} />,
      );
      fireEvent.click(getByLabelText('Slow motion'));
      fireEvent.click(getByLabelText('Freeze'));
      const svg = stage(container);

      holdAndDriveFrames(svg, { holdMs: 800, cbs });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

      expect(sound.playWell).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();
      expect(shapeGroups(container)).toHaveLength(1);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });

    it('leaves a shape outside wellRadius alone', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const { cbs, rectSpy, nowSpy } = driveOneFrame();
      const { container, getByLabelText } = render(
        <DoodleCanvas rng={seq([0])} sound={mockSound()} />,
      );
      // Shrink the radius so the shape 100px away is comfortably outside it,
      // and zero the drift so the only possible x motion is the well's.
      fireEvent.click(getByLabelText('Open tuning panel'));
      fireEvent.change(getByLabelText('Well radius (px)'), { target: { value: '50' } });
      fireEvent.change(getByLabelText('Drift speed min (px/s)'), { target: { value: '0' } });
      fireEvent.change(getByLabelText('Drift speed max (px/s)'), { target: { value: '0' } });
      fireEvent.click(getByLabelText('Close tuning panel'));

      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 400, clientY: 500, pointerId: 9 });
      fireEvent.pointerUp(svg, { clientX: 400, clientY: 500, pointerId: 9 });
      const before = shapeGroups(container)[0].getAttribute('transform');

      holdAndDriveFrames(svg, { holdMs: 800, cbs });
      for (let i = 0; i < 10; i += 1) {
        act(() => { cbs[cbs.length - 1](48 + i * 16); });
      }

      expect(shapeGroups(container)[0].getAttribute('transform')).toBe(before);

      nowSpy.mockRestore();
      rectSpy.mockRestore();
      vi.useRealTimers();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/doodle/Well.test.jsx components/doodle/DoodleCanvas.test.jsx`
Expected: the new `gravity well` block FAILS — `sound.playWell` is never
called and no `[data-testid="well-engaged"]` node exists. Every pre-existing
canvas test still PASSES; if any of them broke, the `mockSound()` edit is the
only change that could have done it, so check that first.

- [ ] **Step 3: Add the refs**

In `components/doodle/DoodleCanvas.jsx`, import the component beside the other
`components/doodle` imports:

```js
import Well from './Well';
```

Add two refs directly after `particlesRef` and its `addParticles` helper:

```js
  // Long-press gravity well: transient gesture state, so refs and not state.
  // Read by the frame loop and rendered by <Well>, exactly as particlesRef is,
  // and never entering the objects array or localStorage.
  const wellRef = useRef(null);
  const wellProgressRef = useRef(0);
```

- [ ] **Step 4: Add recognition to the frame loop**

In the `tick` function, inside the `if (rect && rect.width && rect.height)`
guard and after `grabbedIds` is built, insert the recogniser. It must sit
*after* the `timeScaleRef.current === 0` early return that already exists
above, which is what makes a frozen canvas ineligible.

```js
        // Long-press well recognition, derived from the pointer map rather
        // than a timer: this loop already runs every frame and every pointer
        // entry already carries downTime, so there is no setTimeout lifecycle
        // to clean up. Deliberately uses Date.now() and not the rAF timestamp
        // — downTime comes from Date.now(), and performance.now() has a
        // different epoch.
        //
        // An already-engaged holder keeps mode 'well' and moved true, so
        // eligibility has to accept that state as well as the charging one,
        // or the well would cancel on the frame right after it opened.
        const {
          wellHoldMs, wellRadius, wellStrength, wellMaxSpeed,
        } = tuningRef.current;
        const held = [...pointersRef.current.values()];
        const holder = held.length === 1 ? held[0] : null;
        const wellEligible = !!holder
          && modeRef.current === 'shape'
          && holder.shapeId === null
          && (holder.mode === 'well' || (holder.mode === null && !holder.moved));
        if (!wellEligible) {
          wellRef.current = null;
          wellProgressRef.current = 0;
        } else {
          if (wellRef.current?.pointerId !== holder.pointerId) {
            wellRef.current = {
              pointerId: holder.pointerId,
              x: holder.startX,
              y: holder.startY,
              downTime: holder.downTime,
              engaged: false,
            };
          }
          const heldMs = Date.now() - holder.downTime;
          // A tuning panel can be typed down to 0 (HTML min is advisory), in
          // which case the hold is instantaneous rather than a division by zero.
          wellProgressRef.current = wellHoldMs > 0 ? heldMs / wellHoldMs : 1;
          if (!wellRef.current.engaged && heldMs >= wellHoldMs) {
            wellRef.current.engaged = true;
            holder.mode = 'well';
            // Suppresses the spawn on release: onPointerUp already returns
            // early for a moved pointer, so no new branch is needed there.
            holder.moved = true;
            soundRef.current.playWell();
          }
        }
        const well = wellRef.current?.engaged
          ? {
            x: wellRef.current.x,
            y: wellRef.current.y,
            radius: wellRadius,
            strength: wellStrength,
            maxSpeed: wellMaxSpeed,
          }
          : null;
```

Then change the `advance` call in the same block from:

```js
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds);
```

to:

```js
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds, well);
```

- [ ] **Step 5: Add the cancel branches**

In `onPointerMove`, immediately after the existing `if (p.mode === 'inert') return;`:

```js
    if (p.mode === 'well') {
      // Movement closes the well rather than dragging it — sweeping shapes
      // around with a live well is a separate feature. MOVE_THRESHOLD applies
      // here explicitly because engage already set moved, which bypasses the
      // threshold logic further down; a held finger jitters, and a toddler's
      // hold jitters more than most.
      if (Math.hypot(pt.x - p.startX, pt.y - p.startY) < MOVE_THRESHOLD) return;
      wellRef.current = null;
      wellProgressRef.current = 0;
      p.mode = 'inert';
      return;
    }
```

In `onPointerUp`, immediately after its existing `if (p.mode === 'inert') return;`:

```js
    if (p.mode === 'well') {
      // Release closes the well on this frame. Shapes keep whatever velocity
      // they gained: no snap-back, no decay. Clearing here rather than
      // leaving it to the next frame's eligibility check avoids one stale
      // frame of ring.
      wellRef.current = null;
      wellProgressRef.current = 0;
      return;
    }
```

In `onPointerCancel`, extend the existing chain so a cancelled well clears
too. It currently reads:

```js
    if (p.mode === 'pinch-member') endPinchMember(p, e.pointerId);
    else if (p.mode === 'drag' && p.samples.length > 0) throwShape(p.shapeId, 0, 0);
```

Change it to:

```js
    if (p.mode === 'pinch-member') endPinchMember(p, e.pointerId);
    else if (p.mode === 'drag' && p.samples.length > 0) throwShape(p.shapeId, 0, 0);
    // Palm rejection or an OS gesture can end a well without a pointerup.
    else if (p.mode === 'well') {
      wellRef.current = null;
      wellProgressRef.current = 0;
    }
```

In the unmount cleanup effect, add one line beside the existing ref clears:

```js
    wellRef.current = null;
```

- [ ] **Step 6: Render the overlay and require the new sound method**

In the `<svg>` children, after `<Particles>` so the ring draws on top of both
shapes and particles:

```jsx
        <Particles particles={particlesRef.current} />
        <Well
          well={wellRef.current}
          progress={wellProgressRef.current}
          radius={tuning.wellRadius}
          holdMs={tuning.wellHoldMs}
        />
```

In `DoodleCanvas.propTypes`, add one entry to the `sound` shape beside `playPop`:

```js
    playWell: PropTypes.func.isRequired,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS, including every pre-existing pinch, drag, flick, freeze and
double-tap test. The pinch path is untouched: `PINCH_WINDOW_MS` is 150 and the
default hold is 800, so the pinch window always closes long before a well
could engage, and the single-pointer requirement blocks engagement during any
two-finger interaction regardless of timing.

- [ ] **Step 8: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green.

- [ ] **Step 9: Verify in the real app**

Run: `npm run dev`, open `http://localhost:8080/doodle`, then:
1. Tap to spawn three or four shapes near the middle.
2. Press and hold on empty canvas nearby. A ring should appear after roughly
   150 ms, fill over the rest of the 800 ms, then switch to a breathing ring
   at the well radius with one low tone.
3. Confirm the shapes accelerate inward and that same-colour pairs merge with
   the existing spiral and chime.
4. Release. The ring goes, the shapes keep moving, and **no shape spawns**.
5. Repeat with the freeze button on: no ring, and release spawns a shape.

- [ ] **Step 10: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat(doodle): open a gravity well on a long press in shape mode"
```

---

### Task 7: Document the layout and tidy the history

**Files:**
- Modify: `.claude/rules/doodle.md` (the `## Layout` list)

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing.

- [ ] **Step 1: Add the two new files to the layout list**

In `.claude/rules/doodle.md`, add after the `components/doodle/Particles.jsx`
entry:

```markdown
- `components/doodle/Well.jsx` — renders the long-press gravity well's charging ring and engaged ring.
```

and after the `lib/doodleParticles.js` entry:

```markdown
- `lib/doodleWell.js` — `applyWell`: linear-falloff gravity-well force, pure function.
```

- [ ] **Step 2: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: both green. A markdown-only change, but run them anyway before the
final commit.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/doodle.md
git commit -m "docs(doodle): list the gravity-well files in the module rules"
```

- [ ] **Step 4: Tidy the history down to two commits**

The original request asked for a single commit, or two if splitting the
tuning-panel addition out is cleaner. TDD produced six feature commits, so
squash them into the two the request asked for, each green on its own:

1. **`feat(doodle): expose the gravity-well feel constants in the tuning panel`** — Task 1 (the pure force module, which owns the `DEFAULT_WELL_*` constants the panel rows default to) plus Task 5. Green on its own: the force function is fully tested in isolation, and the panel rows render and persist with nothing reading them yet.
2. **`feat(doodle): open a gravity well on a long press in shape mode`** — Tasks 2, 3, 4, 6 and 7. Green on its own.

Use the `git-tidy-branch` skill for the reorganisation rather than a hand-rolled
interactive rebase. Confirm afterwards that `npm test && npm run lint` is green
at **each** of the two commits, not only at the tip:

```bash
git rebase --exec 'npm test && npm run lint' origin/master
```

- [ ] **Step 5: Push**

Force-with-lease is required, because the branch was rebased onto the merged
`master` and the tidy in Step 4 rewrites history. **Get explicit approval
before this push** — the global `AGENTS.md` guardrail requires it for any
history rewrite.

```bash
git push -u --force-with-lease origin claude/hopeful-ptolemy-rrvzu0
```

Do not open a pull request unless asked.
