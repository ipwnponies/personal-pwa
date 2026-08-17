# Doodle: multi-touch support

## Problem

The doodle canvas (`docs/superpowers/specs/2026-07-24-doodle-design.md`)
explicitly scoped out multi-touch: "No pinch/multi-touch. Single-pointer
interactions only." `DoodleCanvas.jsx` tracks exactly one active gesture in a
single `pointerRef` slot and silently ignores every other finger while one is
down.

This blocks natural multi-finger and multi-player use: dragging a shape with
one hand while drawing a line with the other, dragging a shape while tapping
out new shapes, two children playing on the same tablet at once, or resizing
a shape with a pinch. This design supersedes that non-goal.

## Goals

- Each finger runs its own independent gesture concurrently: tap (spawn or
  react), drag (move a shape), draw (freehand stroke), double-tap (pop a
  shape) — same behavior as the existing single-pointer logic, just N
  instances at once instead of one.
- Two fingers landing together on the *same* shape perform a combined
  pinch-resize + rotate on that shape: finger-distance change scales its
  `size` (clamped to the existing `MIN_SIZE`/`MAX_SIZE`), finger-angle change
  adjusts its `rotation`. The shape's center (`x`/`y`) does not move from a
  pinch — only size and rotation change.
- Up to ~10 concurrent touches supported (typical browser touch-point
  ceiling) as a defensive cap, not a gameplay limit; extras beyond that are
  ignored the same way today's code already tolerates a stray finger.

## Non-goals

- No pan-by-pinch (shape center stays fixed during pinch/rotate).
- No 3+-finger gestures.
- No new dependency — extends the existing hand-rolled Pointer Events code
  in `DoodleCanvas.jsx`, consistent with the original design's "no new
  dependency" stance on drift/audio.
- No change to spawn/tap/drag/draw/double-tap *behavior* for a single
  finger — only the concurrency model changes.

## Approach

Replace the single `pointerRef` slot with per-pointer state tracked in a
`Map`, so each active touch/pointer is handled independently instead of the
first touch monopolizing the gesture slot. Pinch is detected opportunistically
when two pointers land on the same shape within a short window, rather than
requiring the app to pre-declare "this is a two-finger gesture."

Alternatives considered:
- **Hardcoded second slot** (a fixed `pointerRef` + `pointerRef2`): doesn't
  generalize past two touches, and still needs the same
  ignore/cap/teardown logic as the Map approach for a third+ finger, so it
  isn't actually simpler.
- **Gesture library** (e.g. `use-gesture`, `hammer.js`): would handle pinch
  detection out of the box, but adds a new dependency where the repo/spec
  convention is to avoid one without explicit approval, and would mean
  rewriting the existing tested pointer-event interaction layer rather than
  extending it.

Chosen approach: hand-rolled pointer-map state machine (below).

## State shape (`DoodleCanvas.jsx`)

Replaces the single `pointerRef`:

- `pointersRef` — `Map<pointerId, PointerState>` where
  `PointerState = { mode: null | 'drag' | 'draw' | 'pinch-member' | 'inert',
  shapeId, startX, startY, moved, strokeId, downTime }`. One entry per
  currently-down finger/pointer.
- `pinchesRef` — `Map<shapeId, PinchState>` where
  `PinchState = { pointerIds: [a, b], startDist, startAngle, startSize,
  startRotation }`. A shape can have at most one active pinch, since a pinch
  consumes both its member pointers' slots (no third pointer can join).
- `lastTapRef` — was a single `{ id, time }`; becomes a
  `Map<shapeId, { x, y, time }>` so multiple shapes can each be mid-way
  through their own double-tap window at the same time, and so the
  double-tap check can compare tap position, not just shape id (see below).

`useDoodleObjects.js` gains one new method, `transformShape(id, { size,
rotation })`, that merges a partial size/rotation update onto a shape object
— the same pattern as the existing `moveShape(id, x, y)`. No new fields are
added to the shape data model; `size` and `rotation` already exist.

`advance(dtSeconds, bounds, grabbedId)`'s third argument changes from a
single id to a `Set` of shape ids — every shape currently held by a drag *or*
a pinch is excluded from drift for that frame, not just one.

## Gesture logic

**`pointerdown`**

```
if pointersRef.size >= MAX_POINTERS (10): return  // defensive cap, ignore extra finger
shapeId = shapeIdFromTarget(e.target)
if shapeId:
  partner = the entry in pointersRef with entry.shapeId === shapeId
            && entry.mode === null && !entry.moved
            && (now - entry.downTime) < PINCH_WINDOW_MS (150ms)
  if partner found:
    compute startDist/startAngle between partner's start point and this point
    compute startSize/startRotation from the shape's current size/rotation
    pinchesRef.set(shapeId, { pointerIds: [partner.id, this.id], startDist, startAngle, startSize, startRotation })
    set both pointer entries' mode = 'pinch-member', shapeId
    return
pointersRef.set(pointerId, { mode: null, shapeId, startX, startY, moved: false, strokeId: null, downTime: now })
```

A second finger only becomes a pinch partner if it lands on the same shape
*while the first finger hasn't moved yet* (still `mode === null`) — a finger
joining an already-active drag does not retroactively convert it to a pinch.
This matches the earlier design decision: only a synchronized two-finger
touch-down counts as a pinch.

**`pointermove`**

- Non-pinch entries: identical threshold logic to the current single-pointer
  code (movement past `MOVE_THRESHOLD` decides tap-vs-drag/draw), just keyed
  per `pointerId` instead of the one global slot.
- `pinch-member` entries: recompute live distance/angle from the pinch's two
  current pointer positions (tracked by looking up both `pointerIds` in
  `pointersRef`), derive:
  - `size = clamp(startSize * (liveDist / startDist), MIN_SIZE, MAX_SIZE)`
  - `rotation = startRotation + (liveAngle - startAngle)`

  and call `transformShape(shapeId, { size, rotation })`.

**`pointerup` / `pointercancel`**

- Remove the pointer's entry from `pointersRef`.
- If it was a `pinch-member`: tear down the shared `pinchesRef` entry for
  that shape, and demote the *other* member's entry back to a plain
  (non-pinch) slot, re-armed from its current live position as a
  fresh drag-in-progress on that shape (not a new tap/draw) — so lifting one
  of two pinch fingers hands off smoothly to a single-finger drag instead of
  snapping or restarting the gesture.
- Otherwise: unchanged tap/drag/draw-commit logic from the current design,
  except the double-tap check now looks up `lastTapRef.get(shapeId)` and
  requires proximity (see below), not just recency.

**Double-tap proximity ("same finger")**

Pointer Events assign a fresh `pointerId` to every new touch-down, even from
the same physical finger, so pointerId can't identify "the same finger"
across two separate taps. Proximity is used as the practical proxy: a second
tap only counts as completing a double-tap if it lands within
`MOVE_THRESHOLD` (8px, the existing tap/drag distance threshold — reused
rather than adding a new constant) of the first tap's position, in addition
to the existing time window. Two different players tapping different spots
on the same (possibly large, post-pinch-resize) shape within the time window
does not accidentally combo into a pop.

## Drift loop

Unchanged in spirit — still one `requestAnimationFrame` loop. The `grabbed`
set passed to `advance()` each frame is now built from every currently-active
`pointersRef` entry with `mode === 'drag'` and every `pinchesRef` key
(shapes mid-pinch), instead of a single optional id.

## Rendering

No changes. `Shape.jsx` already renders `size`/`rotation` from the shape
object's props; a pinch writes new `size`/`rotation` into state exactly the
way a drag already writes new `x`/`y`.

## Edge cases

- Only one finger of a pinch pair lifts: the survivor becomes a normal drag
  from its current position (above); the pinch's partner shape is not
  otherwise affected.
- A third finger touches the *same* shape while it's already mid-pinch: no
  pinch partner is found (both existing members are `mode: 'pinch-member'`,
  not `null`), but `onPointerDown`'s `shapeIsClaimed(shapeId)` guard catches
  it first — a pinch on the shape makes it claimed — and marks the new
  pointer `mode: 'inert'` immediately. `'inert'` is a no-op mode checked at
  the top of `onPointerMove`/`onPointerUp`, so this extra finger never
  reaches the drag/tap logic at all — no crash, no third-way gesture.
- `pointercancel` (palm rejection, OS gesture reclaim) follows the same
  teardown path as `pointerup` for both plain and pinch-member entries.
- Component unmount: `pointersRef`/`pinchesRef` are cleared alongside the
  existing rAF/timer cleanup, for parity with existing cleanup even though
  the refs would die with the component regardless.

## Testing

Extends `components/doodle/DoodleCanvas.test.jsx` (RTL, dispatching pointer
events with distinct `pointerId`s to simulate separate fingers) and
`lib/useDoodleObjects.test.js` for `transformShape`:

- Two fingers, one on a shape and one on empty space, moving concurrently →
  the shape drags while a stroke draws at the same time.
- Two fingers, both starting on empty space → two independent strokes (or a
  stroke plus a spawn) proceed independently.
- Two fingers down together on the same shape within `PINCH_WINDOW_MS` →
  pinch: synthesized distance/angle deltas produce the expected clamped
  `size` and `rotation` changes; shape's `x`/`y` unchanged.
- Pinch resize below `MIN_SIZE` or above `MAX_SIZE` clamps rather than
  overshooting.
- Mid-pinch, one finger lifts → shape continues as a plain drag from the
  remaining finger's subsequent moves, no jump in position/size/rotation.
- Two taps on the same shape from two different `pointerId`s, more than
  `MOVE_THRESHOLD` apart → does not pop (fails the proximity check).
- Two taps on the same shape, within `MOVE_THRESHOLD`, different
  `pointerId`s, within the time window → pops (proximity is the only
  identity check — no pointerId equality required, per the "must be same
  finger, approximated by position" decision).
- An 11th simultaneous pointer-down is ignored (cap).
- Existing single-pointer tap/drag/draw/double-tap tests continue to pass
  unmodified (behavior for one finger is unchanged).

## Files touched

- `lib/useDoodleObjects.js` — add `transformShape`; `advance`'s grabbed
  argument becomes a `Set`.
- `components/doodle/DoodleCanvas.jsx` — pointer-map rewrite of the gesture
  handling described above.
- `lib/useDoodleObjects.test.js` — `transformShape` coverage.
- `components/doodle/DoodleCanvas.test.jsx` — multi-touch coverage above.
- `docs/superpowers/specs/2026-07-24-doodle-design.md` — strike the "No
  pinch/multi-touch. Single-pointer interactions only" non-goal, pointing at
  this doc as the superseding design.

No new files, no new dependencies.
