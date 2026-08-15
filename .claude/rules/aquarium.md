---
paths:
  - "pages/aquarium/**"
  - "lib/aquarium/**"
---

# Aquarium

Virtual pet fish tank. Tap/drag to feed or play, dirt spots accumulate and need wiping, eggs hatch, fish wander and seek dropped food/toys.

## Layout

- `pages/aquarium/index.jsx` — all UI, interaction handling (click/drag/pointer), and the requestAnimationFrame movement loop. Not split into `components/` yet.
- `lib/aquarium/simulation.js` — need decay (hunger/happiness/cleanliness), drop lifecycle (food/toy spawn/consume), egg hatching, seek-target assignment. Pure functions, exported constants (`MET_THRESHOLD`, `NEED_FLOOR`, `NEED_MAX`) that the page derives UI thresholds from — don't hardcode duplicate thresholds in the page.
- `lib/aquarium/movement.js` — per-frame steering/wobble math, independent of React.
- `lib/aquarium/creatures.js` — species definitions (emoji, size per growth stage, hue).
- `lib/aquarium/storage.js` — localStorage load/save of tank state, including offline catch-up (`applyElapsed` covers elapsed time since last visit).
- `lib/aquarium/sound.js` — sound effect playback, toggled by `tank.soundOn`.

## Conventions

- Tank state lives in a single `tank` object in React state, persisted via `saveTank` on every `commit`. The 2s interval tick and the animation frame loop both write through `setTank`, but only the interval tick persists to storage — per-frame movement is state-only until the next tick.
- Movement state (`moveStatesRef`) is a `Map` keyed by creature id, kept outside React state deliberately — it updates every animation frame and would be too hot for `setState`.
- New need/threshold logic should derive from the same constants the simulation module exports (see `WANT_BUBBLE_THRESHOLD` deriving from `MET_THRESHOLD`) rather than introducing new magic numbers, so the UI cue and the actual seek-eligibility test can't drift apart.
- Drag interactions are pointer-event based, not native HTML5 drag-and-drop; `document.elementFromPoint` is used to detect drags across dirt spots, which jsdom doesn't implement — tests should account for this gap.
