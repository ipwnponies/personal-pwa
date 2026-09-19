# Doodle feel pass: flick-throw, timbre, haptics, slow-mo

## Problem

Four independent gaps in the doodle sandbox's feedback loop, all in the same
component cluster (`components/doodle/`, `lib/doodle*`):

1. **Dragging has no momentum.** `onPointerMove`'s drag branch calls
   `moveShape(id, x, y)`, which rewrites `x`/`y` only. `vx`/`vy` are never
   touched, so releasing a shape after a fast swipe resumes whatever ambient
   drift it had before the grab. There is no way to throw a shape.
2. **Every shape sounds identical.** `createDoodleSound().playNote(freq)`
   hardcodes `type: 'sine'`. A circle, a square, a triangle and a star with
   the same `note` are indistinguishable by ear.
3. **No touch feedback.** Pop, merge and collision-bounce are visual and
   audible only. On a muted device in a stroller there is nothing.
4. **No way to slow down or stop.** The rAF loop always advances at real
   time. A child cannot inspect a busy canvas, and an adult cannot show a
   collision happening.

## Goals

- A flick release throws the shape at the speed of the flick, clamped.
- A release with the finger held still leaves the shape stationary.
- Each `shapeType` has its own oscillator timbre.
- Pop, merge and bounce vibrate on devices that support the Vibration API.
- A toolbar control cycles normal speed, quarter speed and freeze; the
  choice survives a reload.

## Non-goals

- No new dependencies. `package.json` and the lockfile are untouched.
- No change to spawn, split, merge or collision *math* beyond adding one
  field to an existing event object.
- No new `rng()` draws anywhere. The `seq([...])` tests in
  `lib/doodle*.test.js` and `DoodleCanvas.test.jsx` hand-compute expected
  values from rng call position (see `.claude/rules/doodle.md`), so an added
  draw breaks tests far from the change.
- No velocity damping in free flight. Throw speed is bounded by a clamp
  instead. Revisit only if the clamped speed still feels chaotic.

## Design

### 1. Flick-to-throw

**Sampling.** Each pointer entry in `pointersRef` carries `samples: []`.
While `p.mode === 'drag'`, `onPointerMove` appends `{ x, y, t: Date.now() }`
and drops samples older than `THROW_SAMPLE_WINDOW_MS` (100 ms). The array
stays at roughly 6 entries at 60 Hz, so the per-move filter is bounded.

**Release.** `onPointerUp` computes velocity from the samples and calls a
new `throwShape(id, vx, vy)` mutator.

**The window is measured from release time, not from the last sample.** This
is the whole reason a hold-still release reads as stationary: a finger that
stops moving stops producing `pointermove` events, so the newest sample can
be a second old and still describe fast motion. Filtering against
`releaseTime` ages those samples out and leaves fewer than two, which
returns zero.

**Deadzone.** Below `MIN_THROW_SPEED` (20 px/s) the result is exactly
`{ vx: 0, vy: 0 }`, so "put the shape down here" parks it rather than
leaving a crawl.

**Clamp.** `maxThrowSpeed` bounds the magnitude, direction preserved.
Nothing in the sandbox damps velocity — `advanceShape`'s wall bounce flips
the sign and keeps the magnitude exactly, and `RESTITUTION = 0.9` only
applies on shape-to-shape impact. An unclamped flick therefore ping-pongs
forever at flick speed. `maxThrowSpeed` is a speed range that shapes feel,
so per `.claude/rules/doodle.md` it belongs in the tuning panel:
`DEFAULT_MAX_THROW_SPEED` is exported from `lib/doodleShapes.js`, taken as
an optional trailing parameter, and surfaced as a `TuningPanel` field.

`THROW_SAMPLE_WINDOW_MS` and `MIN_THROW_SPEED` stay plain constants. They
are gesture-recognition thresholds like `MOVE_THRESHOLD`, not feel knobs.

**`pointercancel` does not throw.** Cancel means palm rejection, an
edge-swipe, or the OS reclaiming the touch — all likely when a toddler's
hand lands flat on the screen. It parks the shape at `{ vx: 0, vy: 0 }`.

**Pinch handoff.** `endPinchMember` promotes the surviving pointer to
`mode: 'drag'`. That entry must get a fresh `samples: []`, or release reads
an undefined array.

### 2. Timbre per shapeType

`playNote(freq, shapeType)` maps `circle → sine`, `square → square`,
`triangle → triangle`, `star → sawtooth`, defaulting to `sine` for an
unknown or absent `shapeType`. The map lives in `lib/doodleSound.js`, so
`DoodleCanvas` passes a `shapeType` and never names an oscillator type.

Three call sites: the tap in `handleShapeTap`, the spawn in `onPointerUp`,
and the merge event in the rAF loop. The merge event does not currently
carry a `shapeType`, so `resolveCollisions` in `lib/doodlePhysics.js` adds
`shapeType: result.shapeType` to the event it pushes. `result` is already
computed by `mergeShapes`; this reads an existing field and adds no draw.

### 3. Haptics

New `lib/doodleHaptics.js` exporting `createDoodleHaptics()`, mirroring
`createDoodleSound()`'s shape: guarded construction, a `setMuted` setter,
and no-op-never-throw behavior.

**Platform.** The Vibration API is a W3C spec implemented by Blink and
Gecko, not by WebKit. It is an engine gap, not an OS one — WebKit on any
platform lacks it. Because iOS forces every browser onto WebKit, this
feature is Android-only in practice. It feature-detects and no-ops
elsewhere, exactly as `ensureCtx` does for a blocked `AudioContext`.

**Rate limiting.** `resolveCollisions` emits one bounce event per colliding
pair per frame, so an unguarded call vibrates continuously with many shapes.
Coalescing per rAF tick would fix the shape-count scaling but not the rate:
a tick is a frame, so the ceiling would be 60/s on one device and 120/s on
another. `navigator.vibrate()` also replaces the running vibration rather
than queueing, so calls at frame rate truncate each other into a flat hum.

The gate is therefore wall-clock, per event kind, held inside the module:

| kind | pattern (ms) | min interval (ms) | why |
|---|---|---|---|
| `pop` | `[18, 30, 18]` | 0 | double-tap, already human-rate-limited; never suppress the most deliberate action |
| `merge` | `[25]` | 40 | rare, but cascades when many shapes overlap |
| `bounce` | `[10]` | 100 | ambient and continuous; this is the spammy one |

One `Date.now()` comparison per call. O(1) per event, independent of both
frame rate and shape count. Each pattern is shorter than its own gate, so
patterns never truncate each other.

These intervals stay plain constants rather than tuning-panel fields: they
exist to prevent spam, which is the structural/safety bar, not the "would a
parent live-tweak this to see how it feels" bar.

**Gating.** Haptics follow the existing mute toggle rather than getting
their own control. A phone set down on a table buzzes audibly, so a parent
muting in public means both. No new toolbar button.

### 4. Slow-mo / freeze

A `timeScale` cycling `1 → 0.25 → 0 → 1`, persisted under
`doodle-time-scale`, driven by a sixth toolbar button following the existing
`aria-label`-names-the-next-action pattern.

**Freeze skips the tick body; it does not pass `dt = 0`.** Two parts of the
loop are not dt-driven, so a zero delta does not freeze anything:

- `resolveCollisions` takes no `dt` at all. It is positional: overlap in,
  merge or bounce out. Any pair already overlapping keeps resolving every
  frame. Drag one shape into another while "frozen" and the bounce branch
  still position-corrects the other one; release them overlapping and they
  merge on the next frame.
- Dust spawning is gated on `speed > DUST_VELOCITY_THRESHOLD`, read from
  `vx`/`vy`, which a zero delta does not change. So dust keeps spawning at
  a fixed point, while `advanceParticles(p, 0)` ages nothing (`age + 0`) and
  its `age < maxAge` filter drops nothing. Particles pile up to
  `maxParticles` and never expire.

So at `timeScale === 0` the tick updates `last = now` and returns before
touching particles or `advance`. Rendering is unaffected (shapes render from
state, particles from the ref) and pointer handlers live outside rAF, so
drag, tap and pop keep working while frozen.

`last = now` must still happen, or unfreezing feeds one huge delta. `MAX_DT`
would clamp it to 0.05 s regardless, but leaving the timestamp stale is a
trap for the next person.

**A persisted `0` is coerced back to `1` on load.** The app must never open
frozen — a child cannot diagnose why nothing moves. Only values present in
the cycle list are accepted at all.

`.toolbar` gains `flex-wrap: wrap`. Six 48 px buttons plus five 8 px gaps is
328 px, which fits a 375 px phone but not a 320 px one.

## Verification

Each of the four ships as its own commit, green on `npm test` and
`npm run lint` independently, in the order above.
