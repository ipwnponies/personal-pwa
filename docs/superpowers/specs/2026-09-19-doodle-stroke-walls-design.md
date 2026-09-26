# Doodle: drawn strokes as static collision geometry

## Problem

A finger-drawn stroke (`components/doodle/Stroke.jsx`, `kind: 'stroke'`
objects in `lib/useDoodleObjects.js`) is purely decorative. Shapes drift
straight through it. The collision system added in
`docs/superpowers/specs/2026-08-16-doodle-physics-design.md` resolves
shape-against-shape only, and both that spec and the original
`docs/superpowers/specs/2026-07-24-doodle-design.md` named "static geometry
from drawn strokes" as a good idea deliberately deferred.

This design makes a drawn stroke a wall that shapes bounce off. It is the
change that turns drawing from decoration into cause: a child draws a line,
and the line does something. That completes the "actions leave a mark" goal
the physics spec committed to, and it gives the two halves of the app —
drawing and shapes — a reason to be in the same canvas.

## Goals

- Every stroke is static collision geometry. Shapes bounce off drawn lines
  the way they already bounce off each other and off the canvas edge.
- Old strokes count. A canvas restored from `localStorage` gets walls from
  strokes drawn before this shipped, with no migration and no data-model
  change.
- Collision geometry is exactly the visible ink. No invisible halo, no
  simplified proxy polyline, no snapping.
- A shape never stays pinned or jittering against a wall forever. Stuck
  states resolve themselves without the child needing to understand why.
- The finger always wins. A dragged or pinched shape passes through walls,
  so a child can always hand-rescue a shape, and can deliberately place one
  inside an enclosure.
- No regression to the existing circle-circle collision system.

## Non-goals

- No new dependency. Hand-rolled math only, consistent with
  `lib/doodlePhysics.js` and its documented reasons for rejecting Matter.js.
- No change to stroke drawing. A drawn line looks and draws exactly as it
  does today; `Stroke.jsx` and the stroke data model are untouched.
- No spatial partitioning (grid, quadtree, BVH). Object counts are dozens;
  `doodlePhysics.js` explicitly chose brute force and documented why.
- No stroke-against-stroke or stroke-against-edge interaction. Strokes are
  immovable and inert to each other.
- No fix for the mode-toggle friction. Shape mode ignores empty-canvas
  drags, so building a wall and then spawning shapes into it needs a
  toolbar round trip. That friction is real and is left as separate future
  work rather than widening this change into the gesture layer.
- No sound on a wall bounce. Bounces are the frequent case; the existing
  decision to keep them silent and reserve audio for merges stands.

## Approach

Collision geometry is derived live from `stroke.points` each frame, with a
per-stroke bounding box cached in a ref for broad-phase rejection. Nothing
is baked, nothing is persisted, nothing is precomputed at stroke commit.

Two alternatives were considered and rejected:

- **Baking segments at stroke commit** (compute segments plus bounds on
  `pointerup`, store them on the stroke object). This roughly doubles the
  `doodle-objects` payload, which already grows without bound and flushes
  to `localStorage` every second, for no asymptotic gain over a cached
  bounding box. It also reintroduces the migration this design avoids:
  strokes saved before the change carry no baked geometry, so "old strokes
  count" would need a lazy bake-on-load path. And a stroke mid-draw would
  not be a wall until released, which is either an inconsistency or an
  incremental bake, and an incremental bake is the live approach with extra
  storage.
- **A spatial grid.** Correct at large scale and irrelevant here. It is a
  new subsystem with cache-invalidation failure modes, against YAGNI and
  against the reasoning already recorded in `doodlePhysics.js`.

The live approach wins on three counts that matter more than throughput at
this scale: the stroke data model stays literally unchanged, so "no change
to stroke drawing" holds structurally rather than by discipline; collision
geometry cannot desync from the drawn line, so the original spec's
no-snapping non-goal is satisfied by construction; and a stroke being drawn
right now is a wall as it grows, with no special case.

Cost is acceptable. A three-second drag at 60 Hz samples roughly 180
points, and `appendStrokePoint` applies no distance filter. Ten such
strokes is about 1800 segments; against 20 shapes that is roughly 36,000
segment tests per frame, on the order of 0.3 ms. Per-stroke bounding-box
rejection removes most of that in practice, since a shape is near at most
one or two strokes at a time.

## Data model

### `lib/doodleWalls.js` (new)

Pure module. No React, no refs, no `rng`.

```js
export const WALL_RADIUS = 4;               // strokeWidth 8 / 2
export const DEFAULT_WALL_RESTITUTION = 0.9;
export const MAX_WALL_PUSH_PER_FRAME = 4;

// Bounding box over a stroke's points, expanded by WALL_RADIUS.
export function strokeBounds(stroke) { ... }

// Memoized wall build. `cache` is an explicit argument (a Map), keyed by
// stroke id plus points.length, so a growing mid-draw stroke invalidates
// its own entry. Passing the cache in keeps this testable in isolation.
export function buildWalls(strokes, cache) { ... } // -> [{ id, points, bounds }]

// Fully pure. Returns shapes with corrected positions and velocities, plus
// events describing the bounces that actually applied an impulse.
export function resolveWallCollisions(
  shapes,
  walls,
  grabbedIds = null,
  restitution = DEFAULT_WALL_RESTITUTION,
) { ... } // -> { shapes, events }
```

Event shape: `{ type: 'wallBounce', x, y, color, normal: { x, y } }`, where
`x, y` is the contact point on the stroke.

`WALL_RADIUS` and `MAX_WALL_PUSH_PER_FRAME` are structural and safety
constants, not feel constants, so they stay plain per the doodle rules.
`restitution` is a feel constant and is threaded from the tuning panel.

**No `rng` parameter anywhere in this module.** Wall collision makes no
random choice: no color roll, no shapeType coin flip, nothing. The
rng-threading convention applies to randomized behavior, and there is none
here, so the `seq([...])` draw-position gotcha in the doodle rules cannot
bite this change.

### `lib/doodleShapes.js` (extended)

One new optional field on a shape, `wallImmunityRemaining` (seconds),
following the `splitGraceRemaining` pattern exactly: set at grant time,
decremented in `advanceShape`, deleted once it reaches zero. While it is
set, the shape skips wall collision entirely.

No other change. `createShape`, `splitShape`, `mergeShapes`, and
`MAX_MERGE_SIZE` are untouched.

### `lib/doodlePhysics.js` (unchanged)

`resolveCollisions` keeps its exact signature and behavior. Wall collision
is a separate function in a separate module, so the existing physics tests
cover the existing physics unchanged, and the no-regression constraint is
satisfied by construction rather than by re-verification.

### Stroke objects (unchanged)

`{ id, kind: 'stroke', color, points }` stays exactly as it is. Nothing is
added, so every stroke already in `localStorage` becomes a wall on the
first load after this ships, with no migration step and no version field.

## Collision math

Circle against capsule, per segment. For segment `AB` and shape center `P`:

- Closest point: `t = clamp(dot(P - A, B - A) / |B - A|², 0, 1)`, then
  `Q = A + t(B - A)`.
- Overlap when `|P - Q| < shape.size / 2 + WALL_RADIUS`.
- Normal `n = (P - Q) / dist`.

Position correction pushes the shape out along `n`. This is the existing
infinite-mass path from `doodlePhysics.js` with the wall's inverse mass at
zero, so the shape absorbs the entire correction. Total push per shape per
frame is capped at `MAX_WALL_PUSH_PER_FRAME`. That cap is what makes a line
drawn straight through an existing shape a gentle emergence over a few
frames instead of a violent ejection.

Velocity uses the same impulse formula, gated on `velAlongNormal < 0` the
way `doodlePhysics.js` already gates its bounce. The gate is what stops a
shape resting against a wall from emitting a particle burst every frame.

Multiple contacts within one frame resolve sequentially. At a sharp corner
in a stroke, a shape can touch two segments; after reflecting off the
first normal it may still be moving into the second, so it reflects again.
That is correct corner behavior, not double-counting.

Two degenerate cases must be handled explicitly:

- **Zero-length segment.** A draw-mode tap creates a stroke whose two
  points are identical, so `|B - A| = 0`. Treat it as a point.
- **Center exactly on the segment** (`dist = 0`). Fall back to the
  segment's perpendicular. For a zero-length segment, fall back to a
  deterministic axis derived from the stroke id, mirroring the
  coincident-shapes fallback already in `doodlePhysics.js`.

## Stuck shapes: prevention and cure

### Prevention: the bounds conflict

The genuine deadlock is a wall against a canvas edge. `advanceShape` clamps
to bounds unconditionally, the wall then pushes the shape back out of
bounds, and the next frame's clamp pushes it in again. Trying to satisfy
both constraints is what produces the jitter.

Instead: after wall resolution, re-clamp to bounds, and treat a re-clamp
that puts the shape back into wall overlap as a detected conflict that
escalates to the cure below. Detect and hand off rather than fight.

### Cure: wall immunity

`wallImmunityRemaining` has two triggers and one mechanism.

**Stuck detection.** A `Map<shapeId, { x, y }>` held in a ref inside
`useDoodleObjects`, sampled every `stuckAfterS`. A shape is stuck when its
net displacement over that window is below `WALL_RADIUS * 2` (8 px, one
wall thickness — far less than even the slowest drifting shape covers in a
second) *and* it registered a wall contact during the window. Requiring the
wall contact is what prevents a merely slow-drifting shape from being
falsely flagged. The tracker lives in a ref and never on the object, so it
never reaches the `localStorage` snapshot.

**Release.** Ending a drag or pinch grants the same immunity, so a shape
the child parked overlapping a wall drifts free instead of popping out.

Note that `advanceShape` runs only on non-grabbed shapes, so immunity does
not tick down while a shape is held. That is the behavior we want: a held
shape ignores walls regardless, and the countdown should start from the
moment it is released.

### A cage is deliberate and stays

A child drawing a closed loop around a shape has built a pen, and that is
the feature working. Net displacement inside a pen is large, so the
detector correctly ignores it, and the finger can always lift the shape
out. What gets cured is pinned-and-jittering, which is exactly what
near-zero displacement under wall contact means.

### Accepted cost

An immune shape visibly passes through a line for up to `wallImmunityS`.
That is the price of this escape hatch. Wall lifetime was the alternative
and is worse on both readings: expiring the ink changes what drawing means,
and expiring only the collision while the ink stays leaves a ball rolling
through a line that is plainly still there. Immunity is at least rare,
per-shape, and self-clearing.

## Data flow

`useDoodleObjects.advance(dtSeconds, bounds, grabbedIds)` gains steps 3
through 6:

1. Drift non-grabbed shapes. *(existing)*
2. `resolveCollisions` for shape-against-shape. *(existing, untouched)*
3. `buildWalls(strokes, wallCacheRef.current)`.
4. `resolveWallCollisions(...)`, producing corrected shapes and
   `wallBounce` events.
5. Re-clamp to bounds; detect the bounds conflict described above.
6. Tick the stuck tracker; grant immunity where warranted.
7. Restore grabbed shapes' exact positions. *(existing)*
8. Commit, returning shape-against-shape events and wall events together.

Walls run after shape-against-shape so immovable geometry gets the last
word: a shape shoved into a wall by another shape ends the frame outside
the wall rather than embedded in it. This also covers the merge-against-a-
wall case for free, since a merge that yields a larger and therefore more
deeply embedded shape is resolved by the wall pass in the same frame,
subject to the push cap.

Grabbed shapes are passed to `resolveWallCollisions` but skipped entirely,
so a dragged or pinched shape moves through walls freely.

## Canvas wiring

`components/doodle/DoodleCanvas.jsx`:

- A `wallBounce` event spawns the same `spawnBurst` a shape-against-shape
  bounce does, at the contact point, along the contact normal. Silent, for
  the reason already recorded in the physics spec.
- Pointer release ending a drag or pinch calls a new `releaseShape(id)` on
  the hook, which grants wall immunity.
- The tuning panel gains `wallRestitution` (default 0.9), `stuckAfterS`,
  and `wallImmunityS`.

On the last two: the doodle rules list `SPLIT_GRACE_S` as a structural
constant, so a strict reading would keep the immunity durations plain.
They are tunable here anyway, because the right values cannot be chosen
without watching a child play — which is precisely the bar the tuning-panel
convention sets. Each is exported from its owning module as a `DEFAULT_*`
constant and taken as an optional trailing parameter, per the existing
convention, so every function stays callable in isolation.

## Error handling

No new failure surface. All wall math is deterministic, synchronous, and
pure: no I/O, no async, no new external calls, no new persisted key. The
bounding-box cache is an in-memory `Map` in a ref; a cold cache costs one
bounding-box computation and is never a correctness concern.

## Testing

Colocated `.test.js` / `.test.jsx`, React Testing Library plus vitest,
faked `requestAnimationFrame` and timers — matching existing conventions.

- `lib/doodleWalls.test.js` (new): a shape approaching a segment head-on
  reflects with its velocity component reversed and its position separated;
  a shape moving parallel and grazing produces no event; bounding-box
  pruning rejects a distant stroke without running narrow phase; the
  per-frame push cap bounds displacement for a deeply overlapping shape; a
  shape with active `wallImmunityRemaining` is returned untouched; a
  grabbed shape is returned untouched; a zero-length (dot) stroke resolves
  without `NaN`; a shape centered exactly on a segment resolves to the
  perpendicular; `buildWalls` reuses a cached entry and invalidates it when
  `points.length` changes.
- `lib/doodleShapes.test.js` (extend): `advanceShape` decrements
  `wallImmunityRemaining` and deletes it at zero, mirroring the existing
  `splitGraceRemaining` assertions.
- `lib/useDoodleObjects.test.jsx` (extend): `advance` returns `wallBounce`
  events alongside existing collision events; a shape held against a wall
  across the detection window gains immunity; immunity expires; the stuck
  tracker never appears in the persisted payload.
- `components/doodle/DoodleCanvas.test.jsx` (extend): a wall bounce spawns
  a burst; releasing a drag with the shape overlapping a wall does not
  eject it.
- `lib/doodlePhysics.test.js` and the existing `lib/doodleShapes.test.js`
  cases stay green unchanged.

## Files touched

- `lib/doodleWalls.js` (new)
- `lib/doodleWalls.test.js` (new)
- `lib/doodleShapes.js` (`wallImmunityRemaining` in `advanceShape`)
- `lib/doodleShapes.test.js` (extend)
- `lib/useDoodleObjects.js` (wall pass, bounds conflict, stuck tracker,
  `releaseShape`)
- `lib/useDoodleObjects.test.jsx` (extend)
- `components/doodle/DoodleCanvas.jsx` (wall event wiring, release hookup,
  tuning threading)
- `components/doodle/DoodleCanvas.test.jsx` (extend)
- `components/doodle/TuningPanel.jsx` (three new fields)
- `.claude/rules/doodle.md` (document `doodleWalls.js` and the wall-immunity
  instance of the countdown pattern)

## Commit structure

Four commits, kept separate so each is reviewable on its own:

1. **Data model.** `lib/doodleWalls.js` constants, `strokeBounds`,
   `buildWalls`, and their tests. No behavior change yet.
2. **Pure collision math.** `resolveWallCollisions` and its tests,
   including every degenerate case. Still not wired to anything.
3. **Canvas wiring.** The wall pass in `advance`, event plumbing to
   particles, tuning-panel fields. Walls become live here.
4. **Stuck escape hatch.** `wallImmunityRemaining`, the stuck tracker, the
   release trigger, and bounds-conflict handling.
