---
paths:
  - "pages/tamagotchi/**"
  - "lib/tamagotchi/**"
scope: tamagotchi
---

# Tamagotchi

Virtual pet. Needs decay over time, tap-driven care actions, branching
evolution, a recoverable sickness state, a timing minigame, and three species
the player picks from when a pet is created. No death and no permanent stat
loss anywhere — that is a standing design constraint, not an omission.

## Layout

- `pages/tamagotchi/index.jsx` — all UI and interaction handling (tap pet to
  play, tap action buttons, tap poop to clean). No drag/pointer gestures and
  no animation loop — unlike the aquarium, the pet doesn't move.
- `lib/tamagotchi/simulation.js` — need decay (hunger/happiness/energy),
  poop-pile spawn cadence, stage growth. Pure functions, exported constants
  (`MET_THRESHOLD`, `NEED_FLOOR`, `NEED_MAX`) the page derives thresholds
  from — don't hardcode duplicate thresholds in the page.
- `lib/tamagotchi/creatures.js` — pet type definitions (sprite per
  stage/mood). Three species (`blob`, `sprout`, `ember`), each declaring its own adult
  `forms` map and `defaultForm`.
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
- Evolution has two halves that must stay apart. `careVerdict` in
  `simulation.js` classifies the care tally into a species-independent verdict
  (`balanced`/`fedHeavy`/`playHeavy`/`sleepHeavy`/`efficient`); `resolveForm`
  in `creatures.js` maps that verdict onto the species' own form key, which is
  what `pet.adultForm` stores. Keep tally math in `simulation.js` and branch
  naming in `creatures.js` — a species must never need a code change in
  `simulation.js`.
- `loadPet` returns `null` when there is no usable save. The page treats that
  as "show the species chooser", so any new caller must handle null rather
  than assume a pet.
