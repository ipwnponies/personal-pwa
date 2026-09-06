# Tamagotchi Game Design

## Context

The tamagotchi scaffold (`pages/tamagotchi/`, `lib/tamagotchi/`) is committed.
It has a single stationary pet with hunger/happiness/energy decay, sleep
toggle, poop cleanup, and a fixed baby→child→adult growth path — deliberately
minimal placeholder mechanics pending this design.

Sibling app `aquarium` (`lib/aquarium/*`, `pages/aquarium/*`) is the reference
for tech stack and conventions (lib/page split, localStorage persistence with
offline catch-up, pure-function simulation modules, per-need constants
exported for the page to derive UI thresholds from). This design does not
reuse aquarium's specific mechanics (drag-and-drop, decorations, movement) —
only its architectural pattern.

## Goals

- Give the tamagotchi a real, distinct identity from the aquarium: active
  caretaking with no punishment (neglect never leads to death or permanent
  loss), branching evolution driven by how the player cared for the pet, one
  skill-based minigame, and a recoverable sickness state.
- Structure the work so three units (Evolution, Sickness, Minigame) can be
  implemented in parallel, in separate sessions/branches, without requiring
  the units to coordinate with each other mid-implementation.

## Non-goals

- No death, no permanent stat loss, no failure states of any kind.
- No multiple pet species (still a single `blob` placeholder pet).
- No real pixel-art assets — sprites stay emoji placeholders; the data shape
  must allow swapping in image files later without touching game logic.
- No changes to aquarium code.

## Data model changes (`lib/tamagotchi/simulation.js`)

New fields on the pet object, added to `createDefaultPet`:

| Field | Type | Owner | Purpose |
|---|---|---|---|
| `feedCount` | number | Unit A | Evolution tally |
| `playCount` | number | Unit A | Evolution tally |
| `sleepCycles` | number | Unit A | Evolution tally |
| `adultForm` | string \| null | Unit A | Set once at child→adult transition |
| `sick` | boolean | Unit B | Sickness state |
| `poopUncleanMinutes` | number | Unit B | Minutes poop has sat uncleaned |

`SCHEMA_VERSION` stays `1` — these are additive fields, not a breaking
reshape. **`loadPet` in `storage.js` must default missing fields** for saves
written before this change (mirrors aquarium's `storage.js` additive-default
pattern): each unit adds its own fields' defaults to that spread. This is a
shared touch point — see Conflict Boundaries.

## Unit A: Evolution + Sprite Reshape

**Owns:** evolution-related additions to `simulation.js`; **all** of
`creatures.js`; the sprite-lookup line in `pages/tamagotchi/index.jsx`.

- `feedPet` increments `feedCount`; `playWithPet` increments `playCount`;
  `toggleSleep` increments `sleepCycles` only on the awake→asleep transition
  (not on waking).
- New pure function `determineAdultForm(pet)`:
  - `total = feedCount + playCount + sleepCycles`
  - If `total < EFFICIENT_THRESHOLD` (starting value: `6`) → `'efficient'`
  - Else compute `feedFrac`/`playFrac`/`sleepFrac` of `total`. If the max
    fraction > `DOMINANCE_THRESHOLD` (starting value: `0.5`) → `'fedHeavy'` /
    `'playHeavy'` / `'sleepHeavy'` accordingly.
  - Else → `'balanced'`.
  - These starting constants are not load-bearing precision — tune during
    manual playtesting, not a blocker to merging.
- `grow()` calls `determineAdultForm(pet)` when transitioning `child` →
  `adult` and sets `adultForm` on the returned pet. Stage transitions
  otherwise unchanged.
- `creatures.js`: reshape `PETS.blob.sprite.adult` from a flat mood map into
  `{ balanced: {...moods}, fedHeavy: {...moods}, playHeavy: {...moods},
  sleepHeavy: {...moods}, efficient: {...moods} }`, each with the existing
  mood keys (`normal`, `hungry`, `sad`, `asleep`) plus a new `sick` mood key
  (placeholder: reuse the `sad` emoji until real art exists).
- New export `getSprite(petType, stage, adultForm, mood)` replacing direct
  `petType.sprite[stage][mood]` indexing — handles the `adult` branch,
  falls back to `'balanced'` if `adultForm` is null/unrecognized (keeps old
  saves without `adultForm` rendering correctly).
- `spriteMood(pet, metThreshold)` gains a `sick` check: `if (pet.sick) return
  'sick';` — ordered after the existing `asleep` check, before `hungry`/`sad`.
  Reads `pet.sick` defensively; safe as `undefined` (falsy) before Unit B's
  field exists.
- `index.jsx`: replace `const sprite = petType.sprite[pet.stage][mood];` with
  `const sprite = getSprite(petType, pet.stage, pet.adultForm, mood);` and
  add the `getSprite` import. Single-line change, isolated to that spot.

## Unit B: Sickness

**Owns:** sickness-related additions to `simulation.js` (new functions
appended at file end); the medicine button in `index.jsx`.

- `applyElapsed`: accumulate `poopUncleanMinutes` by elapsed minutes only
  while `hasPoop` is true (reset to `0` whenever `hasPoop` is false). When
  `poopUncleanMinutes` exceeds `SICKNESS_THRESHOLD_MIN` (starting value:
  `15`), set `sick: true`.
- `cleanPoop` resets `poopUncleanMinutes` to `0` but does **not** clear
  `sick` — sickness requires the cure below.
- New `giveMedicine(state)`: `{ ...state, sick: false }`.
- While `sick`, `applyElapsed` doubles `HAPPINESS_DECAY_PER_MIN`.
- `grow()`'s met-check gains `&& !pet.sick` — sickness pauses the growth
  streak (resets `wellMetSince`) without dropping any need below
  `NEED_FLOOR`. Never a punishment beyond "growth waits."
- Does **not** touch `creatures.js` — reads the `sick` mood case Unit A
  stubbed there.
- `index.jsx`: add `handleMedicine` immediately after `handleSleepToggle`
  (before `toggleSound`); add a medicine button inside `.palette`,
  immediately after the Sleep/Wake button, conditionally rendered
  `{pet.sick && (...)}` — mirrors the existing poop-button conditional
  pattern in `.screen`.

## Unit C: Minigame

**Owns:** new `lib/tamagotchi/minigame.js` (+ its test file) entirely; the
palette Play button's handler and a new overlay in `index.jsx`.

- Pet-tap (the `data-testid="pet"` button) keeps calling the existing
  `handlePlay` unchanged — a quick pat, no minigame. The minigame is
  reached only through the **palette** Play button, kept as a separate
  handler so this unit's diff never touches the pet-tap code path.
- `minigame.js`, pure functions, no DOM/React:
  - `ROUND_COUNT = 5`, `HIT_WINDOW_MS = 400`, `MIN_PLAY_AMOUNT = 10`
  - `generateRounds(count, rng)` → array of `{ targetAt }` (ms offsets)
  - `scoreTap(round, tapOffsetMs)` → `{ hit, accuracy }` (`accuracy` in
    `[0,1]`, based on `|tapOffsetMs - targetAt|` relative to `HIT_WINDOW_MS`)
  - `computePlayAmount(results)` → `MIN_PLAY_AMOUNT + (PLAY_AMOUNT -
    MIN_PLAY_AMOUNT) * averageAccuracy` (imports `PLAY_AMOUNT` from
    `simulation.js` as the ceiling; floor guarantees no-punishment even on
    a total miss).
- `index.jsx`: add a `minigameActive` state + `handleOpenMinigame` right
  after the `commit` callback (before `handleFeed`). Change the **palette**
  Play button's `onClick` from `handlePlay` to `handleOpenMinigame`. Add a
  local `MinigameOverlay` function component in the same file (same pattern
  as the existing `NeedBar`), rendered as `{minigameActive && (...)}`
  immediately after the closing `</div>` of `.screen`, before `.needs`. On
  round completion it calls `commit((prev) => playWithPet(prev,
  computePlayAmount(results)), 'play')` and closes.

## Conflict Boundaries (why this stays mergeable)

- **`creatures.js`**: single-owned by Unit A. Units B and C never edit it.
- **`simulation.js`**: Units A and B both add fields to `createDefaultPet`'s
  object literal and both append new exported functions near the end of the
  file. Expect a **trivial textual conflict** at merge — keep both blocks,
  either order, no logic to reconcile.
- **`storage.js`**: Units A and B both add default values for their new
  fields to `loadPet`'s additive-default object. Same trivial-conflict
  class as above.
- **`grow()` in `simulation.js`**: both units edit this specific function —
  A changes the stage-transition return (adds `adultForm` selection), B
  changes the `met` check (adds `&& !pet.sick`). Different lines a few
  lines apart, expected to merge cleanly under standard line-based diff,
  but called out explicitly since it's a shared function, not just a
  shared file. Whichever branch merges second should re-read `grow()`
  after merging to confirm both changes are present and correct.
- **`index.jsx`**: three distinct regions — sprite-lookup line (A),
  palette medicine button + its handler (B), palette Play button's
  `onClick` + new overlay block + its own handler (C). Non-overlapping
  line ranges, clean merge.
- **Tests**: each unit adds its own new test file — `creatures.test.js`
  gets Unit A's new cases added directly (Unit A owns the whole file
  including its test); Unit B's new sickness cases go in a new
  `simulation-sickness.test.js`; Unit C's cases go in `minigame.test.js`.
  No unit appends to the existing shared `simulation.test.js`, avoiding
  same-file test-append conflicts.
