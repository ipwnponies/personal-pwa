---
paths:
  - "pages/tamagotchi/**"
  - "lib/tamagotchi/**"
---

# Tamagotchi

Virtual pet. Scaffold stage — single stationary pet, needs decay over time,
tap-driven care actions. Mechanics (species variety, evolution branches,
minigames, discipline/sickness, death) are deliberately unbuilt pending
brainstorming; this is the tech skeleton, cloned from `lib/aquarium`'s
pattern, not the final design.

## Layout

- `pages/tamagotchi/index.jsx` — all UI and interaction handling (tap pet to
  play, tap action buttons, tap poop to clean). No drag/pointer gestures and
  no animation loop — unlike the aquarium, the pet doesn't move.
- `lib/tamagotchi/simulation.js` — need decay (hunger/happiness/energy),
  poop-pile spawn cadence, stage growth. Pure functions, exported constants
  (`MET_THRESHOLD`, `NEED_FLOOR`, `NEED_MAX`) the page derives thresholds
  from — don't hardcode duplicate thresholds in the page.
- `lib/tamagotchi/creatures.js` — pet type definitions (sprite per
  stage/mood). Currently a single `blob` placeholder.
- `lib/tamagotchi/storage.js` — localStorage load/save of pet state,
  including offline catch-up (`applyElapsed` covers elapsed time since last
  visit).
- `lib/tamagotchi/sound.js` — sound effect playback, toggled by
  `pet.soundOn`.

## Conventions

- Pet state lives in a single `pet` object in React state, persisted via
  `savePet` on every `commit`. A 2s interval tick (`TICK_MS`) applies decay
  and persists — same shape as the aquarium's tick, but there is no
  per-frame movement loop to also feed, so every state update goes through
  storage.
- Energy is bidirectional: it drains while awake and recovers while
  `asleep`, driven by the same `applyElapsed` call — see the ternary there
  rather than a separate sleep-tick.
- Growth (`grow` in simulation.js) requires hunger and happiness both above
  `MET_THRESHOLD` for the stage's full duration, tracked via
  `wellMetSince`. Mirrors the aquarium's growth streak.
- New need/threshold logic should derive from the constants simulation.js
  exports rather than introducing new magic numbers.
