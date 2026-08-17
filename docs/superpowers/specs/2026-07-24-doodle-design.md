# Doodle: a simple touch sandbox

## Problem

There is no play-oriented app in the PWA for a young child. The goal is a
touch-first sandbox for a young child on a tablet that entertains without
relying on reflexes or timing, and that rewards free exploration and
creativity. There is no goal, no score, no fail state — the child taps and
drags, things appear and react, and that is the whole loop.

## Goals

- Tap on empty space spawns a random colorful shape at that point.
- Dragging a finger across empty space paints a freeform line that follows
  the finger exactly (finger-painting, not shape recognition).
- Dragging an existing shape moves it around the canvas.
- **Tapping an existing shape** makes it react (a wobble/grow pulse) and
  plays that shape's musical note.
- **Double-tapping an existing shape** pops it: it splits into several
  smaller shapes that scatter, with a pop sound.
- Shapes gently drift on their own and softly bounce off the canvas edges,
  so the scene feels alive. Grabbing a shape pauses its drift; releasing
  resumes it from the new spot.
- All audio is synthesized (Web Audio), tuned to a pentatonic scale so every
  note sounds pleasant together — there is no "wrong" note.
- A mute toggle lets a parent silence audio (naptime, public places).
- A clear button wipes the canvas.
- Canvas state survives reload (persisted to `localStorage`), matching the
  fitness calculator's persistence pattern.
- Reachable from the home page app list at `/doodle/`.

## Non-goals

- No physics engine — drift and bounce are a simple hand-rolled
  constant-velocity + edge-reflect loop, not collision/gravity simulation.
  This deliberately rules out Matter.js and its dependency.
- No shape recognition or snapping — a drawn line stays exactly as drawn.
- No color/shape picker UI; randomness on spawn is the surprise-and-delight
  mechanism and avoids menus a young child cannot parse.
- ~~No pinch/multi-touch. Single-pointer interactions only.~~ Superseded by
  `docs/superpowers/specs/2026-08-16-doodle-multitouch-design.md`.
- No bundled audio files — all sound is synthesized at runtime.
- No account, no sharing, no export.

## Approach

State-driven SVG/DOM rendering with a lightweight animation loop. All canvas
content lives as a flat array of plain objects in React state; each object is
rendered as an SVG element. A single `requestAnimationFrame` loop advances
drifting shapes. Chosen over Canvas 2D and Matter.js because:

- The browser gives per-element hit-testing for free, which is exactly what
  drag/tap/double-tap on a shape need — no manual point-in-shape math.
- Object counts are small (dozens), so SVG with a rAF position update per
  frame is comfortably performant.
- It matches the repo's DOM-oriented testing conventions (React Testing
  Library + vitest), so interactions are testable without a canvas mock.
- No new dependency; drift and audio are hand-rolled and small.

The state array is renderer-agnostic plain data. If a future need for many
particles or real physics ever arises, only the render + pointer + loop layer
(`DoodleCanvas.jsx`) would be rewritten; the state hook, persistence, and
sound helper stay untouched. No speculative abstraction layer is built now
(YAGNI) — the natural seam is the hook's data shape.

## Data model

A single flat array `objects`; array order is z-order (later index renders on
top). Two kinds:

```js
// A shape
{ id, kind: 'shape', shapeType: 'circle' | 'square' | 'triangle' | 'star',
  x, y, color, rotation, size, note, vx, vy }

// A finger-drawn stroke
{ id, kind: 'stroke', color, points: [{ x, y }, ...] }
```

- `id`: unique per object (incrementing counter or `crypto.randomUUID()`).
- Shape `x`/`y`: center point in SVG user units, updated by the drift loop
  and by dragging.
- `color`, `shapeType`, `size`, `rotation`: chosen randomly per spawn from
  fixed palettes/sets.
- `note`: a pitch from the pentatonic scale, assigned on spawn (e.g. derived
  from `color` or chosen at random) and played on tap.
- `vx`/`vy`: drift velocity in units/second. Small random values on spawn.
  Set to zero (or ignored) while a shape is grabbed.
- The transient tap "react" pulse is animation-only state (a short-lived
  scale/rotation tween keyed off a timestamp) and is **not** persisted — it
  never enters the saved model.
- Stroke `points`: sampled pointer positions; rendered as an SVG `<polyline>`
  with rounded joins/caps. Strokes do not drift.

## Interaction

Pointer events on the SVG stage (Pointer Events API — unifies touch/mouse,
consistent with a tablet target). Hit-testing "on a shape" vs "empty space"
is delegated to the DOM: shape elements carry their object id (`data-id`) and
the stage reads `event.target` on `pointerdown`.

**On empty space:**

- `pointerdown` then `pointerup` with negligible movement → **tap**: spawn one
  random shape centered at the point; play its note.
- `pointerdown` then `pointermove` past a small threshold → **draw**: start a
  new stroke, append points on each `pointermove`, commit on `pointerup`;
  play a short stroke sound once at stroke start.

**On an existing shape:**

- `pointerdown` then `pointermove` past the threshold → **drag**: pause that
  shape's drift, update its `x`/`y` live, resume drift on `pointerup`.
- `pointerdown` then `pointerup` with negligible movement → **tap**: trigger
  the react pulse and play the shape's note immediately. If a second such tap
  lands on the same shape within a short window (~300 ms) → **double-tap**:
  pop the shape.

Playing the note on the first tap immediately (rather than waiting to see if a
second tap follows) keeps audio responsive; the double-tap simply adds the
pop on top. The tap-vs-drag decision is by movement distance; the
single-vs-double decision is by tap count within the time window on the same
shape id.

**Pop (double-tap):** remove the tapped shape and spawn N (e.g. 3–5) smaller
shapes at its position, each with a random outward drift velocity, inheriting
a related color. Below a minimum size, a shape pops without producing children
(it just disappears) so splitting terminates. Play a pop sound.

## Drift / animation loop

`DoodleCanvas` runs one `requestAnimationFrame` loop (started on mount,
cancelled on unmount). Each frame, using elapsed time since the last frame:

- Advance each non-grabbed shape by `vx`/`vy`.
- If a shape reaches a canvas edge, reflect the relevant velocity component
  (soft bounce) and clamp back inside.
- Grabbed shapes and all strokes are skipped.

Positions live in React state; to avoid excessive re-renders the loop batches
per-frame updates (one state update per frame). Frame rate is naturally
capped by rAF. When the tab is hidden, rAF pauses, which is fine.

## Components

New folder `components/doodle/` plus a thin page:

- `pages/doodle/index.jsx` — page shell (`<Layout>`, `<Head>`, mounts the
  canvas). Mirrors `pages/fitness/index.jsx` / `pages/random/index.jsx`.
- `components/doodle/DoodleCanvas.jsx` — the SVG stage; owns pointer handling,
  the drift rAF loop, and the toolbar (clear + mute); translates gestures into
  hook calls.
- `components/doodle/Shape.jsx` — renders a single `shape` object as the right
  SVG primitive, including the transient react pulse.
- `components/doodle/Stroke.jsx` — renders a single `stroke` object as an SVG
  polyline.
- `lib/useDoodleObjects.js` — state hook: holds the `objects` array; exposes
  `spawnShape(x, y)`, `startStroke(x, y)`, `appendStrokePoint(x, y)`,
  `moveShape(id, x, y)`, `popShape(id)`, `advance(dtSeconds, bounds)` (drift
  step), `pulse(id)` (react), and `clear()`. Owns `localStorage` persistence.
- `lib/doodleSound.js` — Web Audio helper: lazily creates an `AudioContext`,
  plays a short synthesized tone for a given pentatonic note, a spawn/stroke
  blip, and a pop sound. Honors a mute flag. Guards against SSR and
  autoplay/`AudioContext` failures without throwing.

## Sound

Fully synthesized via Web Audio — **no asset files**:

- A shared `AudioContext`, created lazily on the first user gesture (browser
  autoplay policy), reused thereafter.
- Notes come from a fixed pentatonic scale (e.g. C major pentatonic across an
  octave or two). Each shape's `note` indexes into this scale, so any
  combination of shapes sounds consonant.
- Tap → play the shape's note (short oscillator + gain envelope). Spawn →
  play the new shape's note. Stroke start → a soft blip. Pop → a quick
  descending/percussive blip.
- All calls are cheap oscillator+envelope nodes, stopped shortly after start.
- If muted, or if `AudioContext` is unavailable/blocked, every call no-ops.

## Persistence

Mirror the fitness calculator (`pages/fitness/index.jsx`):

- Read in a mount `useEffect`, not a lazy `useState` initializer, so the
  server-rendered HTML and the client's first render agree (no hydration
  mismatch). A `hydrated` flag gates the write effect.
- Because drift mutates positions every frame, a reset-on-change debounce
  would never fire (each frame clears the pending timer). Instead a
  fixed-interval flush (~1 s) writes the latest `objects` at most once per
  interval regardless of how fast they change, plus a flush on
  `pagehide`/`visibilitychange`/unmount so navigating away mid-play still
  persists. Writes are gated on a dirty flag and on `hydrated`. The saved
  snapshot captures roughly-current positions; exact drift position is not
  meaningful to preserve. On reload, shapes resume drifting from their saved
  positions with their saved velocities.
- Both read and write are wrapped in `try/catch`; on failure (private mode,
  quota) the app no-ops and keeps running, same as `loadStoredInputs`.
- The mute preference persists under its own key (`doodle-muted`).

## Clear button and mute toggle

A small fixed toolbar in a corner of the stage, sized as an adult touch
target but placed/styled so it is not the child's primary focus:

- **Clear**: empties the `objects` array and removes the `doodle-objects`
  storage key.
- **Mute**: toggles the `doodle-muted` flag; icon reflects state; persisted.

## Error handling

- All `localStorage` and audio access is wrapped in `try/catch` and degrades
  to a no-op on failure — only the known SSR/quota/autoplay cases, no broad
  swallowing of unrelated errors, consistent with existing repo patterns.
- No network, no external assets.

## Testing

React Testing Library + vitest, matching existing conventions
(`__tests__/pages/fitness/index.test.jsx`, `layout.test.jsx`). Randomness
(shape/color/note/velocity) is made injectable or seeded so tests are
deterministic; `requestAnimationFrame` and timers are faked.

- `lib/useDoodleObjects` unit tests: `spawnShape` appends a shape;
  `startStroke`/`appendStrokePoint` build a stroke; `moveShape` updates
  coordinates; `advance` moves a non-grabbed shape and reflects velocity at a
  bound; `popShape` removes the target and adds smaller children (and, below
  the minimum size, removes without children); `clear` empties the array;
  persistence round-trip (write then reload restores state; a throwing
  `localStorage` is tolerated).
- `DoodleCanvas` interaction tests: tap on empty space adds one shape; drag on
  empty space adds one stroke; drag starting on a shape moves it rather than
  drawing; single tap on a shape triggers the note/pulse; two quick taps on a
  shape pop it (child count increases / original id gone); the clear button
  empties the canvas.
- Sound is mocked: assert the tap/spawn/pop paths call the sound helper and
  that muting suppresses them.

## Files touched

- `pages/doodle/index.jsx` (new)
- `components/doodle/DoodleCanvas.jsx` (new)
- `components/doodle/Shape.jsx` (new)
- `components/doodle/Stroke.jsx` (new)
- `lib/useDoodleObjects.js` (new)
- `lib/doodleSound.js` (new)
- `pages/index.jsx` (add `/doodle/` link to the app list)
- Corresponding test files under `__tests__/` / colocated per repo convention
