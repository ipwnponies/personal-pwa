# Doodle Stroke Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every finger-drawn stroke static collision geometry, so shapes bounce off drawn lines instead of passing through them.

**Architecture:** A new pure module `lib/doodleWalls.js` derives wall geometry live from `stroke.points` each frame (bounding box cached in a ref for broad-phase rejection) and resolves circle-against-capsule collisions per segment. `lib/useDoodleObjects.js` runs that pass after the existing shape-against-shape pass, re-clamps to bounds, and tracks shapes that are pinned against a wall so they can be granted temporary `wallImmunityRemaining`. `lib/doodlePhysics.js` and the stroke data model are untouched.

**Tech Stack:** JavaScript (no TypeScript), React 18 hooks, Vitest + jsdom + React Testing Library, ESLint Airbnb.

**Spec:** `docs/superpowers/specs/2026-09-19-doodle-stroke-walls-design.md`

## Global Constraints

- **No new dependency.** Hand-rolled math only. Do not add Matter.js or any
  other physics library. Do not touch `package.json` or `package-lock.json`.
- **No change to stroke drawing.** `components/doodle/Stroke.jsx` and the
  stroke object shape `{ id, kind: 'stroke', color, points }` stay exactly as
  they are. No new field, no migration, no version marker.
- **No regression to `lib/doodlePhysics.js`.** `resolveCollisions` keeps its
  exact signature and behavior. Every existing case in
  `lib/doodlePhysics.test.js` and `lib/doodleShapes.test.js` must stay green.
- **No spatial partitioning.** Bounding-box pruning only. No grid, quadtree,
  or BVH.
- **`WALL_RADIUS = 4`** exactly (half of `Stroke.jsx`'s `strokeWidth={8}`).
  Collision geometry is the visible ink, never a halo or a simplified proxy.
- **No `rng` parameter anywhere in `lib/doodleWalls.js`.** Wall collision makes
  no random choice. Adding an `rng()` draw would shift every later draw and
  break `seq([...])` tests elsewhere (see `.claude/rules/doodle.md`).
- **Tuning-panel convention** (`.claude/rules/doodle.md`): every feel constant
  is exported from its owning `lib/` module as a `DEFAULT_*` and taken as an
  optional parameter, with `DoodleCanvas` the only place that threads live
  tuning state in. Structural/safety constants (`WALL_RADIUS`,
  `MAX_WALL_PUSH_PER_FRAME`, `STUCK_DISPLACEMENT`) stay plain.
- **ESLint Airbnb, unmodified.** No `for...of`, no `continue`, no `++`, no
  assignment to a function parameter's properties. Mutate elements read out of
  a locally-created array (the `lib/doodlePhysics.js` pattern), never a
  callback parameter.
- Tests are co-located next to the file they test. Any test file containing
  JSX needs a `.jsx` extension.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/doodleWalls.js` (new) | Everything wall-related and pure: constants, `strokeBounds`, `buildWalls`, `resolveWallCollisions`, `clampIntoBounds`, `trackStuck`. No React, no refs, no `rng`. |
| `lib/doodleWalls.test.js` (new) | Unit tests for the above. |
| `lib/doodleShapes.js` | One addition: `advanceShape` counts down `wallImmunityRemaining`. |
| `lib/doodleShapes.test.js` | Extended with the countdown cases. |
| `lib/useDoodleObjects.js` | Orchestration only: runs the wall pass inside `advance`, owns the two refs (wall cache, stuck tracker), adds `releaseShape`. |
| `lib/useDoodleObjects.test.jsx` | Extended. |
| `components/doodle/DoodleCanvas.jsx` | Event wiring (`wallBounce` burst), release hookup, tuning threading. |
| `components/doodle/DoodleCanvas.test.jsx` | Extended. |
| `components/doodle/TuningPanel.jsx` | Three new rows. |
| `components/doodle/TuningPanel.test.jsx` | Extended `baseTuning` + assertions. |
| `.claude/rules/doodle.md` | Documents the new module and the second instance of the countdown pattern. |

`lib/doodlePhysics.js` is deliberately absent from this table. Wall math lives
in its own module so the no-regression constraint holds structurally.

---

### Task 1: Wall geometry model

Constants, per-stroke bounding boxes, and the memoized wall builder. Pure
data, no collision math, no behavior change anywhere in the app.

**Files:**
- Create: `lib/doodleWalls.js`
- Create: `lib/doodleWalls.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WALL_RADIUS` (number, `4`)
  - `strokeBounds(stroke) -> { minX, minY, maxX, maxY }`
  - `buildWalls(strokes, cache) -> Array<{ id, points, bounds }>`, where
    `cache` is a `Map<strokeId, { pointCount, wall }>` the caller owns.

- [ ] **Step 1: Write the failing tests**

Create `lib/doodleWalls.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { strokeBounds, buildWalls, WALL_RADIUS } from './doodleWalls';

const stroke = (overrides) => ({
  id: 'w', kind: 'stroke', color: '#e63946', points: [{ x: 0, y: 0 }], ...overrides,
});

describe('strokeBounds', () => {
  it('spans every point, expanded by WALL_RADIUS on each side', () => {
    const bounds = strokeBounds(stroke({
      points: [{ x: 10, y: 50 }, { x: 90, y: 20 }, { x: 40, y: 70 }],
    }));
    expect(bounds).toEqual({
      minX: 10 - WALL_RADIUS,
      minY: 20 - WALL_RADIUS,
      maxX: 90 + WALL_RADIUS,
      maxY: 70 + WALL_RADIUS,
    });
  });

  it('gives a single-point stroke a box of one wall thickness around it', () => {
    const bounds = strokeBounds(stroke({ points: [{ x: 100, y: 100 }] }));
    expect(bounds).toEqual({
      minX: 96, minY: 96, maxX: 104, maxY: 104,
    });
  });
});

describe('buildWalls', () => {
  it('returns one wall per stroke carrying its id, points and bounds', () => {
    const a = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const b = stroke({ id: 'b', points: [{ x: 50, y: 50 }, { x: 60, y: 50 }] });
    const walls = buildWalls([a, b], new Map());
    expect(walls).toHaveLength(2);
    expect(walls[0].id).toBe('a');
    expect(walls[0].points).toBe(a.points);
    expect(walls[0].bounds).toEqual(strokeBounds(a));
  });

  it('reuses the cached wall when the stroke has not grown', () => {
    const cache = new Map();
    const s = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const first = buildWalls([s], cache)[0];
    const second = buildWalls([s], cache)[0];
    expect(second).toBe(first);
  });

  it('rebuilds a wall once the stroke gains a point mid-draw', () => {
    const cache = new Map();
    const s = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const first = buildWalls([s], cache)[0];
    const grown = { ...s, points: [...s.points, { x: 10, y: 80 }] };
    const second = buildWalls([grown], cache)[0];
    expect(second).not.toBe(first);
    expect(second.bounds.maxY).toBe(80 + WALL_RADIUS);
  });

  it('drops cache entries for strokes that no longer exist', () => {
    const cache = new Map();
    const a = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const b = stroke({ id: 'b', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    buildWalls([a, b], cache);
    expect(cache.size).toBe(2);
    buildWalls([a], cache);
    expect(cache.size).toBe(1);
    expect(cache.has('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: FAIL — `Failed to resolve import "./doodleWalls"`.

- [ ] **Step 3: Write the implementation**

Create `lib/doodleWalls.js`:

```js
// Static collision geometry derived from finger-drawn strokes. Every function
// here is pure: no React, no refs, and deliberately no `rng` — wall collision
// makes no random choice, so the seq([...]) draw-position gotcha documented in
// .claude/rules/doodle.md cannot apply to this module.

// Half of Stroke.jsx's strokeWidth={8}: collision geometry is exactly the
// visible ink, with no invisible halo. Structural, not a feel constant.
export const WALL_RADIUS = 4;

// Axis-aligned box over a stroke's points, expanded by the wall's own
// half-thickness so the box covers the drawn line rather than its centerline.
// An empty points array yields an inverted box (minX Infinity, maxX -Infinity)
// that no overlap test can match, which is the behavior we want.
export function strokeBounds(stroke) {
  const { points } = stroke;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - WALL_RADIUS,
    minY: minY - WALL_RADIUS,
    maxX: maxX + WALL_RADIUS,
    maxY: maxY + WALL_RADIUS,
  };
}

// Walls are derived live every frame rather than baked at stroke commit, so
// the stroke data model stays untouched, old strokes in localStorage become
// walls with no migration, and a stroke still being drawn is already a wall.
// Only the bounding box is memoized. `cache` is passed in (rather than held in
// module scope) so this stays testable in isolation and so the owner —
// useDoodleObjects — can keep it in a ref, out of persisted state.
//
// The key is the stroke id plus its point count: appendStrokePoint only ever
// grows a stroke, so a changed count is exactly "this stroke changed".
export function buildWalls(strokes, cache) {
  const walls = strokes.map((stroke) => {
    const cached = cache.get(stroke.id);
    if (cached && cached.pointCount === stroke.points.length) return cached.wall;
    const wall = { id: stroke.id, points: stroke.points, bounds: strokeBounds(stroke) };
    cache.set(stroke.id, { pointCount: stroke.points.length, wall });
    return wall;
  });
  // Clearing the canvas removes strokes; without this the cache would keep
  // their entries alive for the lifetime of the page.
  if (cache.size > strokes.length) {
    const live = new Set(strokes.map((s) => s.id));
    cache.forEach((_, id) => {
      if (!live.has(id)) cache.delete(id);
    });
  }
  return walls;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Lint**

Run: `npx eslint lib/doodleWalls.js lib/doodleWalls.test.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/doodleWalls.js lib/doodleWalls.test.js
git commit -m "feat(doodle): add stroke wall geometry model"
```

---

### Task 2: Circle-against-capsule collision resolution

The whole collision pass, pure and still wired to nothing. Every degenerate
case is covered here, because this is the only place it can be tested without
a canvas.

**Files:**
- Modify: `lib/doodleWalls.js` (append)
- Modify: `lib/doodleWalls.test.js` (append)

**Interfaces:**
- Consumes: `WALL_RADIUS`, `buildWalls` from Task 1.
- Produces:
  - `DEFAULT_WALL_RESTITUTION` (number, `0.9`)
  - `MAX_WALL_PUSH_PER_FRAME` (number, `4`)
  - `resolveWallCollisions(shapes, walls, grabbedIds = null, restitution = DEFAULT_WALL_RESTITUTION) -> { shapes, events, contacts }`
    - `shapes`: copies, with corrected positions and velocities.
    - `events`: `{ type: 'wallBounce', x, y, color, normal: { x, y } }` — only
      where an impulse was actually applied.
    - `contacts`: `Set<shapeId>` of every shape that overlapped a wall this
      frame, impulse or not. This is a refinement of the spec's stated
      `{ shapes, events }` signature: the stuck detector in Task 4 needs to
      know about a shape pinned against a wall with no impulse, which is
      exactly the case `events` excludes.

- [ ] **Step 1: Write the failing tests**

Append to `lib/doodleWalls.test.js`:

```js
import {
  resolveWallCollisions, DEFAULT_WALL_RESTITUTION, MAX_WALL_PUSH_PER_FRAME,
} from './doodleWalls';

// Add to the existing imports at the top of the file rather than repeating the
// import statement — shown separately here only for clarity.

const shape = (overrides) => ({
  id: 's', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
  rotation: 0, size: 40, note: 440, vx: 0, vy: 0, ...overrides,
});

// A horizontal line across y = 100, from x = 0 to x = 200.
const lineWall = () => buildWalls(
  [stroke({ id: 'w', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] })],
  new Map(),
);

describe('resolveWallCollisions', () => {
  it('leaves a shape clear of every wall untouched', () => {
    const s = shape({ x: 100, y: 10 });
    const { shapes, events, contacts } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
    expect(contacts.size).toBe(0);
  });

  it('reflects a shape driven head-on into a wall and separates it', () => {
    // r = 20, WALL_RADIUS = 4, so contact starts at 24px from the line.
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].y).toBeCloseTo(76); // pushed 4px out along the normal
    expect(shapes[0].x).toBeCloseTo(100); // no sideways drift
    expect(shapes[0].vy).toBeCloseTo(-50 * DEFAULT_WALL_RESTITUTION);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'wallBounce', x: 100, y: 100, color: '#e63946', normal: { x: 0, y: -1 },
    });
  });

  it('ignores a shape passing by outside the wall thickness', () => {
    const s = shape({ x: 100, y: 130, vx: 60 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('registers contact but emits no event for a shape already moving away', () => {
    const s = shape({ x: 100, y: 80, vy: -10 });
    const { shapes, events, contacts } = resolveWallCollisions([s], lineWall());
    expect(events).toEqual([]);            // the velAlongNormal gate
    expect(contacts.has('s')).toBe(true);  // but it is touching the wall
    expect(shapes[0].y).toBeCloseTo(76);   // and still gets pushed out
  });

  it('caps position correction at MAX_WALL_PUSH_PER_FRAME for a deep overlap', () => {
    // A line drawn straight through a resting shape: 19px of overlap.
    const s = shape({ x: 100, y: 95 });
    const { shapes } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].y).toBeCloseTo(95 - MAX_WALL_PUSH_PER_FRAME);
  });

  it('rejects a wall by its bounding box before testing any segment', () => {
    // Hand-built wall whose bounds deliberately exclude the shape while its
    // points would overlap it — proves broad phase runs and short-circuits.
    const liar = {
      id: 'w',
      points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      bounds: {
        minX: 900, minY: 900, maxX: 1000, maxY: 1000,
      },
    };
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes, events } = resolveWallCollisions([s], [liar]);
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('skips a grabbed shape entirely, so the finger passes through walls', () => {
    const s = shape({ x: 100, y: 95, vy: 50 });
    const { shapes, events, contacts } = resolveWallCollisions(
      [s], lineWall(), new Set(['s']),
    );
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
    expect(contacts.size).toBe(0);
  });

  it('skips a shape with active wall immunity', () => {
    const s = shape({ x: 100, y: 95, vy: 50, wallImmunityRemaining: 0.5 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('honours a custom restitution', () => {
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes } = resolveWallCollisions([s], lineWall(), null, 0.5);
    expect(shapes[0].vy).toBeCloseTo(-25);
  });

  it('resolves against a dot stroke (two identical points) without NaN', () => {
    const dot = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 100 }, { x: 100, y: 100 }] })],
      new Map(),
    );
    const s = shape({ x: 100, y: 110, vy: -30 });
    const { shapes, events } = resolveWallCollisions([s], dot);
    expect(Number.isFinite(shapes[0].x)).toBe(true);
    expect(Number.isFinite(shapes[0].y)).toBe(true);
    expect(shapes[0].y).toBeCloseTo(114);
    expect(shapes[0].vy).toBeCloseTo(30 * DEFAULT_WALL_RESTITUTION);
    expect(events).toHaveLength(1);
  });

  it('pushes a shape centered exactly on a segment out along its perpendicular', () => {
    const s = shape({ x: 100, y: 100 });
    const { shapes } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].x).toBeCloseTo(100);
    expect(Math.abs(shapes[0].y - 100)).toBeCloseTo(MAX_WALL_PUSH_PER_FRAME);
  });

  it('pushes a shape centered exactly on a dot along a deterministic axis', () => {
    const dot = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 100 }, { x: 100, y: 100 }] })],
      new Map(),
    );
    const s = shape({ id: 's', x: 100, y: 100 });
    const first = resolveWallCollisions([s], dot).shapes[0];
    const second = resolveWallCollisions([s], dot).shapes[0];
    expect(first.x).toBeCloseTo(104); // 's' < 'w' -> +x axis
    expect(second.x).toBe(first.x);   // and it never varies
  });

  it('reflects twice at a sharp corner when still moving into the second segment', () => {
    // An L: down the left edge, then right along the bottom.
    const corner = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }] })],
      new Map(),
    );
    const s = shape({ x: 80, y: 80, vx: 40, vy: 40 });
    const { shapes } = resolveWallCollisions([s], corner);
    expect(shapes[0].vx).toBeLessThan(0); // bounced off the vertical segment
    expect(shapes[0].vy).toBeLessThan(0); // and off the horizontal one
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: FAIL — `resolveWallCollisions is not a function`.

- [ ] **Step 3: Write the implementation**

Add the `clamp` import at the top of `lib/doodleWalls.js`:

```js
import { clamp } from './random';
```

Append to `lib/doodleWalls.js`:

```js
// Same value as doodlePhysics' RESTITUTION: a wall bounces a shape exactly as
// another shape would, which is the least surprising thing for a child. A feel
// constant, so it is threaded from the tuning panel.
export const DEFAULT_WALL_RESTITUTION = 0.9;

// Ceiling on how far one shape may be pushed out of walls in a single frame.
// Drawing a line straight through a resting shape creates an arbitrarily deep
// overlap; without this cap the shape would be flung clear in one frame. With
// it, it emerges over a few frames. Structural, so it stays plain.
export const MAX_WALL_PUSH_PER_FRAME = 4;

// Resolves every shape against every wall. Walls are immovable (infinite
// mass), so a shape absorbs the entire position correction and the entire
// impulse — which is why its own mass cancels out of the impulse below, unlike
// the mass-weighted shape-against-shape path in doodlePhysics.
//
// grabbedIds (optional): a Set of shapes held by a pointer or pinch. Unlike
// doodlePhysics, a grabbed shape is skipped outright rather than treated as
// infinite mass: the finger always wins, so a child can hand-rescue a shape
// from anywhere and can deliberately park one inside a drawn pen.
//
// Returns `contacts` alongside `events`: `events` only fires where an impulse
// was applied (so a shape resting against a line doesn't emit a particle burst
// every frame), while the stuck detector needs to know about exactly that
// impulse-free resting case.
export function resolveWallCollisions(
  shapes,
  walls,
  grabbedIds = null,
  restitution = DEFAULT_WALL_RESTITUTION,
) {
  const working = shapes.map((s) => ({ ...s }));
  const events = [];
  const contacts = new Set();

  for (let s = 0; s < working.length; s += 1) {
    const shape = working[s];
    const immune = (shape.wallImmunityRemaining || 0) > 0;
    if (!immune && !grabbedIds?.has(shape.id)) {
      const r = shape.size / 2;
      const minDist = r + WALL_RADIUS;
      let pushBudget = MAX_WALL_PUSH_PER_FRAME;

      for (let w = 0; w < walls.length; w += 1) {
        const wall = walls[w];
        const { bounds, points } = wall;
        // Broad phase: one box test rejects every segment of a distant stroke.
        const near = !(shape.x + r < bounds.minX || shape.x - r > bounds.maxX
          || shape.y + r < bounds.minY || shape.y - r > bounds.maxY);

        if (near) {
          // A stroke of one point (startStroke, before the first append) is a
          // single segment from that point to itself.
          const segCount = Math.max(points.length - 1, 1);
          for (let i = 0; i < segCount; i += 1) {
            const a = points[i];
            const b = points[i + 1] || a;
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const lenSq = abx * abx + aby * aby;
            // Closest point on the segment. A zero-length segment (a draw-mode
            // tap is a stroke of two identical points) collapses t to 0 and
            // the capsule degenerates to a circle, which is correct.
            const t = lenSq > 0
              ? clamp(((shape.x - a.x) * abx + (shape.y - a.y) * aby) / lenSq, 0, 1)
              : 0;
            const qx = a.x + abx * t;
            const qy = a.y + aby * t;
            const dx = shape.x - qx;
            const dy = shape.y - qy;
            const dist = Math.hypot(dx, dy);

            if (dist < minDist) {
              contacts.add(shape.id);
              let nx;
              let ny;
              if (dist > 0) {
                nx = dx / dist;
                ny = dy / dist;
              } else if (lenSq > 0) {
                // Center exactly on the segment: no direction to derive from
                // the offset, so push out along the segment's perpendicular.
                const len = Math.sqrt(lenSq);
                nx = -aby / len;
                ny = abx / len;
              } else {
                // Center exactly on a zero-length segment: nothing geometric
                // is left, so pick a deterministic axis from the two ids —
                // the same trick doodlePhysics uses for coincident shapes.
                nx = shape.id < wall.id ? 1 : -1;
                ny = 0;
              }

              const push = Math.min(minDist - dist, pushBudget);
              if (push > 0) {
                shape.x += nx * push;
                shape.y += ny * push;
                pushBudget -= push;
              }

              // Same gate as doodlePhysics: reflect only when the shape is
              // actually moving into the wall. Multiple contacts in one frame
              // resolve in sequence — at a sharp corner a shape reflected off
              // one segment may still be moving into the next, and reflecting
              // again there is correct, not double-counting.
              const velAlongNormal = shape.vx * nx + shape.vy * ny;
              if (velAlongNormal < 0) {
                const impulse = -(1 + restitution) * velAlongNormal;
                shape.vx += impulse * nx;
                shape.vy += impulse * ny;
                events.push({
                  type: 'wallBounce', x: qx, y: qy, color: shape.color, normal: { x: nx, y: ny },
                });
              }
            }
          }
        }
      }
    }
  }

  return { shapes: working, events, contacts };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: PASS, 18 tests.

- [ ] **Step 5: Verify nothing else moved**

Run: `npm test`
Expected: PASS, whole suite. `lib/doodlePhysics.test.js` and
`lib/doodleShapes.test.js` untouched and green.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/doodleWalls.js lib/doodleWalls.test.js`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add lib/doodleWalls.js lib/doodleWalls.test.js
git commit -m "feat(doodle): add circle-capsule wall collision resolution"
```

---

### Task 3: Wire walls into the canvas

Walls become live here: `advance` runs the wall pass, bounces spawn particles,
and `wallRestitution` joins the tuning panel.

**Files:**
- Modify: `lib/useDoodleObjects.js`
- Modify: `lib/useDoodleObjects.test.jsx`
- Modify: `components/doodle/DoodleCanvas.jsx`
- Modify: `components/doodle/DoodleCanvas.test.jsx`
- Modify: `components/doodle/TuningPanel.jsx`
- Modify: `components/doodle/TuningPanel.test.jsx`

**Interfaces:**
- Consumes: `buildWalls`, `resolveWallCollisions`, `DEFAULT_WALL_RESTITUTION`
  from Tasks 1-2.
- Produces:
  - `advance(dtSeconds, bounds, grabbedIds, tuning = {})` — the fourth
    parameter is an options object, not three trailing positionals, so the
    call site stays readable as Task 4 adds two more knobs. It reads
    `{ wallRestitution }` here. The return value is still the event array,
    now with `wallBounce` events appended after the shape-against-shape ones.
  - Tuning key `wallRestitution` (default `0.9`).

- [ ] **Step 1: Write the failing tests**

Append to `lib/useDoodleObjects.test.jsx`, inside the existing
`describe('useDoodleObjects', ...)`:

```js
  // Drives a shape at (100, 80) straight down into a stroke drawn across
  // y = 100. r = 20 + WALL_RADIUS 4 means contact begins 24px out.
  const setUpWallHit = (result) => {
    let shape;
    act(() => { shape = result.current.spawnShape(100, 80); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 100); });
    act(() => result.current.appendStrokePoint(strokeId, 200, 100));
    act(() => {
      const live = result.current.objects.find((o) => o.id === shape.id);
      live.x = 100;
      live.y = 80;
      live.vx = 0;
      live.vy = 50;
      live.size = 40;
    });
    return shape;
  };

  it('advance returns wallBounce events for a shape driven into a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    setUpWallHit(result);
    let events;
    act(() => {
      events = result.current.advance(0.001, { width: 1000, height: 1000 }, null);
    });
    expect(events.some((e) => e.type === 'wallBounce')).toBe(true);
  });

  it('advance reverses a shape driven into a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    act(() => result.current.advance(0.001, { width: 1000, height: 1000 }, null));
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.vy).toBeLessThan(0);
  });

  it('advance lets a grabbed shape pass through a stroke', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    let events;
    act(() => {
      events = result.current.advance(
        0.001, { width: 1000, height: 1000 }, new Set([shape.id]),
      );
    });
    expect(events.some((e) => e.type === 'wallBounce')).toBe(false);
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.y).toBe(80);
  });

  it('advance threads wallRestitution from its tuning argument', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    const shape = setUpWallHit(result);
    act(() => result.current.advance(
      0.001, { width: 1000, height: 1000 }, null, { wallRestitution: 0.2 },
    ));
    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.vy).toBeCloseTo(-10, 0); // 50 * 0.2, minus a sliver of drift
  });
```

Append to `components/doodle/DoodleCanvas.test.jsx`, inside the existing
`describe('DoodleCanvas', ...)`:

```js
  it('a shape drifting into a drawn stroke spawns a bounce burst', () => {
    // seq([0]) -> createShape draws [angle 0, speed, shapeType, color,
    // rotation, size, note]: angle 0 gives vx = +driftMin (20px/s, +x), size
    // is the 2x tablet floor (56 -> r 28), so contact with a line at x = 560
    // begins 32px out. Spawning at x = 535 starts it already overlapping and
    // moving into the line.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(
      <DoodleCanvas rng={seq([0])} sound={mockSound()} />,
    );
    const svg = stage(container);

    fireEvent.click(getByLabelText('Switch to draw mode'));
    fireEvent.pointerDown(svg, { clientX: 560, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 560, clientY: 600, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 560, clientY: 600, pointerId: 1 });
    fireEvent.click(getByLabelText('Switch to shape mode'));
    fireEvent.pointerDown(svg, { clientX: 535, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 535, clientY: 500, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);

    widthSpy.mockRestore();
    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });
```

In `components/doodle/TuningPanel.test.jsx`, extend `baseTuning` and the
first test:

```js
const baseTuning = {
  maxParticles: 150,
  dustMaxAge: 0.3,
  dustFrameInterval: 3,
  driftMin: 18,
  driftMax: 18,
  wallRestitution: 0.9,
};
```

and add, inside the "renders a number input for every tuning field" test:

```js
    expect(getByLabelText('Wall bounciness').value).toBe('0.9');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/useDoodleObjects.test.jsx components/doodle/DoodleCanvas.test.jsx components/doodle/TuningPanel.test.jsx`
Expected: FAIL — no `wallBounce` event is ever produced, no burst lines
appear, and `Wall bounciness` has no matching label.

- [ ] **Step 3: Add the wall pass to the hook**

In `lib/useDoodleObjects.js`, extend the imports:

```js
import { buildWalls, resolveWallCollisions, DEFAULT_WALL_RESTITUTION } from './doodleWalls';
```

Add the cache ref next to the existing refs (just after `const dirtyRef = useRef(false);`):

```js
  // Per-stroke bounding boxes for wall broad phase. A ref, never state: it is
  // derived data that must not reach the localStorage snapshot, and mutating
  // it must not trigger a render.
  const wallCacheRef = useRef(new Map());
```

Replace the tail of `advance` (from `const survivorIds = ...` through
`return events;`) with:

```js
    const survivorIds = new Set(survivors.map((o) => o.id));
    const mergedOnly = resolved.shapes.filter((s) => !survivorIds.has(s.id));
    const afterShapes = [...survivors, ...mergedOnly];

    // Walls run after shape-against-shape so immovable geometry gets the last
    // word: a shape shoved into a line by another shape — or a merge that
    // yields a bigger, more deeply embedded shape — ends the frame outside the
    // line rather than inside it, subject to the per-frame push cap.
    const walls = buildWalls(
      afterShapes.filter((o) => o.kind === 'stroke'),
      wallCacheRef.current,
    );
    const wallPass = resolveWallCollisions(
      afterShapes.filter((o) => o.kind === 'shape'),
      walls,
      grabbedIds,
      wallRestitution,
    );
    const wallById = new Map(wallPass.shapes.map((s) => [s.id, s]));
    const next = afterShapes.map((o) => (
      o.kind === 'shape' && !grabbedIds?.has(o.id) ? wallById.get(o.id) : o
    ));

    commit(next);
    return [...events, ...wallPass.events];
```

and change the `advance` signature line to:

```js
  const advance = useCallback((dtSeconds, bounds, grabbedIds, tuning = {}) => {
    const { wallRestitution = DEFAULT_WALL_RESTITUTION } = tuning;
```

- [ ] **Step 4: Wire the canvas**

In `components/doodle/DoodleCanvas.jsx`, add the import:

```js
import { DEFAULT_WALL_RESTITUTION } from '../../lib/doodleWalls';
```

Add the tuning default to `DEFAULT_TUNING`:

```js
  wallRestitution: DEFAULT_WALL_RESTITUTION,
```

Pass tuning into `advance` in the rAF loop:

```js
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds, {
          wallRestitution: tuningRef.current.wallRestitution,
        });
```

Handle the new event type by widening the existing bounce branch — a wall
bounce looks exactly like a shape bounce and stays silent for the same
reason (bounces are the frequent case; audio is reserved for merges):

```js
          if (event.type === 'bounce' || event.type === 'wallBounce') {
            addParticles(spawnBurst(event.x, event.y, event.color, event.normal, COLLISION_BURST_MAX_AGE));
          } else if (event.type === 'merge') {
```

- [ ] **Step 5: Add the tuning-panel row**

In `components/doodle/TuningPanel.jsx`, append to `FIELDS`:

```js
  {
    key: 'wallRestitution', label: 'Wall bounciness', min: 0, max: 1, step: 0.05,
  },
```

and to the `tuning` shape in `TuningPanel.propTypes`:

```js
    wallRestitution: PropTypes.number.isRequired,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 7: Lint**

Run: `npx eslint lib components/doodle`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx components/doodle/TuningPanel.jsx components/doodle/TuningPanel.test.jsx
git commit -m "feat(doodle): bounce shapes off drawn strokes"
```

---

### Task 4: Stuck-shape escape hatch

A shape must never sit pinned and jittering against a wall. Two triggers
(detected stuck state, and release from a drag or pinch) grant the same
temporary immunity, and the wall-against-canvas-edge deadlock is detected
rather than fought.

**Files:**
- Modify: `lib/doodleWalls.js` (append)
- Modify: `lib/doodleWalls.test.js` (append)
- Modify: `lib/doodleShapes.js:184-188`
- Modify: `lib/doodleShapes.test.js`
- Modify: `lib/useDoodleObjects.js`
- Modify: `lib/useDoodleObjects.test.jsx`
- Modify: `components/doodle/DoodleCanvas.jsx`
- Modify: `components/doodle/DoodleCanvas.test.jsx`
- Modify: `components/doodle/TuningPanel.jsx`
- Modify: `components/doodle/TuningPanel.test.jsx`
- Modify: `.claude/rules/doodle.md`

**Interfaces:**
- Consumes: `WALL_RADIUS`, `resolveWallCollisions`'s `contacts` Set, and
  `advance`'s `tuning` options object from Tasks 1-3.
- Produces:
  - `DEFAULT_STUCK_AFTER_S` (number, `1`), `DEFAULT_WALL_IMMUNITY_S`
    (number, `1.5`), `STUCK_DISPLACEMENT` (number, `WALL_RADIUS * 2`)
  - `clampIntoBounds(shape, bounds) -> { shape, clamped }`
  - `createStuckState() -> { elapsed, positions, contacted }`
  - `trackStuck(state, shapes, contacts, dtSeconds, stuckAfterS = DEFAULT_STUCK_AFTER_S) -> { state, stuck }`
    — immutable in and out, so it never assigns to a parameter's properties
    (Airbnb `no-param-reassign`) and is trivially testable.
  - Shape field `wallImmunityRemaining` (seconds), counted down by
    `advanceShape` exactly like `splitGraceRemaining`.
  - `releaseShape(id, wallImmunityS = DEFAULT_WALL_IMMUNITY_S)` on the hook.
  - Tuning keys `stuckAfterS` (default `1`) and `wallImmunityS` (default `1.5`).

- [ ] **Step 1: Write the failing tests for the pure helpers**

Append to `lib/doodleWalls.test.js`:

```js
import {
  clampIntoBounds, createStuckState, trackStuck, STUCK_DISPLACEMENT, DEFAULT_STUCK_AFTER_S,
} from './doodleWalls';

// (fold into the existing import at the top of the file)

describe('clampIntoBounds', () => {
  it('returns the shape untouched when it is fully inside', () => {
    const s = shape({ x: 500, y: 500 });
    const result = clampIntoBounds(s, { width: 1000, height: 1000 });
    expect(result.clamped).toBe(false);
    expect(result.shape).toBe(s);
  });

  it('pulls a shape pushed past an edge back in and reports the clamp', () => {
    const s = shape({ x: -5, y: 500, vx: -40 });
    const result = clampIntoBounds(s, { width: 1000, height: 1000 });
    expect(result.clamped).toBe(true);
    expect(result.shape.x).toBe(20); // its own radius
    expect(result.shape.vx).toBe(-40); // velocity untouched: the wall owns it
  });

  it('does not invert when a shape is wider than the stage', () => {
    const s = shape({ x: 5, y: 5, size: 400 });
    const result = clampIntoBounds(s, { width: 100, height: 100 });
    expect(result.shape.x).toBe(200);
    expect(result.shape.y).toBe(200);
  });
});

describe('trackStuck', () => {
  const at = (x, y) => shape({ id: 's', x, y });

  it('reports nothing before a full window has elapsed', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), 0.1));
    const result = trackStuck(state, [at(0, 0)], new Set(['s']), 0.1);
    expect(result.stuck.size).toBe(0);
  });

  it('flags a shape that barely moved while touching a wall', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(
      state, [at(STUCK_DISPLACEMENT / 2, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S,
    );
    expect(result.stuck.has('s')).toBe(true);
  });

  it('ignores a slow shape that never touched a wall', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(state, [at(1, 0)], new Set(), DEFAULT_STUCK_AFTER_S);
    expect(result.stuck.size).toBe(0);
  });

  it('ignores a shape that covered real ground inside a drawn pen', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(state, [at(60, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S);
    expect(result.stuck.size).toBe(0);
  });

  it('resets the window after reporting', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    expect(state.elapsed).toBe(0);
    expect(state.contacted.size).toBe(0);
    expect(state.positions.get('s')).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: FAIL — `clampIntoBounds is not a function`.

- [ ] **Step 3: Implement the pure helpers**

Append to `lib/doodleWalls.js`:

```js
// How long a shape ignores walls once it is freed. Long enough to drift clear
// of a line at any tuned drift speed. A feel constant: the right value can
// only be found by watching a child play, which is exactly the bar the
// tuning-panel convention sets.
export const DEFAULT_WALL_IMMUNITY_S = 1.5;

// Window over which a shape's net displacement is measured. Also a feel
// constant, for the same reason.
export const DEFAULT_STUCK_AFTER_S = 1;

// Net displacement below which a shape counts as not having moved: one wall
// thickness, far less than even the slowest drifting shape covers in a second.
// Structural, so it stays plain.
export const STUCK_DISPLACEMENT = WALL_RADIUS * 2;

// Positional clamp only — deliberately no velocity reflection. advanceShape
// already reflected velocity at the edge this frame, and the wall pass may
// have set a velocity of its own; flipping it again here would cancel the
// bounce that just happened.
//
// `clamped` is the wall-against-canvas-edge tell: a shape the wall pushed out
// of bounds and the clamp pushed straight back into the wall is in a deadlock
// that no amount of further correction resolves. The caller escalates that to
// wall immunity rather than fighting it every frame.
export function clampIntoBounds(shape, bounds) {
  const r = shape.size / 2;
  // Math.max guards a shape larger than the stage, where the low bound would
  // otherwise exceed the high one.
  const x = clamp(shape.x, r, Math.max(bounds.width - r, r));
  const y = clamp(shape.y, r, Math.max(bounds.height - r, r));
  const clamped = x !== shape.x || y !== shape.y;
  return { shape: clamped ? { ...shape, x, y } : shape, clamped };
}

export function createStuckState() {
  return { elapsed: 0, positions: new Map(), contacted: new Set() };
}

// Samples shape positions once per stuckAfterS window and reports the shapes
// that barely moved across a whole window *while touching a wall*. Requiring
// the wall contact is what keeps a merely slow-drifting shape from being
// flagged; requiring near-zero displacement is what keeps a shape circling
// inside a deliberately drawn pen from being flagged, since a pen is the
// feature working and should not dissolve itself.
//
// State goes in and comes back out rather than being mutated in place: the
// caller keeps it in a ref, so it never reaches the localStorage snapshot.
export function trackStuck(
  state,
  shapes,
  contacts,
  dtSeconds,
  stuckAfterS = DEFAULT_STUCK_AFTER_S,
) {
  const contacted = new Set(state.contacted);
  contacts.forEach((id) => contacted.add(id));
  const elapsed = state.elapsed + dtSeconds;
  if (elapsed < stuckAfterS) {
    return { state: { ...state, elapsed, contacted }, stuck: new Set() };
  }

  const stuck = new Set();
  const positions = new Map();
  shapes.forEach((o) => {
    if (o.kind !== 'shape') return;
    positions.set(o.id, { x: o.x, y: o.y });
    const before = state.positions.get(o.id);
    if (before && contacted.has(o.id)
      && Math.hypot(o.x - before.x, o.y - before.y) < STUCK_DISPLACEMENT) {
      stuck.add(o.id);
    }
  });
  return { state: { elapsed: 0, positions, contacted: new Set() }, stuck };
}
```

Note: the `shape` objects passed to `trackStuck` in the tests come from the
`shape()` factory, which sets `kind: 'shape'`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/doodleWalls.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the countdown**

Append to `lib/doodleShapes.test.js`, next to the existing
`splitGraceRemaining` cases:

```js
  it('advanceShape counts down wallImmunityRemaining and clears it once expired', () => {
    const shape = {
      ...createShape(50, 50, seq([0.5])), vx: 0, vy: 0, size: 20, wallImmunityRemaining: 1,
    };
    const midway = advanceShape(shape, 0.5, { width: 1000, height: 1000 });
    expect(midway.wallImmunityRemaining).toBeCloseTo(0.5);

    const expired = advanceShape(midway, 0.5, { width: 1000, height: 1000 });
    expect(expired.wallImmunityRemaining).toBeUndefined();
  });

  it('advanceShape leaves shapes without a wallImmunityRemaining untouched', () => {
    const shape = { ...createShape(50, 50, seq([0.5])), vx: 0, vy: 0 };
    const next = advanceShape(shape, 1, { width: 1000, height: 1000 });
    expect(next.wallImmunityRemaining).toBeUndefined();
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: FAIL — `expected 1 to be close to 0.5`.

- [ ] **Step 7: Implement the countdown**

In `lib/doodleShapes.js`, immediately after the existing
`splitGraceRemaining` block inside `advanceShape` (line 188), add:

```js
  // Same countdown pattern as splitGraceRemaining (see .claude/rules/doodle.md):
  // set at grant time, decremented here, deleted at zero. Granted when a shape
  // is detected stuck against a wall, or when a drag/pinch releases it while it
  // overlaps one. Note advanceShape only runs on non-grabbed shapes, so the
  // countdown does not tick while a shape is held — which is what we want: a
  // held shape ignores walls anyway, and the clock should start at release.
  if (shape.wallImmunityRemaining > 0) {
    const remaining = shape.wallImmunityRemaining - dtSeconds;
    if (remaining > 0) next.wallImmunityRemaining = remaining;
    else delete next.wallImmunityRemaining;
  }
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: PASS.

- [ ] **Step 9: Write the failing tests for the hook**

Append to `lib/useDoodleObjects.test.jsx`, inside the existing describe (it
reuses `setUpWallHit` from Task 3):

```js
  it('grants wall immunity when a wall and the canvas edge trap a shape', () => {
    // The genuine deadlock: a line drawn 30px from the left edge, and a shape
    // whose own radius (20) leaves it no room between the two. The wall pushes
    // it left, the bounds clamp pushes it right, forever — so the conflict is
    // detected on the first frame and handed to immunity instead.
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(20, 100); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(30, 0); });
    act(() => result.current.appendStrokePoint(strokeId, 30, 200));
    act(() => {
      const live = result.current.objects.find((o) => o.id === shape.id);
      live.x = 20;
      live.y = 100;
      live.vx = 0;
      live.vy = 0;
      live.size = 40;
    });

    act(() => result.current.advance(
      0.016, { width: 1000, height: 1000 }, null, { wallImmunityS: 2 },
    ));

    const after = result.current.objects.find((o) => o.id === shape.id);
    expect(after.wallImmunityRemaining).toBe(2);
    expect(after.x).toBe(20); // clamped back in, not left sitting out of bounds
  });

  it('releaseShape grants wall immunity that then expires', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let shape;
    act(() => { shape = result.current.spawnShape(100, 100); });
    act(() => result.current.releaseShape(shape.id, 0.5));
    expect(
      result.current.objects.find((o) => o.id === shape.id).wallImmunityRemaining,
    ).toBe(0.5);

    act(() => result.current.advance(0.6, { width: 1000, height: 1000 }, null));
    expect(
      result.current.objects.find((o) => o.id === shape.id).wallImmunityRemaining,
    ).toBeUndefined();
  });

  it('releaseShape ignores a stroke id', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 0); });
    act(() => result.current.releaseShape(strokeId));
    const stroke = result.current.objects.find((o) => o.id === strokeId);
    expect(stroke.wallImmunityRemaining).toBeUndefined();
  });

  it('never persists the stuck tracker or the wall cache', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    setUpWallHit(result);
    act(() => result.current.advance(0.5, { width: 1000, height: 1000 }, null));
    act(() => { vi.advanceTimersByTime(1000); });
    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    saved.forEach((o) => expect(['shape', 'stroke']).toContain(o.kind));
    expect(JSON.stringify(saved)).not.toContain('contacted');
    expect(JSON.stringify(saved)).not.toContain('pointCount');
    vi.useRealTimers();
  });
```

- [ ] **Step 10: Run them to verify they fail**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: FAIL — `result.current.releaseShape is not a function`.

- [ ] **Step 11: Implement the hook changes**

In `lib/useDoodleObjects.js`, widen the `doodleWalls` import:

```js
import {
  buildWalls, resolveWallCollisions, clampIntoBounds, createStuckState, trackStuck,
  DEFAULT_WALL_RESTITUTION, DEFAULT_STUCK_AFTER_S, DEFAULT_WALL_IMMUNITY_S,
} from './doodleWalls';
```

Add the tracker ref next to `wallCacheRef`:

```js
  // Stuck-detection state. A ref for the same reason as the wall cache: it is
  // transient bookkeeping, not canvas content, and must never reach the
  // localStorage snapshot.
  const stuckRef = useRef(createStuckState());
```

Widen the `advance` options destructure:

```js
    const {
      wallRestitution = DEFAULT_WALL_RESTITUTION,
      stuckAfterS = DEFAULT_STUCK_AFTER_S,
      wallImmunityS = DEFAULT_WALL_IMMUNITY_S,
    } = tuning;
```

Replace the `const next = afterShapes.map(...)` block added in Task 3 with:

```js
    const tracked = trackStuck(
      stuckRef.current, afterShapes, wallPass.contacts, dtSeconds, stuckAfterS,
    );
    stuckRef.current = tracked.state;

    const next = afterShapes.map((o) => {
      if (o.kind !== 'shape' || grabbedIds?.has(o.id)) return o;
      const pushed = wallById.get(o.id);
      // advanceShape already clamped this shape into bounds this frame and the
      // wall pass may have pushed it back out. Re-clamp — and treat a re-clamp
      // that returns a still-contacting shape to the wall as the wall-against-
      // edge deadlock, handing it straight to immunity instead of jittering
      // between the two constraints forever.
      const { shape, clamped } = clampIntoBounds(pushed, bounds);
      const trapped = tracked.stuck.has(o.id) || (clamped && wallPass.contacts.has(o.id));
      return trapped ? { ...shape, wallImmunityRemaining: wallImmunityS } : shape;
    });
```

Add the mutator next to `popShape`:

```js
  // Ending a drag or pinch grants wall immunity: a child who parked a shape on
  // top of a line should see it drift free, not get spat out the moment they
  // lift their finger.
  const releaseShape = useCallback((id, wallImmunityS = DEFAULT_WALL_IMMUNITY_S) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape'
        ? { ...o, wallImmunityRemaining: wallImmunityS }
        : o
    )));
  }, [commit]);
```

and add `releaseShape,` to the returned object.

- [ ] **Step 12: Run them to verify they pass**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS.

- [ ] **Step 13: Write the failing canvas test**

Append to `components/doodle/DoodleCanvas.test.jsx`:

```js
  it('releasing a drag grants the shape wall immunity so it is not ejected', () => {
    vi.useFakeTimers();
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0])} sound={mockSound()} />);
    const svg = stage(container);

    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    const id = g.getAttribute('data-id');

    fireEvent.pointerDown(g, { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 400, clientY: 400, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });
    act(() => { vi.advanceTimersByTime(1000); });

    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    const shape = saved.find((o) => o.id === id);
    expect(shape.wallImmunityRemaining).toBeGreaterThan(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
    vi.useRealTimers();
  });
```

In `components/doodle/TuningPanel.test.jsx`, extend `baseTuning` again and
add two assertions to the first test:

```js
const baseTuning = {
  maxParticles: 150,
  dustMaxAge: 0.3,
  dustFrameInterval: 3,
  driftMin: 18,
  driftMax: 18,
  wallRestitution: 0.9,
  stuckAfterS: 1,
  wallImmunityS: 1.5,
};
```

```js
    expect(getByLabelText('Stuck after (s)').value).toBe('1');
    expect(getByLabelText('Wall immunity (s)').value).toBe('1.5');
```

- [ ] **Step 14: Run them to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx components/doodle/TuningPanel.test.jsx`
Expected: FAIL — `expected undefined to be greater than 0`, and no label
matching `Stuck after (s)`.

- [ ] **Step 15: Wire the canvas and the panel**

In `components/doodle/DoodleCanvas.jsx`, widen the import:

```js
import {
  DEFAULT_WALL_RESTITUTION, DEFAULT_STUCK_AFTER_S, DEFAULT_WALL_IMMUNITY_S,
} from '../../lib/doodleWalls';
```

Add to `DEFAULT_TUNING`:

```js
  stuckAfterS: DEFAULT_STUCK_AFTER_S,
  wallImmunityS: DEFAULT_WALL_IMMUNITY_S,
```

Pull `releaseShape` out of the hook:

```js
  const {
    objects, spawnShape, startStroke, appendStrokePoint, moveShape, transformShape, popShape, releaseShape, advance, clear,
  } = useDoodleObjects(rng);
```

Pass the two new knobs into `advance`:

```js
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds, {
          wallRestitution: tuningRef.current.wallRestitution,
          stuckAfterS: tuningRef.current.stuckAfterS,
          wallImmunityS: tuningRef.current.wallImmunityS,
        });
```

In `onPointerUp`, grant immunity as soon as a pointer holding a shape lifts.
Insert directly after the `if (p.mode === 'inert') return;` line, before the
pinch-member branch:

```js
    // A shape released from a drag or pinch may be sitting on top of a line.
    // Immunity lets it drift out under its own drift instead of being ejected.
    // A pinch's surviving pointer continues as a drag and grants again when it
    // finally lifts; re-granting is harmless.
    if (p.mode === 'drag' || p.mode === 'pinch-member') {
      releaseShape(p.shapeId, tuningRef.current.wallImmunityS);
    }
```

Apply the same two lines in `onPointerCancel`, directly after its
`pointersRef.current.delete(e.pointerId);`:

```js
    if (p.mode === 'drag' || p.mode === 'pinch-member') {
      releaseShape(p.shapeId, tuningRef.current.wallImmunityS);
    }
```

In `components/doodle/TuningPanel.jsx`, append to `FIELDS`:

```js
  {
    key: 'stuckAfterS', label: 'Stuck after (s)', min: 0.5, max: 10, step: 0.5,
  },
  {
    key: 'wallImmunityS', label: 'Wall immunity (s)', min: 0.5, max: 10, step: 0.5,
  },
```

and to `TuningPanel.propTypes`:

```js
    stuckAfterS: PropTypes.number.isRequired,
    wallImmunityS: PropTypes.number.isRequired,
```

- [ ] **Step 16: Document the conventions**

In `.claude/rules/doodle.md`, add to the Layout list, after the
`lib/doodlePhysics.js` line:

```markdown
- `lib/doodleWalls.js` — drawn strokes as static collision geometry: `buildWalls` (live, bbox-cached) and `resolveWallCollisions` (circle-against-capsule). Pure, and deliberately takes no `rng` — wall collision makes no random choice.
```

and extend the "Spawn-time collision immunity" section's closing sentence to
name the second instance:

```markdown
`splitGraceRemaining`/`SPLIT_GRACE_S` is the original instance and `wallImmunityRemaining` (granted on a detected stuck-against-a-wall state, on a wall-versus-canvas-edge conflict, and on drag/pinch release) is the second — reuse this pattern rather than inventing a new one for future immunity needs.
```

- [ ] **Step 17: Run the whole suite**

Run: `npm test`
Expected: PASS, every test including the untouched
`lib/doodlePhysics.test.js`.

- [ ] **Step 18: Lint**

Run: `npx eslint lib components/doodle`
Expected: no output.

- [ ] **Step 19: Commit**

```bash
git add lib components/doodle .claude/rules/doodle.md
git commit -m "feat(doodle): free shapes stuck against drawn walls"
```

---

## Manual verification

After Task 4, run `npm run dev` and check on the doodle page:

1. Draw a line, switch to shape mode, tap above it — the shape bounces off the
   line with a spark burst and no sound.
2. Draw a line straight through a resting shape — it emerges over a few frames
   rather than being flung.
3. Drag a shape through a line — the finger passes straight through.
4. Draw a closed loop around a shape — it stays penned and keeps bouncing
   around inside.
5. Draw a line hard against the canvas edge and trap a shape in the corner —
   it frees itself within a couple of seconds instead of jittering.
6. Open the tuning panel — `Wall bounciness`, `Stuck after (s)` and
   `Wall immunity (s)` are present, editable, and persist across a reload.
