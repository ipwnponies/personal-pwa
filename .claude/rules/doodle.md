---
paths:
  - "pages/doodle/**"
  - "components/doodle/**"
---

# Doodle

Tap-and-draw musical sandbox for young children. Already split cleanly: page is a thin wrapper, all behavior lives in `components/doodle/`.

## Layout

- `pages/doodle/index.jsx` — thin page shell (Head/meta, background color via `usePageBackground`), renders `<DoodleCanvas />`. Keep it thin; new behavior belongs in `components/doodle/`, not here.
- `components/doodle/DoodleCanvas.jsx` — canvas surface, pointer/touch handling, orchestrates strokes and shapes.
- `components/doodle/Stroke.jsx` — freehand line rendering.
- `components/doodle/Shape.jsx` — discrete shape stamps.
- `components/doodle/Particles.jsx` — renders the particle system (bursts/spirals/squash/dust).
- `components/doodle/TuningPanel.jsx` — overlay of adjustable number inputs for particle/physics feel constants (see "Tuning panel" convention below).
- `components/doodle/doodle.module.css` — component-scoped styles.
- `lib/doodleShapes.js` — shape creation/split/merge/drift, pure functions.
- `lib/doodlePhysics.js` — `resolveCollisions`: pairwise bounce/merge physics.
- `lib/doodleParticles.js` — particle spawn/advance helpers.
- `lib/useDoodleObjects.js` — the objects-array hook (spawn/move/transform/pop/advance/persist).
- Tests co-located: `DoodleCanvas.test.jsx`, `Shape.test.jsx`, `TuningPanel.test.jsx`, `lib/doodle*.test.js`.

## Conventions

- This is the reference pattern for other mini-apps if they get split out of their monolithic page files — page stays presentational/thin, interaction and rendering logic moves to `components/<app>/`.
- Target audience is young children: prefer large touch targets, forgiving gesture thresholds, and immediate visual/audio feedback over precision-oriented interactions.

### Tuning panel

- Any new constant that shapes the *feel* of physics/particles (a count, an age/duration, a speed range, a frame-throttle interval) belongs in the tuning panel (`TuningPanel.jsx`), not as a bare hardcoded constant — it should be exposed as an adjustable, `localStorage`-persisted setting (`doodle-tuning` key in `DoodleCanvas.jsx`, merged over defaults on load so new fields added later don't break old stored values) so it can be live-tweaked to find a good default without a code change. Existing examples: `maxParticles`, `dustMaxAge`, `dustFrameInterval`, `driftMin`/`driftMax`.
- The owning `lib/` module still exports a `DEFAULT_*` constant and the function takes the tunable as an optional trailing parameter defaulting to it (e.g. `DEFAULT_MAX_PARTICLES` + `advanceParticles(particles, dt, maxParticles = DEFAULT_MAX_PARTICLES)`, `DEFAULT_DRIFT_MIN`/`DEFAULT_DRIFT_MAX` + `createShape(..., driftMin, driftMax)`). This keeps every lib function callable/testable in isolation with sane defaults, with `DoodleCanvas` as the only place that threads live tuning state in.
- Constants that are structural/safety-related rather than feel-related (e.g. `MOVE_THRESHOLD`, `MAX_POINTERS`, `SPLIT_GRACE_S`) stay as plain constants — the bar is "would a parent/dev plausibly want to live-tweak this to see how it feels," not "is it a number."

### rng threading

- Every pure function that makes a random choice (`createShape`, `splitShape`, `mergeShapes`, `resolveCollisions`) takes `rng = Math.random` as a parameter and never calls `Math.random()` directly — this is what makes deterministic, seeded tests (`seq([...])`, a cycling-array fake rng used throughout `lib/doodle*.test.js` and `DoodleCanvas.test.jsx`) possible. Follow this for any new randomized behavior.
- **Gotcha**: tests built on `seq([...])` hand-compute expected values from the exact *position* of each `rng()` call. Adding an unconditional `rng()` draw to `createShape`/`splitShape` (even one whose result is discarded) silently shifts every later draw and can break tests far from the change. If a new randomized range can degenerate to a fixed value (min === max), skip the `rng()` call entirely in that case — see the `driftSpeed` helper in `doodleShapes.js` for the pattern — so the default (unwidened) case draws exactly as many rng() calls as before.

### Spawn-time collision immunity

- A shape that spawns already overlapping another (split children spawning near the parent's point, sharing its color/shapeType) needs brief immunity from collision resolution, or it gets silently re-merged/bounced on the very next frame before a player can perceive it. Pattern: a `<name>Remaining` countdown field (seconds) set at spawn time, decremented in `advanceShape` and deleted once it hits zero, checked in `resolveCollisions` to skip that shape's collision handling entirely while active. `splitGraceRemaining`/`SPLIT_GRACE_S` is the existing instance — reuse this pattern rather than inventing a new one for future spawn-immunity needs.
