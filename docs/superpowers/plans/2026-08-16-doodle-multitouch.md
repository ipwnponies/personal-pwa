# Doodle Multi-Touch Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the doodle canvas track every finger independently — concurrent drag/draw/tap/double-tap per pointer — and add a same-shape two-finger pinch that resizes and rotates it, replacing the current single-pointer-only gesture slot.

**Architecture:** Replace `DoodleCanvas.jsx`'s single `pointerRef` slot with a `Map<pointerId, PointerState>` (`pointersRef`) so each active touch is tracked independently, plus a `Map<shapeId, PinchState>` (`pinchesRef`) for at-most-one active pinch per shape. Pinch is detected opportunistically (two pointers landing on the same shape within a short window), not pre-declared. `useDoodleObjects` gains one new mutator, `transformShape`, mirroring the existing `moveShape`. Task 2 lands the pointer-map rewrite for independent concurrent gestures (no pinch yet); Task 3 layers pinch-resize-rotate on top.

**Tech Stack:** Next.js 14 (pages router), React 18, SVG, Pointer Events API, vitest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-doodle-multitouch-design.md` (and the original `docs/superpowers/specs/2026-07-24-doodle-design.md`, whose "no pinch/multi-touch" non-goal this supersedes).

## Global Constraints

- Node 20+. No new dependencies; do not touch `package.json`/lockfile.
- Reuse `clamp` from `lib/random.js` for the pinch size clamp — do not duplicate it.
- Reuse `MIN_SIZE`/`MAX_SIZE` from `lib/doodleShapes.js` for the pinch resize bounds — do not hardcode new numbers.
- `MOVE_THRESHOLD` (8px, already defined in `DoodleCanvas.jsx`) is reused as the double-tap proximity radius — no new "same finger" constant.
- A pinch only starts from two pointers landing on the same shape within `PINCH_WINDOW_MS` (150ms) of each other, neither having moved yet. A finger joining an already-active drag or an already-active pinch on that shape does not convert or join it — it becomes inert (tracked, but produces no gesture) until it lifts.
- Pinch resize/rotate does not move the shape's `x`/`y` — only `size` (clamped) and `rotation` change.
- Concurrent pointers are capped at `MAX_POINTERS` (10) as a defensive ceiling; pointers beyond the cap are dropped on `pointerdown` (ignored, not tracked).
- Existing single-finger tap/drag/draw/double-tap-at-the-same-spot behavior must not regress — every currently-passing `DoodleCanvas.test.jsx` test for single-pointer behavior stays passing (some multi-pointer tests are intentionally rewritten — see Task 2).
- Tests: `npx vitest run`. Lint: `npm run lint` (airbnb + prettier) must stay clean — `i += 1` not `i++`, no JSX prop spreading.

---

### Task 1: `transformShape` and a multi-id `advance` grab set

**Files:**
- Modify: `lib/useDoodleObjects.js`
- Test: `lib/useDoodleObjects.test.jsx`

**Interfaces:**
- Consumes: nothing new (same `setObjects` state already in the hook).
- Produces:
  - `transformShape(id, { size, rotation }) => void` — merges a partial `{ size, rotation }` update onto the shape with matching `id`; no-ops for a missing id or a non-`shape` object.
  - `advance(dtSeconds, bounds, grabbedIds)` — `grabbedIds` is now a `Set` of shape ids (previously a single id or `undefined`). Every shape whose id is in the set is excluded from drift for that frame. Passing `undefined` or an empty `Set` drifts everything, matching today's "no shape grabbed" behavior.

- [ ] **Step 1: Write the failing tests**

Add to `lib/useDoodleObjects.test.jsx` (keep existing tests; `advance`'s existing test at the bottom of this block replaces its old single-id call):

```js
// Replace the existing 'advance moves non-grabbed shapes and skips the grabbed one' test with:
it('advance moves non-grabbed shapes and skips shapes in the grabbed set', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
  let a;
  let b;
  act(() => { a = result.current.spawnShape(100, 100); });
  act(() => { b = result.current.spawnShape(200, 200); });
  const before = result.current.objects.find((o) => o.id === b.id);
  act(() => result.current.advance(1, { width: 1000, height: 1000 }, new Set([b.id])));
  const afterA = result.current.objects.find((o) => o.id === a.id);
  const afterB = result.current.objects.find((o) => o.id === b.id);
  expect(afterB.x).toBe(before.x); // grabbed shape unchanged
  expect(afterA.x !== 100 || afterA.y !== 100).toBe(true); // moved
});

it('advance skips every shape whose id is in the grabbed set', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
  let a;
  let b;
  act(() => { a = result.current.spawnShape(100, 100); });
  act(() => { b = result.current.spawnShape(200, 200); });
  act(() => result.current.advance(1, { width: 1000, height: 1000 }, new Set([a.id, b.id])));
  const afterA = result.current.objects.find((o) => o.id === a.id);
  const afterB = result.current.objects.find((o) => o.id === b.id);
  expect(afterA.x).toBe(100);
  expect(afterB.x).toBe(200);
});

it('transformShape updates size and rotation on the matching shape', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
  let shape;
  act(() => { shape = result.current.spawnShape(0, 0); });
  act(() => result.current.transformShape(shape.id, { size: 50, rotation: 120 }));
  const updated = result.current.objects.find((o) => o.id === shape.id);
  expect(updated.size).toBe(50);
  expect(updated.rotation).toBe(120);
  expect(updated.x).toBe(shape.x); // unaffected
  expect(updated.y).toBe(shape.y); // unaffected
});

it('transformShape no-ops for an unknown id', () => {
  const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
  act(() => { result.current.spawnShape(0, 0); });
  const before = result.current.objects;
  act(() => result.current.transformShape('does-not-exist', { size: 999, rotation: 999 }));
  expect(result.current.objects).toEqual(before);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: FAIL — `transformShape` is not a function; the grabbed-set tests fail because `advance` currently compares `o.id !== grabbedId` against a `Set` object, so nothing is ever excluded from drift (`afterB.x` won't equal `before.x`).

- [ ] **Step 3: Implement `transformShape` and update `advance`**

In `lib/useDoodleObjects.js`:

```js
const transformShape = useCallback((id, { size, rotation }) => {
  setObjects((prev) => prev.map((o) => (
    o.id === id && o.kind === 'shape' ? { ...o, size, rotation } : o
  )));
}, []);

const advance = useCallback((dtSeconds, bounds, grabbedIds) => {
  setObjects((prev) => prev.map((o) => (
    o.kind === 'shape' && !grabbedIds?.has(o.id)
      ? advanceShape(o, dtSeconds, bounds)
      : o
  )));
}, []);
```

Add `transformShape` to the hook's returned object, alongside `moveShape`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS (all tests, including the two replaced/added `advance` tests and the two new `transformShape` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx
git commit -m "feat: add transformShape and multi-id grabbed set to useDoodleObjects"
```

---

### Task 2: Per-pointer gesture map — independent concurrent tap/drag/draw/double-tap

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `transformShape`, `advance(dt, bounds, grabbedIds: Set)` from Task 1's `useDoodleObjects`.
- Produces: no new exports — `DoodleCanvas`'s public props (`rng`, `sound`) and rendered DOM shape are unchanged. Internal state shape (`pointersRef`, `lastTapRef`) is new; Task 3 depends on both existing exactly as defined here.

This task does **not** add pinch yet — every finger is still fully independent (two fingers on the same shape at once each just... independently tug it, which is fine for now; Task 3 adds the pinch carve-out). The two things that change observably: (1) a second finger no longer waits for the first to finish, and (2) double-tap now requires the second tap to land near the first (proximity), not just be recent.

- [ ] **Step 1: Write the failing tests**

In `components/doodle/DoodleCanvas.test.jsx`, **replace** the existing `'ignores a second finger while the first gesture is still active'` test (its old "ignore" behavior is the thing this task intentionally changes) with:

```js
it('a second finger acts independently while the first gesture is still active', () => {
  // Multi-touch: a second finger is no longer locked out by an in-progress
  // first gesture — each pointerId tracks its own independent state.
  const sound = mockSound();
  const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
  const svg = stage(container);

  // Finger 1: start dragging the first shape.
  fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(svg, { clientX: 150, clientY: 100, pointerId: 1 });

  // Finger 2 taps empty space mid-drag — now spawns its own shape independently.
  fireEvent.pointerDown(svg, { clientX: 400, clientY: 400, pointerId: 2 });
  fireEvent.pointerUp(svg, { clientX: 400, clientY: 400, pointerId: 2 });
  expect(shapeGroups(container)).toHaveLength(2); // finger 1's shape + finger 2's new spawn

  // Finger 1 continues and completes its drag normally, unaffected by finger 2.
  fireEvent.pointerMove(svg, { clientX: 170, clientY: 130, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 170, clientY: 130, pointerId: 1 });
  expect(strokes(container)).toHaveLength(0); // finger 1 was dragging, never drew
  const transform = container.querySelector(`[data-id="${g.getAttribute('data-id')}"]`).getAttribute('transform');
  expect(transform).toMatch(/^translate\(170 130\)/);
});

it('two fingers on empty space draw two independent strokes concurrently', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
  const svg = stage(container);

  fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 2 });
  fireEvent.pointerMove(svg, { clientX: 60, clientY: 60, pointerId: 1 });
  fireEvent.pointerMove(svg, { clientX: 540, clientY: 540, pointerId: 2 });
  fireEvent.pointerMove(svg, { clientX: 80, clientY: 90, pointerId: 1 });
  fireEvent.pointerMove(svg, { clientX: 560, clientY: 520, pointerId: 2 });
  fireEvent.pointerUp(svg, { clientX: 80, clientY: 90, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 560, clientY: 520, pointerId: 2 });

  expect(strokes(container)).toHaveLength(2);
  expect(shapeGroups(container)).toHaveLength(0);
});

it('double-tap requires the second tap near the first — far-apart taps do not pop', () => {
  const sound = mockSound();
  // rng high so the spawned shape is large enough that (100,100) and (120,100)
  // both land on it, isolating "far apart" from "missed the shape".
  const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const firstId = g.getAttribute('data-id');

  fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
  fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
  // Second tap lands on the same shape but 20px away — beyond MOVE_THRESHOLD (8px).
  fireEvent.pointerDown(g, { clientX: 120, clientY: 100, pointerId: 3 });
  fireEvent.pointerUp(g, { clientX: 120, clientY: 100, pointerId: 3 });

  expect(container.querySelector(`[data-id="${firstId}"]`)).not.toBeNull(); // not popped
  expect(sound.playPop).not.toHaveBeenCalled();
});

it('double-tap pops when the second tap lands near the first, from a different pointerId', () => {
  const sound = mockSound();
  const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const firstId = g.getAttribute('data-id');

  fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
  fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
  // Second tap 3px away — within MOVE_THRESHOLD — and a different pointerId.
  fireEvent.pointerDown(g, { clientX: 103, clientY: 100, pointerId: 3 });
  fireEvent.pointerUp(g, { clientX: 103, clientY: 100, pointerId: 3 });

  expect(container.querySelector(`[data-id="${firstId}"]`)).toBeNull(); // popped
  expect(sound.playPop).toHaveBeenCalledTimes(1);
});
```

```js
it('caps concurrent pointers and ignores extras beyond the limit', () => {
  const sound = mockSound();
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={sound} />);
  const svg = stage(container);
  for (let id = 1; id <= 10; id += 1) {
    fireEvent.pointerDown(svg, { clientX: 10 * id, clientY: 10, pointerId: id });
  }
  fireEvent.pointerDown(svg, { clientX: 999, clientY: 999, pointerId: 11 }); // 11th dropped, cap already reached
  for (let id = 1; id <= 11; id += 1) {
    fireEvent.pointerUp(svg, { clientX: 10 * id, clientY: 10, pointerId: id });
  }
  expect(shapeGroups(container)).toHaveLength(10); // pointer 11's up finds no tracked entry, no-ops
});
```

Also update the drift-loop test's expectations are unaffected (it doesn't touch `grabbedIds` directly), so leave `'runs a drift loop that moves shapes over time'` as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — the rewritten "independent second finger" test fails because the current single-slot `pointerRef` still ignores finger 2 (`shapeGroups` stays at 1, not 2); the proximity double-tap tests fail because `handleShapeTap` currently pops on any two taps within the time window regardless of position.

- [ ] **Step 3: Rewrite pointer tracking to a per-pointer map**

In `components/doodle/DoodleCanvas.jsx`, replace the single-slot pointer state and its handlers:

```js
// Replace:
//   const pointerRef = useRef(null);
//   const lastTapRef = useRef(null);
// with:
const pointersRef = useRef(new Map()); // pointerId -> PointerState
const lastTapRef = useRef(new Map()); // shapeId -> { x, y, time }
```

```js
const MAX_POINTERS = 10; // defensive ceiling, not a gameplay limit
```
(add alongside the existing `MOVE_THRESHOLD`/`DOUBLE_TAP_MS`/`MUTE_KEY`/`MAX_DT` constants)

Replace `handleShapeTap`:

```js
const handleShapeTap = (id, x, y) => {
  const now = Date.now();
  const last = lastTapRef.current.get(id);
  if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < MOVE_THRESHOLD) {
    lastTapRef.current.delete(id);
    popShape(id);
    soundRef.current.playPop();
    return;
  }
  lastTapRef.current.set(id, { x, y, time: now });
  triggerPulse(id);
  const shape = objectsRef.current.find((o) => o.id === id);
  if (shape) soundRef.current.playNote(shape.note);
};
```

Replace the four pointer handlers:

```js
const onPointerDown = (e) => {
  if (pointersRef.current.size >= MAX_POINTERS) return;
  const pt = toLocal(e);
  pointersRef.current.set(e.pointerId, {
    pointerId: e.pointerId,
    mode: null,
    shapeId: shapeIdFromTarget(e.target),
    startX: pt.x,
    startY: pt.y,
    x: pt.x,
    y: pt.y,
    moved: false,
    strokeId: null,
    downTime: Date.now(),
  });
};

const onPointerMove = (e) => {
  const p = pointersRef.current.get(e.pointerId);
  if (!p) return;
  const pt = toLocal(e);
  p.x = pt.x;
  p.y = pt.y;
  if (!p.moved) {
    const distMoved = Math.hypot(pt.x - p.startX, pt.y - p.startY);
    if (distMoved < MOVE_THRESHOLD) return;
    p.moved = true;
    if (p.shapeId) {
      p.mode = 'drag';
    } else {
      p.mode = 'draw';
      p.strokeId = startStroke(p.startX, p.startY);
      soundRef.current.playStroke();
    }
  }
  if (p.mode === 'drag') moveShape(p.shapeId, pt.x, pt.y);
  else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
};

const onPointerUp = (e) => {
  const p = pointersRef.current.get(e.pointerId);
  if (!p) return;
  pointersRef.current.delete(e.pointerId);
  if (p.moved) return; // drag/draw already handled on move
  if (p.shapeId) {
    handleShapeTap(p.shapeId, p.startX, p.startY);
  } else {
    const pt = toLocal(e);
    const shape = spawnShape(pt.x, pt.y);
    soundRef.current.playNote(shape.note);
  }
};

const onPointerCancel = (e) => {
  pointersRef.current.delete(e.pointerId);
};
```

Update the drift loop's grabbed-id computation:

```js
// Replace:
//   const grabbed = pointerRef.current?.mode === 'drag' ? pointerRef.current.id : null;
//   advance(dt, { width: rect.width, height: rect.height }, grabbed);
// with:
const grabbedIds = new Set();
pointersRef.current.forEach((entry) => {
  if (entry.mode === 'drag') grabbedIds.add(entry.shapeId);
});
advance(dt, { width: rect.width, height: rect.height }, grabbedIds);
```

Update the unmount cleanup effect to also clear the map (parity with existing cleanup, though the ref would die with the component regardless):

```js
useEffect(() => () => {
  if (pulseTimer.current) clearTimeout(pulseTimer.current);
  pointersRef.current.clear();
}, []);
```

Remove the now-stale comment above the old single-slot `pointerRef` declaration and the old `onPointerDown`'s "ignore extra fingers" comment/guard, and the old `onPointerCancel` comment referencing the single-gesture guard (replace with a one-line note that a cancelled pointer's entry is simply dropped).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS — all tests, including the rewritten independent-second-finger test, the new concurrent-strokes test, and both new double-tap-proximity tests. Every pre-existing single-pointer test (`tap on empty space...`, `drag on empty space draws a stroke`, `drag starting on a shape moves it...`, `single tap on a shape plays its note`, `double tap on a shape pops it`, `clear button...`, `mute button...`, `runs a drift loop...`, `clears the tracked gesture on pointercancel...`, `maps pointer coordinates...`) still passes unmodified.

- [ ] **Step 5: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: track doodle canvas pointers independently for multi-touch"
```

---

### Task 3: Same-shape pinch-resize + rotate

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `pointersRef` (`Map<pointerId, PointerState>`, `PointerState.mode` now also takes `'pinch-member'` and `'inert'` values), `transformShape(id, { size, rotation })` from Task 1, `MIN_SIZE`/`MAX_SIZE` from `lib/doodleShapes.js`, `clamp` from `lib/random.js`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `components/doodle/DoodleCanvas.test.jsx`:

```js
it('two fingers landing together on the same shape pinch-resizes and rotates it', () => {
  // rng=0.1 -> shapeType index floor(0.1*4)=0 ('circle'), size=28+52*0.1=33.2,
  // rotation=0.1*360=36 — a circle keeps the size assertion simple (its `r`
  // attribute is size/2 directly, no polygon-point math needed).
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const circleBefore = g.querySelector('circle');
  const rBefore = Number(circleBefore.getAttribute('r'));
  const transformBefore = g.getAttribute('transform');

  // Two fingers touch down together on the shape, 20px apart horizontally.
  fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
  fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
  // Spread apart AND offset vertically -> both distance and angle change.
  fireEvent.pointerMove(svg, { clientX: 170, clientY: 180, pointerId: 10 });
  fireEvent.pointerMove(svg, { clientX: 230, clientY: 220, pointerId: 11 });

  const circleAfter = container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`);
  const rAfter = Number(circleAfter.getAttribute('r'));
  const transformAfter = container.querySelector(`[data-id="${g.getAttribute('data-id')}"]`).getAttribute('transform');

  expect(rAfter).toBeGreaterThan(rBefore); // grew
  expect(rAfter).toBeLessThanOrEqual(40); // clamped to MAX_SIZE/2
  expect(transformAfter).not.toBe(transformBefore); // rotation (and translate string) changed
  expect(transformAfter).toMatch(/^translate\(200 200\)/); // center did not move
});

it('pinch resize clamps at MIN_SIZE/MAX_SIZE instead of overshooting', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');

  fireEvent.pointerDown(g, { clientX: 195, clientY: 200, pointerId: 10 });
  fireEvent.pointerDown(g, { clientX: 205, clientY: 200, pointerId: 11 });
  // Enormous spread -> would far exceed MAX_SIZE without clamping.
  fireEvent.pointerMove(svg, { clientX: 0, clientY: 200, pointerId: 10 });
  fireEvent.pointerMove(svg, { clientX: 900, clientY: 200, pointerId: 11 });

  const rAfter = Number(container.querySelector(`[data-id="${g.getAttribute('data-id')}"] circle`).getAttribute('r'));
  expect(rAfter).toBe(40); // MAX_SIZE / 2
});

it('lifting one pinch finger hands off to a plain drag on the other, no jump', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const id = g.getAttribute('data-id');

  fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
  fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
  fireEvent.pointerMove(svg, { clientX: 170, clientY: 200, pointerId: 10 });
  fireEvent.pointerMove(svg, { clientX: 230, clientY: 200, pointerId: 11 });
  const sizeAfterPinch = container.querySelector(`[data-id="${id}"] circle`).getAttribute('r');

  fireEvent.pointerUp(svg, { clientX: 170, clientY: 200, pointerId: 10 }); // one finger lifts
  fireEvent.pointerMove(svg, { clientX: 260, clientY: 240, pointerId: 11 }); // survivor drags on

  const after = container.querySelector(`[data-id="${id}"]`);
  expect(after.getAttribute('transform')).toMatch(/^translate\(260 240\)/);
  expect(after.querySelector('circle').getAttribute('r')).toBe(sizeAfterPinch); // size held from the pinch, not reset
});

it('a third finger touching an already-pinched shape is inert, not a third gesture', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const id = g.getAttribute('data-id');

  fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 10 });
  fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 11 });
  fireEvent.pointerDown(g, { clientX: 200, clientY: 190, pointerId: 12 }); // third finger, same shape
  fireEvent.pointerMove(svg, { clientX: 200, clientY: 260, pointerId: 12 }); // moved a lot

  const after = container.querySelector(`[data-id="${id}"]`);
  expect(after.getAttribute('transform')).toMatch(/^translate\(200 200\)/); // unmoved by finger 3
  expect(() => fireEvent.pointerUp(svg, { clientX: 200, clientY: 260, pointerId: 12 })).not.toThrow();
});

it('a second finger landing on an already-dragged shape does not start a second drag', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const id = g.getAttribute('data-id');

  fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 20 });
  fireEvent.pointerMove(svg, { clientX: 220, clientY: 200, pointerId: 20 }); // finger 20 is now dragging

  fireEvent.pointerDown(g, { clientX: 200, clientY: 200, pointerId: 21 }); // finger 21 lands late (outside pinch window)
  fireEvent.pointerMove(svg, { clientX: 200, clientY: 400, pointerId: 21 }); // tries to move it elsewhere

  fireEvent.pointerMove(svg, { clientX: 240, clientY: 200, pointerId: 20 }); // finger 20 keeps dragging

  const transform = container.querySelector(`[data-id="${id}"]`).getAttribute('transform');
  expect(transform).toMatch(/^translate\(240 200\)/); // driven only by finger 20
});

it('two fingers on the same shape outside PINCH_WINDOW_MS do not pinch — first mover just drags', () => {
  const { container } = render(<DoodleCanvas rng={seq([0.1])} sound={mockSound()} />);
  const svg = stage(container);
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
  const g = container.querySelector('svg > g[data-id]');
  const id = g.getAttribute('data-id');
  const rBefore = g.querySelector('circle').getAttribute('r');

  const nowSpy = vi.spyOn(Date, 'now');
  nowSpy.mockReturnValue(0);
  fireEvent.pointerDown(g, { clientX: 190, clientY: 200, pointerId: 30 }); // finger A, t=0
  nowSpy.mockReturnValue(500); // 500ms later — well outside the 150ms pinch window
  fireEvent.pointerDown(g, { clientX: 210, clientY: 200, pointerId: 31 }); // finger B, t=500

  fireEvent.pointerMove(svg, { clientX: 150, clientY: 200, pointerId: 30 }); // A moves first -> claims the shape as a drag
  fireEvent.pointerMove(svg, { clientX: 400, clientY: 400, pointerId: 31 }); // B tries to move too -> inert, shape already claimed

  const after = container.querySelector(`[data-id="${id}"]`);
  expect(after.getAttribute('transform')).toMatch(/^translate\(150 200\)/); // driven only by finger A's drag
  expect(after.querySelector('circle').getAttribute('r')).toBe(rBefore); // no pinch resize happened
  nowSpy.mockRestore();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — no pinch detection exists yet, so two fingers on the same shape currently each just try to drag it independently (last-mover-wins jitter, no size/rotation change); the third-finger and stray-second-finger tests fail because nothing currently distinguishes "already claimed" shapes.

- [ ] **Step 3: Add pinch detection and claim-checking**

In `components/doodle/DoodleCanvas.jsx`:

```js
import { clamp } from '../../lib/random';
import { MIN_SIZE, MAX_SIZE } from '../../lib/doodleShapes';
```

```js
const PINCH_WINDOW_MS = 150; // two touches must land within this of each other to start a pinch
```
(add alongside `MAX_POINTERS`)

```js
const pinchesRef = useRef(new Map()); // shapeId -> PinchState
```
(add alongside `pointersRef`)

Destructure `transformShape` from `useDoodleObjects` at the top of the component, alongside the existing destructured methods.

Add a helper above the pointer handlers:

```js
// A shape is "claimed" once it has an active drag or an active pinch; a
// pointer landing on a claimed shape becomes inert rather than starting a
// second, conflicting gesture on the same shape.
const shapeIsClaimed = (shapeId) => pinchesRef.current.has(shapeId)
  || [...pointersRef.current.values()].some((entry) => entry.shapeId === shapeId && entry.mode === 'drag');
```

Replace `onPointerDown`:

```js
const onPointerDown = (e) => {
  if (pointersRef.current.size >= MAX_POINTERS) return;
  const pt = toLocal(e);
  const shapeId = shapeIdFromTarget(e.target);
  const now = Date.now();

  if (shapeId && shapeIsClaimed(shapeId)) {
    pointersRef.current.set(e.pointerId, {
      pointerId: e.pointerId, mode: 'inert', shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now,
    });
    return;
  }

  if (shapeId) {
    const partnerEntry = [...pointersRef.current.entries()].find(([, entry]) => (
      entry.shapeId === shapeId && entry.mode === null && !entry.moved
      && now - entry.downTime < PINCH_WINDOW_MS
    ));
    if (partnerEntry) {
      const [partnerId, partner] = partnerEntry;
      const shape = objectsRef.current.find((o) => o.id === shapeId);
      const startDist = Math.max(Math.hypot(pt.x - partner.startX, pt.y - partner.startY), 1);
      const startAngle = Math.atan2(pt.y - partner.startY, pt.x - partner.startX) * (180 / Math.PI);
      pinchesRef.current.set(shapeId, {
        pointerIds: [partnerId, e.pointerId], startDist, startAngle, startSize: shape.size, startRotation: shape.rotation,
      });
      partner.mode = 'pinch-member';
      pointersRef.current.set(e.pointerId, {
        pointerId: e.pointerId, mode: 'pinch-member', shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now,
      });
      return;
    }
  }

  pointersRef.current.set(e.pointerId, {
    pointerId: e.pointerId, mode: null, shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: false, strokeId: null, downTime: now,
  });
};
```

Replace `onPointerMove`:

```js
const onPointerMove = (e) => {
  const p = pointersRef.current.get(e.pointerId);
  if (!p) return;
  const pt = toLocal(e);
  p.x = pt.x;
  p.y = pt.y;

  if (p.mode === 'inert') return;

  if (p.mode === 'pinch-member') {
    const pinch = pinchesRef.current.get(p.shapeId);
    if (!pinch) return;
    const [idA, idB] = pinch.pointerIds;
    const a = pointersRef.current.get(idA);
    const b = pointersRef.current.get(idB);
    if (!a || !b) return;
    const liveDist = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
    const liveAngle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
    const size = clamp(pinch.startSize * (liveDist / pinch.startDist), MIN_SIZE, MAX_SIZE);
    const rotation = pinch.startRotation + (liveAngle - pinch.startAngle);
    transformShape(p.shapeId, { size, rotation });
    return;
  }

  if (!p.moved) {
    const distMoved = Math.hypot(pt.x - p.startX, pt.y - p.startY);
    if (distMoved < MOVE_THRESHOLD) return;
    p.moved = true;
    if (p.shapeId) {
      if (shapeIsClaimed(p.shapeId)) {
        p.mode = 'inert';
        return;
      }
      p.mode = 'drag';
    } else {
      p.mode = 'draw';
      p.strokeId = startStroke(p.startX, p.startY);
      soundRef.current.playStroke();
    }
  }
  if (p.mode === 'drag') moveShape(p.shapeId, pt.x, pt.y);
  else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
};
```

Replace `onPointerUp`:

```js
const onPointerUp = (e) => {
  const p = pointersRef.current.get(e.pointerId);
  if (!p) return;
  pointersRef.current.delete(e.pointerId);

  if (p.mode === 'inert') return;

  if (p.mode === 'pinch-member') {
    const pinch = pinchesRef.current.get(p.shapeId);
    pinchesRef.current.delete(p.shapeId);
    if (pinch) {
      const otherId = pinch.pointerIds.find((id) => id !== e.pointerId);
      const other = pointersRef.current.get(otherId);
      if (other) {
        other.mode = 'drag';
        other.moved = true;
        other.startX = other.x;
        other.startY = other.y;
      }
    }
    return;
  }

  if (p.moved) return;
  if (p.shapeId) {
    handleShapeTap(p.shapeId, p.startX, p.startY);
  } else {
    const pt = toLocal(e);
    const shape = spawnShape(pt.x, pt.y);
    soundRef.current.playNote(shape.note);
  }
};
```

Replace `onPointerCancel`:

```js
const onPointerCancel = (e) => {
  const p = pointersRef.current.get(e.pointerId);
  if (!p) return;
  pointersRef.current.delete(e.pointerId);
  if (p.mode === 'pinch-member') {
    const pinch = pinchesRef.current.get(p.shapeId);
    pinchesRef.current.delete(p.shapeId);
    if (pinch) {
      const otherId = pinch.pointerIds.find((id) => id !== e.pointerId);
      const other = pointersRef.current.get(otherId);
      if (other) {
        other.mode = 'drag';
        other.moved = true;
        other.startX = other.x;
        other.startY = other.y;
      }
    }
  }
};
```

Update the drift loop's grabbed-id computation to also hold pinched shapes still:

```js
const grabbedIds = new Set();
pointersRef.current.forEach((entry) => {
  if (entry.mode === 'drag' || entry.mode === 'pinch-member') grabbedIds.add(entry.shapeId);
});
advance(dt, { width: rect.width, height: rect.height }, grabbedIds);
```

Update the unmount cleanup effect to also clear `pinchesRef`:

```js
useEffect(() => () => {
  if (pulseTimer.current) clearTimeout(pulseTimer.current);
  pointersRef.current.clear();
  pinchesRef.current.clear();
}, []);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS — all pinch tests plus every test from Task 2 and the original single-pointer suite.

- [ ] **Step 5: Full test suite and lint**

Run: `npx vitest run`
Expected: PASS, all suites (`doodleShapes`, `doodleSound`, `useDoodleObjects`, `DoodleCanvas`, and unrelated app tests untouched).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: add same-shape pinch resize and rotate to doodle canvas"
```

---

## Manual verification (not automated)

Since this is a touch-first interaction feature, after Task 3 lands, manually verify on an actual touch device or Chrome DevTools' multi-touch emulation (not just the test suite):

- Drag a shape with one hand while drawing a line with the other.
- Drag a shape while tapping out new shapes with the other hand.
- Two people on the same tablet, each dragging/drawing/tapping independently.
- Two-finger pinch on a shape resizes and rotates it smoothly, with no jump when one finger lifts.
