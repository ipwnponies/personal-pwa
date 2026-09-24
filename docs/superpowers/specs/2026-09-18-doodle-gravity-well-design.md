# Doodle: long-press gravity well

## Problem

The doodle canvas gives a child three ways to move shapes: drag one
directly, pinch to resize and rotate it, or pop it and watch the children
scatter. All three act on one shape at a time. There is no way to affect
several shapes at once, and no reason to hold still — every existing
gesture rewards motion.

A gravity well fills both gaps. Holding one finger down on empty canvas
opens an attractor at that point; nearby shapes accelerate toward it for as
long as the finger stays down. Release removes the well and the shapes keep
whatever velocity they gained. It is the first gesture in the app whose
input is patience rather than movement, and the first that acts on a
neighbourhood of shapes instead of one.

## Goals

- **Hold to open a well.** One finger, held still on empty canvas in shape
  mode for `wellHoldMs` (default 800), opens a gravity well at the
  touch point.
- **Linear attraction.** Each shape within `wellRadius` of the well gains
  velocity toward it every frame: `a = wellStrength * (1 - d / wellRadius)`.
  Full strength at the center, zero at the rim, nothing outside.
- **Bounded speed.** A shape's resulting speed is clamped to
  `wellMaxSpeed`. Shapes have no damping, so without a clamp every well
  permanently raises the canvas's energy.
- **Release keeps momentum.** Lifting the finger removes the well on that
  frame. Shapes keep their velocity. No snap-back, no decay, no settling.
- **Shapes merge in the well.** A well pulls shapes into contact, and
  `resolveCollisions` already merges overlapping same-colour or
  same-`shapeType` pairs. This is intended behaviour, not an accident: the
  well doubles as a "gather and combine" tool, and reuses the shipped merge
  spiral and chime.
- **Charging feedback.** A ring appears under the finger partway through
  the hold and fills as the hold completes, so the gesture is discoverable
  and an accidental hold is visible before it takes effect.
- **Engaged feedback.** Once open, the well renders a pulsing ring at
  `wellRadius`, and a low tone plays once.
- **Yields to every existing gesture.** A second finger, any movement past
  `MOVE_THRESHOLD`, or a mode switch cancels the well. Pinch, drag, draw,
  tap-to-spawn and double-tap-pop behave exactly as they do today.
- **Tunable feel.** `wellRadius`, `wellStrength`, `wellMaxSpeed` and
  `wellHoldMs` are all live-adjustable and persisted, per the tuning-panel
  convention in `.claude/rules/doodle.md`.

## Non-goals

- **No well in draw mode.** A stationary press in draw mode already means
  "draw a dot", and a held finger there is the start of a stroke. Shape
  mode only, consistent with how a drag on empty canvas is already
  mode-gated.
- **No well anchored on a shape.** The well is a point on the canvas. A
  press that lands on a shape keeps its current meaning (tap to pulse,
  double-tap to pop, drag to move).
- **No draggable well.** Movement cancels the well rather than moving it.
  Sweeping shapes around with a live well is a separate feature.
- **No repulsion.** No inverse mode, no two-finger anti-well.
- **No multiple simultaneous wells.** One at a time, because a second
  finger cancels.
- **No damping.** Shapes still never lose speed on their own. The clamp
  bounds the maximum, it does not bleed energy off.
- **No persistence.** A well is transient interaction state. It never
  enters the `objects` array and never reaches `localStorage`.
- **No change to `resolveCollisions`, `advanceShape`, merge rules, or the
  pinch/drag/tap state machine.** The well adds velocity before
  integration; everything downstream is untouched.

## Approach

The well is three separable pieces: a pure force function, a gesture
recogniser driven by the existing animation frame loop, and an SVG overlay.

**Force.** A new `lib/doodleWell.js` exports `applyWell`, a pure function
from one shape plus one well to a new velocity. Linear falloff was chosen
over inverse-square: inverse-square needs an epsilon and a cap to avoid a
singularity, and leaves most shapes sitting in a weak far tail where
nothing visible happens. Linear has a natural zero at the rim, no
singularity, and reads correctly to a child — closer means faster, evenly.

**Recognition.** No timer. The animation frame loop in `DoodleCanvas`
already runs every frame and already reads `pointersRef`, and every pointer
entry already carries `downTime`. Deriving hold progress there avoids a
`setTimeout` lifecycle to clean up, and matches how the loop already
derives dust throttling and grabbed-shape sets.

This also disposes of the pinch conflict cheaply. `PINCH_WINDOW_MS` is 150
and the hold is 800, so the pinch window always closes long before a well
could engage. The recogniser additionally requires exactly one pointer
down, which blocks engagement during any two-finger interaction regardless
of the timings. No change to the pinch partner search is needed.

**Rendering.** `Particles` already renders as a plain sibling inside the
canvas `<svg>`, last so it layers on top, reading a ref rather than state.
The well ring follows the same pattern rather than inventing a second one.

## Data model

### `lib/doodleWell.js` (new)

```js
export const DEFAULT_WELL_RADIUS = 200;     // px
export const DEFAULT_WELL_STRENGTH = 600;   // px/s^2 at the center
export const DEFAULT_WELL_MAX_SPEED = 400;  // px/s
export const DEFAULT_WELL_HOLD_MS = 800;    // ms of stillness before engage

export function applyWell(
  shape,
  well,
  dtSeconds,
  radius = DEFAULT_WELL_RADIUS,
  strength = DEFAULT_WELL_STRENGTH,
  maxSpeed = DEFAULT_WELL_MAX_SPEED,
) // -> shape (same object if unaffected, new object if accelerated)
```

`well` is `{ x, y }`. The function:

1. Returns the shape unchanged if `well` is null.
2. Computes `d = hypot(well.x - shape.x, well.y - shape.y)`.
3. Returns the shape unchanged if `d >= radius` or `d < MIN_WELL_DISTANCE`
   (1 px). The near guard avoids a division by zero and an undefined
   direction for a shape sitting exactly on the well point.
4. Otherwise adds `strength * (1 - d / radius) * dtSeconds` along the unit
   vector toward the well, then clamps the resulting speed to `maxSpeed`
   (scaling `vx` and `vy` together so direction is preserved).

No `rng` parameter. Nothing here is random, so the rng-threading convention
in `.claude/rules/doodle.md` does not apply, and no `seq([...])` test
elsewhere shifts.

The default values above are starting points, not tuned numbers. Tuning
them on a device is the reason they are in the tuning panel.

### `lib/useDoodleObjects.js` (extended)

`advance` gains a fourth parameter:

```js
advance(dtSeconds, bounds, grabbedIds, well = null)
```

`well` is `null`, or `{ x, y, radius, strength, maxSpeed }`. Inside the
existing map over objects, a shape passes through `applyWell` before
`advanceShape`, so `advanceShape` keeps sole ownership of integration and
edge bounce.

Grabbed shapes (`grabbedIds`) skip the well entirely. They are already
treated as infinite mass by `resolveCollisions` and have their position
restored after it, so applying a force to them would be discarded anyway.
In practice this set is empty during a well, because a second finger
cancels; the check exists so the function stays correct independent of the
gesture layer.

### `components/doodle/DoodleCanvas.jsx` (extended)

New ref, not state:

```js
wellRef.current = null | {
  pointerId,        // the holding pointer
  x, y,             // touch point, fixed at pointerdown
  downTime,         // ms, copied from the pointer entry
  engaged,          // false while charging, true once open
}
```

Recognition inside the existing frame loop, evaluated once per frame:

- **Eligible** when `pointersRef.current.size === 1` and that entry has
  `mode === null`, `moved === false`, `shapeId === null`, and
  `modeRef.current === 'shape'`.
- **Not eligible while frozen** (`timeScaleRef.current === 0`). The frozen
  branch of the frame loop returns before `advance` runs, so an engaged well
  could not pull anything; a pulsing ring over a still canvas would lie about
  what the gesture did. Recognition therefore sits after the frozen early
  return, alongside the rest of the dt-driven work. Slow motion (0.25) is not
  affected: it scales `dt`, so the well simply pulls more gently, which is the
  point of slow motion.
- **Charging** while eligible and
  `now - downTime < tuning.wellHoldMs`. Progress is
  `(now - downTime) / tuning.wellHoldMs`, rendered from
  `WELL_CHARGE_VISIBLE_MS` (150) onward.
- **Engage** when eligible and `now - downTime >= tuning.wellHoldMs`. Set
  `engaged = true`, play the tone once, and mutate the pointer entry to
  `mode = 'well'`, `moved = true`.
- **Cancel** by setting `wellRef.current = null` whenever eligibility is
  lost.

Setting `moved = true` at engage is what suppresses the shape spawn on
release. `onPointerUp` already returns early for a moved pointer, so no new
branch is needed there. `onPointerMove` gains one branch: a pointer in
`mode === 'well'` clears the well, becomes `inert`, and returns — the same
terminal state an empty-canvas drag in shape mode already reaches.

`onPointerDown` needs no change. A second pointer arriving raises
`pointersRef.current.size` above 1, which fails the eligibility test on the
next frame and cancels the well. Pinch then proceeds untouched.

Cancellation paths, all of them just clearing the ref: second pointer down,
movement past `MOVE_THRESHOLD`, `pointerup`, `pointercancel`, switching to
draw mode, clearing the canvas, unmount.

### `components/doodle/Well.jsx` (new)

```jsx
<Well well={wellRef.current} progress={number} radius={number} />
```

Renders nothing when `well` is null, and nothing while
`progress * wellHoldMs < WELL_CHARGE_VISIBLE_MS`, so an ordinary tap never
flashes a ring. While charging (`well.engaged === false`), a ring whose
`stroke-dasharray` fills with `progress`. Once `well.engaged` is true, a
ring at `radius` carrying the existing `styles.pulse` class from
`doodle.module.css`.

It is the last child of the canvas `<svg>`, after `<Particles>`, so it
draws on top of both shapes and particles.

Like `Particles`, it reads a ref rather than React state. That works
because `advance` calls `setObjects` on every frame, which re-renders
`DoodleCanvas` and therefore re-reads the ref. This coupling is implicit
and pre-existing; it is stated here so the next reader does not discover it
by deleting the wrong line.

### `components/doodle/TuningPanel.jsx` (extended)

Four rows appended to `FIELDS`, and four keys added to `DEFAULT_TUNING` in
`DoodleCanvas.jsx`:

| Key | Label | Min | Max | Step |
| --- | --- | --- | --- | --- |
| `wellRadius` | Well radius (px) | 50 | 600 | 10 |
| `wellStrength` | Well strength (px/s²) | 0 | 3000 | 50 |
| `wellMaxSpeed` | Well max speed (px/s) | 50 | 2000 | 50 |
| `wellHoldMs` | Well hold (ms) | 200 | 2000 | 50 |

All four shape how the feature feels, which is the bar the tuning-panel
convention sets. The existing merge-over-defaults load in `DoodleCanvas`
already tolerates stored `doodle-tuning` objects that predate these keys.

The engage sound is a new `playWell()` on `createDoodleSound`, matching the
existing `playPop` / `playStroke` shape: `tone(110, { type: 'sine', duration:
0.4, gain: 0.15 })`. It does not go through `playNote`, whose second argument
is now a `shapeType` used to pick an oscillator for per-shape timbre — a well
is not a shape and has no shapeType, so calling `playNote` with a bare
frequency would rely on that lookup falling through to its `'sine'` default.
A named method keeps the pitch and voice next to the other non-shape sounds.
It is a timbre choice, not a feel constant, so it stays out of the tuning
panel.

No haptic fires at engage. Adding a `'well'` kind to `lib/doodleHaptics.js`
means three parallel edits there (`PATTERNS`, `MIN_INTERVAL_MS`, and the
`lastAt` literal) in a file this feature otherwise does not touch, and the
Vibration API is Android-only, so vibration could not be the primary engage
signal anyway. The tone and the ring carry it.

## Interaction summary (additions to the existing gesture table)

| Gesture | Mode | Result |
| --- | --- | --- |
| Hold one finger still on empty canvas ≥ `wellHoldMs` | shape | Gravity well opens at that point. Charging ring, then pulsing ring plus one low tone. |
| Release the holding finger | shape | Well closes. Shapes keep their velocity. **No shape spawns.** |
| Move past `MOVE_THRESHOLD` during hold or well | shape | Well cancels (or never opens). Pointer goes inert, as an empty-canvas drag already does. |
| Second finger lands during hold | shape | Well cancels. If the first finger targeted a shape it was never eligible anyway; pinch is unaffected. |
| Hold one finger still on empty canvas | shape, frozen | No well, no ring. Release still suppresses nothing: the press was never eligible, so a shape spawns as it does today. |
| Hold one finger still on empty canvas | draw | Unchanged: a dot stroke on release. |
| Hold on a shape | either | Unchanged: tap, double-tap, and drag behave as today. |

## Error handling

- **Zero distance.** A shape whose center coincides with the well point has
  no defined direction. `applyWell` returns it unchanged below
  `MIN_WELL_DISTANCE`.
- **Missing bounds.** The frame loop already skips its body when the SVG
  has no measurable rect. Well recognition sits inside that guard, so a
  well cannot open before layout.
- **Stale pointer.** `pointercancel` (palm rejection, OS gesture) clears
  the pointer entry, which fails eligibility on the next frame. The well
  closes even though no `pointerup` ever arrives.
- **Backgrounded tab.** `MAX_DT` already clamps the frame delta, so a well
  left open across a tab switch cannot apply one enormous impulse. It can
  still engage while backgrounded if a finger is somehow held; harmless,
  since the next frame's eligibility check governs.
- **Degenerate tuning.** `wellRadius` at 0 makes every shape fail the
  `d < radius` test, so the well is inert rather than dividing by zero.
  `wellStrength` at 0 opens a visible but inert well. Both are acceptable
  states for a tuning panel to reach.

## Testing

Tests co-located, per repo convention.

**`lib/doodleWell.test.js` (new)** — pure, no React:

- A shape beyond `radius` is returned unchanged (same reference).
- A shape at the rim receives approximately zero acceleration.
- A shape at half radius receives half of `strength * dt`.
- Acceleration points toward the well from all four quadrants.
- Resulting speed never exceeds `maxSpeed`, and direction survives the
  clamp.
- A shape coincident with the well point is returned unchanged, with no
  `NaN` in `vx` or `vy`.
- A null well returns the shape unchanged.

**`components/doodle/Well.test.jsx` (new)**:

- Renders nothing for a null well.
- Renders nothing when `progress` is below the charge-visible threshold.
- Renders a charging ring, not a pulse ring, while `well.engaged` is false.
- Renders a pulsing ring at `radius` once `well.engaged` is true.

**`components/doodle/DoodleCanvas.test.jsx` (extended)** — using the
existing fake-timer and animation-frame stubs:

- A hold past `wellHoldMs` on empty canvas in shape mode opens a well, and
  a nearby shape's velocity increases toward the touch point.
- Releasing after the well engages spawns **no** shape.
- Releasing before `wellHoldMs` spawns a shape, exactly as today.
- A second pointer landing during the hold cancels the well.
- Moving past `MOVE_THRESHOLD` during the hold cancels the well.
- A hold in draw mode never opens a well and still draws a dot on release.
- A hold on a shape never opens a well.
- An existing pinch scenario still passes unchanged (regression guard).
- A shape outside `wellRadius` is unaffected by an open well.

**`components/doodle/TuningPanel.test.jsx` (extended)**:

- The four new rows render and report changes through `onChange`.

## Files touched

| File | Change |
| --- | --- |
| `lib/doodleWell.js` | New. Pure force function and defaults. |
| `lib/doodleWell.test.js` | New. |
| `lib/useDoodleObjects.js` | `advance` takes a `well` parameter. |
| `lib/useDoodleObjects.test.jsx` | Coverage for the new parameter. |
| `components/doodle/Well.jsx` | New. Charging and engaged rings. |
| `components/doodle/Well.test.jsx` | New. |
| `components/doodle/DoodleCanvas.jsx` | Well ref, frame-loop recognition, cancel paths, tuning keys, render `<Well>`. |
| `components/doodle/DoodleCanvas.test.jsx` | Gesture coverage. |
| `components/doodle/TuningPanel.jsx` | Four new rows. |
| `components/doodle/TuningPanel.test.jsx` | Coverage for the new rows. |
| `lib/doodleSound.js` | New `playWell()`. |
| `lib/doodleSound.test.js` | Coverage for `playWell()`. |
| `components/doodle/doodle.module.css` | Ring styles, reusing the existing pulse keyframes. |
| `.claude/rules/doodle.md` | Add `Well.jsx` and `lib/doodleWell.js` to the layout list. |

## Sequencing against the feel bundle (resolved)

The feel bundle landed as
[ipwnponies/personal-pwa#51](https://github.com/ipwnponies/personal-pwa/pull/51),
merged to `master` on 2026-09-23 as `c79dc24`. This design was originally
written against `master` at `ce3a5d8`; every seam below has now been checked
against the merged code, and the design is confirmed against `c79dc24`.

| Seam | Resolution |
| --- | --- |
| `DEFAULT_TUNING`, `TuningPanel` `FIELDS` | The bundle added one key and one row, `maxThrowSpeed` (0-3000, step 50), at the end of both. The four well rows append after it. No behavioural conflict. |
| `onPointerDown` / `onPointerMove` / `onPointerUp` | Every pointer entry now carries a `samples: []` array for release-velocity capture, set by the same default `onPointerDown` path a well press already uses, so no change is needed. Because engage sets `mode = 'well'`, `onPointerUp` never reaches its `mode === 'drag'` branch and `throwVelocity` never runs on a well press. `onPointerDown` still needs no change. |
| Frame loop `dt` | Confirmed: `const dt = rawDt * timeScaleRef.current`, and `advance(dt, ...)`. The well integrates over the same `dt` and inherits slow motion for free. Freeze is the one case that needed a decision; see the eligibility rules above. |
| `advance` signature | The bundle did not change it: still `advance(dtSeconds, bounds, grabbedIds)`. The well takes the fourth positional parameter, `well = null`. No options object needed. |
| Speed clamp | Both caps stay, because they clamp different things. `DEFAULT_MAX_THROW_SPEED` (600) is a one-shot release clamp inside `throwVelocity`, applied once at `pointerup`. `wellMaxSpeed` (400) is a per-frame ceiling inside `applyWell`, applied on every tick a shape is in range. Keeping the well's ceiling below the throw's is deliberate: a well-slung shape should not outrun a deliberate flick. |
| Haptics | Resolved as a no. See the engage-sound note above. |
| Engage sound | `playNote` now takes `(freq, shapeType)`. The well gets its own `playWell()` rather than passing a bare frequency. See above. |

Note that `docs/superpowers/specs/2026-08-16-doodle-physics-design.md` lists
flick-to-throw as an explicit non-goal of that earlier round. The feel
bundle picked it up.
