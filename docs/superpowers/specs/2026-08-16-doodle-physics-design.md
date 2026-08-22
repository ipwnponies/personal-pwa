# Doodle: physics, collisions, and feedback juice

## Problem

The doodle sandbox (`docs/superpowers/specs/2026-07-24-doodle-design.md`)
deliberately shipped with no collisions and no particle feedback — shapes
drift and edge-bounce, but pass through each other, and taps/pops have no
visual impact beyond the pulse animation and child shapes scattering. The
canvas feels inert: actions don't leave a mark, and shapes ignore each
other. This design adds shape-to-shape collision physics and particle-based
juice (spark bursts, merge spirals, squash poofs, movement dust trails) to
make the canvas feel alive and reactive, without adding a physics engine
dependency.

## Goals

- Shapes collide with each other, not just canvas edges.
- **Different-color shapes bounce** off each other: elastic collision,
  momentum conserved by mass (derived from `size`), restitution ~0.9. A
  spark-burst particle effect fires at the contact point (silent — no new
  sound, since bounces are the frequent case).
- **Same-color shapes merge** on contact into one larger shape (area
  conserved, velocity momentum-conserved, note re-derived from new size). A
  spiral-absorb particle effect fires, particles from the smaller shape
  animate into the larger shape's center. A chime plays.
- Merged shapes have a size cap (`MAX_MERGE_SIZE`); at the cap, same-color
  pairs bounce instead of merging — the existing double-tap pop is the only
  way to shrink a shape back down, keeping the kid in control of when a
  big shape explodes.
- **Squash (single tap):** in addition to the existing pulse/wobble
  reaction, a small particle poof fires at the shape's center.
- **Pop (double-tap):** in addition to existing child-shape scatter, a
  spark-burst particle effect fires at the original shape's position.
- **Movement dust trail:** shapes moving above a small velocity threshold
  spawn a few fading dust particles per frame, trailing behind them.
  Toggleable (default on) via a new toolbar button, so it can be disabled
  if it costs too much on lower-end devices.
- All particle effects render outside persisted state — they never enter
  `localStorage` and never count toward React reconciliation of the
  `objects` array.

## Non-goals

- No physics engine (Matter.js or similar). No gravity, no resting
  contacts, no polygon-accurate collision, no constraints/springs. Circle
  approximation for collision detection is sufficient at this scope.
- No stacking/piling — floaty air-hockey physics only (per prior
  brainstorm decision), nothing settles.
- No device-tilt gravity, no flick-to-throw velocity capture, no static
  geometry from drawn strokes — good future ideas, out of scope here.
- No change to drift/edge-bounce behavior (`advanceShape` stays as-is).
- No change to stroke (finger-drawn line) behavior — collisions and
  particles apply to shapes only.

## Approach

Hand-rolled elastic circle-circle collision, resolved once per frame inside
the existing `requestAnimationFrame` drift loop — no new dependency.
Rationale, matching the original doodle design's reasoning for avoiding
Matter.js:

- Shape counts are small (dozens), so brute-force N² pairwise collision
  checking is comfortably cheap per frame.
- No gravity means no resting-contact stability problem — the one area
  where hand-rolled physics genuinely struggles and engines earn their
  keep. Floaty collision-only physics is well within hand-rolled range.
- Keeps the "no physics engine" architectural decision from the original
  spec intact; this is additive complexity, not a reversal.

**State architecture split:** shapes remain immutable React state via
`useDoodleObjects` (unchanged persistence). Two new concerns are
intentionally kept **out** of persisted React state:

- Particles are transient, numerous (up to ~150 live), and short-lived
  (100–300ms). Routing them through `setObjects`-style immutable updates
  would thrash reconciliation and — worse — risk leaking into the
  `localStorage` snapshot. They live in a `particlesRef` owned by
  `DoodleCanvas`, advanced imperatively each frame, rendered via a
  dedicated `Particles` SVG component that reads the ref directly (not
  through props triggering re-render on every particle tick — a
  lightweight forced re-render per frame, same rAF cadence already driving
  shape advancement).
- Collision resolution is a pure function over the current shape array,
  called from inside `useDoodleObjects#advance` (which already runs every
  frame for drift). It doesn't need its own ref — it operates on the same
  array `advance` already produces, before that array is committed to
  state.

## Data model

### `lib/doodleShapes.js` (existing, extended)

New export:

```js
// area-conserving merge: newSize = sqrt(a.size² + b.size²)
// momentum-conserving velocity, mass ∝ size²
// color kept from either (same color by construction), shapeType from
// the larger parent, note re-derived from newSize (bigger = lower pitch)
export function mergeShapes(a, b) { ... }

export const MAX_MERGE_SIZE = 160; // 2x current MAX_SIZE (80)
```

No changes to `createShape`, `splitShape`, `advanceShape`.

### `lib/doodlePhysics.js` (new)

Pure, dependency-free collision resolution — no refs, no rAF, fully
unit-testable:

```js
// For every overlapping pair of shapes:
//  - different color -> elastic bounce (separate + reflect velocity,
//    restitution ~0.9, mass from size^2)
//  - same color, combined size <= MAX_MERGE_SIZE -> merge via mergeShapes
//  - same color, combined size > MAX_MERGE_SIZE -> elastic bounce instead
// Returns the updated shape array plus a list of events describing what
// happened, so the render layer can react (particles + sound) without
// this function knowing about React, SVG, or audio.
export function resolveCollisions(shapes, rng = Math.random) {
  // returns { shapes, events }
  // event shape: { type: 'bounce' | 'merge', x, y, color }
}
```

Broad phase is brute-force N² pairwise distance checks (shape counts are
small); narrow phase is circle-circle overlap using each shape's
`size / 2` as radius (same radius convention `advanceShape` already uses
for edge collision).

### `lib/doodleParticles.js` (new)

Pure functions operating on plain particle arrays (no refs) — kept pure so
they're unit-testable the same way as `doodleShapes.js`, even though the
array they operate on lives in a ref at runtime:

```js
// 6-10 short dashes radiating from (x, y), biased away from an optional
// contact normal, colored `color`, ~150ms life.
export function spawnBurst(x, y, color, normal) { ... }

// Particles spawn near (fromX, fromY), animate toward (toX, toY) with
// slight tangential velocity for a spiral look, colored `color`, ~200ms
// life, fade on arrival.
export function spawnSpiral(fromX, fromY, toX, toY, color) { ... }

// 4-6 tiny particles, quick radial pop, ~100ms life — lighter than a burst.
export function spawnSquashPoof(x, y, color) { ... }

// 1-2 tiny fading particles per call, low alpha, ~300ms life, called once
// per frame per shape whose speed exceeds a velocity threshold.
export function spawnDust(x, y, vx, vy, color) { ... }

// Advances all particle positions/ages by dtSeconds, drops expired ones,
// and caps the array at MAX_PARTICLES (150) by dropping the oldest first
// if exceeded (protects against collision pileups runaway-allocating).
export function advanceParticles(particles, dtSeconds) { ... }

export const MAX_PARTICLES = 150;
```

Particle object shape: `{ id, kind: 'burst' | 'spiral' | 'dust', x, y, vx,
vy, color, age, maxAge }` (`spiral` particles also carry a target `{tx,
ty}`). `kind` lets `Particles.jsx` pick a rendering treatment (dash vs
circle) without a separate component per effect.

### `lib/useDoodleObjects.js` (extended)

`advance(dtSeconds, bounds, grabbedId)` gains a collision-resolution step:
after drifting non-grabbed shapes (existing behavior), it calls
`resolveCollisions` on the result and returns the resulting `events` array
to the caller (previously returned nothing). `DoodleCanvas` uses these
events to trigger sound and spawn particles — the hook itself has no
knowledge of audio or particles, staying consistent with its existing role
as pure shape-state owner.

### `components/doodle/DoodleCanvas.jsx` (extended)

- Owns `particlesRef` (mutable array, mirrors the existing `objectsRef`
  mirror pattern already used for pointer handlers).
- rAF loop: after calling `advance(...)` and getting back `events`, spawns
  particles per event (`bounce` → `spawnBurst`, `merge` → `spawnSpiral`).
  Bounce stays silent (visual-only) since different-color bounces are the
  frequent case under floaty physics and a sound on every one would be
  noisy; merge plays a chime, keeping audio tied to the rarer event. Also
  spawns
  `spawnDust` per frame for each shape above a velocity threshold, gated
  on the trail toggle. Advances particles via `advanceParticles` and
  forces a lightweight re-render of `Particles` each frame (same cadence
  as shape position updates).
- `handleShapeTap`: adds `spawnSquashPoof` on single tap (alongside
  existing pulse + note).
- `popShape` call site: adds `spawnBurst` at the popped shape's prior
  position (alongside existing child scatter).
- New `trailsEnabled` state, persisted under `doodle-trails` (mirrors the
  existing `doodle-muted` read/write pattern, same try/catch guards).
  Default `true`.
- New toolbar button (alongside clear/mute) toggling `trailsEnabled`.

### `components/doodle/Particles.jsx` (new)

Renders the current particle array as SVG: `dust`/`spiral`/`squash`
particles as small `<circle>`s with opacity derived from `age/maxAge`;
`burst` particles as short `<line>`s oriented along their velocity vector.
Pure presentational component, takes `particles` as a prop.

## Interaction summary (additions to existing gesture table)

| Gesture | Existing behavior | New behavior added here |
|---|---|---|
| Two different-color shapes overlap | pass through | elastic bounce + spark burst |
| Two same-color shapes overlap, combined size ≤ cap | pass through | merge into one shape + spiral particles + chime |
| Two same-color shapes overlap, combined size > cap | pass through | elastic bounce + spark burst (same as different-color) |
| Single tap on shape | pulse/wobble + note | + squash particle poof |
| Double-tap on shape (pop) | split into children | + spark burst at original position |
| Shape moving above velocity threshold | (nothing) | dust trail particles spawn per frame, while `trailsEnabled` |

## Error handling

No new failure surface. All physics and particle math is deterministic,
synchronous, pure functions — no I/O, no async, no new external calls. The
one new persisted value (`doodle-trails` in `localStorage`) follows the
exact try/catch-and-no-op pattern already used for `doodle-muted`.

## Testing

Matches existing conventions: colocated `.test.js`/`.test.jsx`, RTL +
vitest, injectable/seeded `rng`, faked `requestAnimationFrame`/timers.

- `lib/doodleShapes.test.js` (extend): `mergeShapes` produces correct
  size (area-conserving), velocity (momentum-conserving), color, and
  note for two given shapes.
- `lib/doodlePhysics.test.js` (new): overlapping different-color shapes
  bounce apart with separated positions and conserved momentum;
  overlapping same-color shapes below the cap merge into one shape per
  `mergeShapes` math; overlapping same-color shapes at/above
  `MAX_MERGE_SIZE` bounce instead of merging; non-overlapping shapes are
  unchanged; returned `events` array accurately reflects what occurred
  (type, position, color) for each pair.
- `lib/doodleParticles.test.js` (new): each `spawn*` helper produces the
  documented particle count/shape; `advanceParticles` ages and removes
  expired particles; `advanceParticles` enforces `MAX_PARTICLES`, dropping
  oldest first.
- `lib/useDoodleObjects.test.jsx` (extend): `advance` returns collision
  events alongside updating shape state.
- `components/doodle/DoodleCanvas.test.jsx` (extend): bounce between
  different-color shapes triggers a spark burst and does not merge; same-
  color overlap triggers a merge (shape count decreases by one) and plays
  a chime; single tap spawns a squash poof; double-tap pop spawns a spark
  burst in addition to existing child scatter; trail toggle button
  hides/shows dust particle spawning; saved `localStorage` payload after
  a play session contains only `shape`/`stroke` objects, never particles.

## Files touched

- `lib/doodleShapes.js` (add `mergeShapes`, `MAX_MERGE_SIZE`)
- `lib/doodleShapes.test.js` (extend)
- `lib/doodlePhysics.js` (new)
- `lib/doodlePhysics.test.js` (new)
- `lib/doodleParticles.js` (new)
- `lib/doodleParticles.test.js` (new)
- `lib/useDoodleObjects.js` (`advance` returns events)
- `lib/useDoodleObjects.test.jsx` (extend)
- `components/doodle/DoodleCanvas.jsx` (particle ref, trail toggle, event
  handling → sound/particle spawn, squash/pop particle hookups)
- `components/doodle/DoodleCanvas.test.jsx` (extend)
- `components/doodle/Particles.jsx` (new)
