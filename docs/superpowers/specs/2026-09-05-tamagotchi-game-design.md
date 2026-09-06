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

The data model, constants, and one behavior fix described in "Baseline"
below are already implemented and committed — an adversarial review of an
earlier draft of this spec found that leaving them as "each unit adds its
own" produced real conflicts, including one whose obvious merge resolution
silently drops a unit's data. Landing them first removes that risk instead
of documenting around it.

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

## Baseline (already committed)

- `createDefaultPet` (`simulation.js`) already has `feedCount`, `playCount`,
  `sleepMinutes`, `adultForm` (evolution) and `sick`, `poopUncleanMinutes`
  (sickness), all zero/null/false. `SCHEMA_VERSION` stays `1` — additive
  fields, not a breaking reshape.
- `loadPet` (`storage.js`) already defaults all six fields for saves written
  before this change, in the correct order — **defaults first, then
  `...parsed`**, so a save that already has a value keeps it and only a
  missing field falls back to the default. Getting this order backwards
  would silently wipe `sick`/`adultForm` back to default on every reload.
- Evolution constants `EFFICIENT_THRESHOLD` (`6`), `DOMINANCE_THRESHOLD`
  (`0.5`), `SLEEP_MINUTES_PER_TALLY_UNIT` (`5`), and sickness constant
  `SICKNESS_THRESHOLD_MIN` (`15`) already exist in `simulation.js`. Starting
  values, not load-bearing precision — tune during playtesting, not a
  blocker to merging.
- **Sleep is tracked as accumulated minutes asleep (`sleepMinutes`), not a
  toggle-tap count** — a tap-count would let a player spam the sleep button
  to cheaply buy the `sleepHeavy` evolution form with no real caretaking
  behind it. `sleepMinutes` accumulates only while actually asleep (Unit A's
  job, in `applyElapsed`; see below), converted to a tally unit via
  `SLEEP_MINUTES_PER_TALLY_UNIT` so it compares fairly against raw
  `feedCount`/`playCount`.
- The pet-tap pat (existing `handlePlay`, the `data-testid="pet"` button)
  now uses a new, smaller `PET_TAP_AMOUNT` (`10`) instead of the full
  `PLAY_AMOUNT` (`25`). Previously the free tap matched the planned
  minigame's best-case reward, making the minigame pointless to ever play.
  `PLAY_AMOUNT` remains the minigame's ceiling (Unit C).
- `__tests__/pages/tamagotchi/index.test.jsx`'s `basePet()` fixture already
  includes all six new fields at their defaults.

None of the above is any unit's task — it already exists on top of which
Units A/B/C add logic only.

## Unit A: Evolution + Sprite Reshape

**Owns:** evolution-related additions to `simulation.js`, including the
`applyElapsed` `sleepMinutes` accumulation and the `grow()` adult-form
selection; **all** of `creatures.js`; the sprite-lookup line and an
evolve-cue trigger in `pages/tamagotchi/index.jsx`.

- `feedPet` increments `feedCount`; `playWithPet` increments `playCount`
  (this fires for both the pet-tap pat and a completed minigame — both are
  "play" from the tally's point of view, they just differ in `amount`).
- `applyElapsed` gains: `sleepMinutes: state.asleep ? state.sleepMinutes +
  minutes : state.sleepMinutes`. Add this block immediately after the
  existing `hunger`/`happiness`/`energy` decay computation, before the
  `poopMinutes` block — see Conflict Boundaries for why this placement
  matters.
- New pure function `determineAdultForm(pet)`:
  - `sleepTallyUnits = Math.floor(pet.sleepMinutes / SLEEP_MINUTES_PER_TALLY_UNIT)`
  - `total = feedCount + playCount + sleepTallyUnits`
  - If `total < EFFICIENT_THRESHOLD` → `'efficient'`.
  - Else compute `feedFrac`/`playFrac`/`sleepFrac` of `total`. If the max
    fraction > `DOMINANCE_THRESHOLD` → `'fedHeavy'` / `'playHeavy'` /
    `'sleepHeavy'` accordingly.
  - **Tie-break** (reachable once `DOMINANCE_THRESHOLD` is tuned below
    `0.5`, where two fractions can both exceed it): prefer in order
    feed &gt; play &gt; sleep.
  - Else → `'balanced'`.
  - Known limitation, not a merge blocker: with the current stage durations
    (child stage 15 real minutes) and decay rates, the entire five-way
    branch is decided inside roughly a ±1-interaction band around 5–7 total
    taps, and `sleepHeavy` is hard to reach at all since energy isn't part
    of `grow()`'s met-check — nothing forces the player to ever put the pet
    to sleep. Acceptable for this pass; revisit stage duration or add an
    energy-based growth incentive in a later pass if this needs to feel
    more reachable.
- `grow()`: when transitioning `child` → `adult` (i.e. `NEXT_STAGE[pet.stage]
  === 'adult'`), call `determineAdultForm(pet)` and set `adultForm` on the
  returned pet. `adultForm` stays `null` through `baby`/`child` — do not set
  it on the baby→child transition. This is the **only** change Unit A makes
  to `grow()` — the sickness unit no longer touches this function (see
  Unit B).
- `creatures.js`:
  - Reshape `PETS.blob.sprite.adult` from a flat mood map into `{ balanced:
    {...moods}, fedHeavy: {...moods}, playHeavy: {...moods}, sleepHeavy:
    {...moods}, efficient: {...moods} }`.
  - Add a new `sick` mood key **to every stage's mood map — `baby`, `child`,
    and each of the five adult forms** (not adult-only: sickness has no
    stage gate, so a baby or child pet can get sick too). Placeholder: reuse
    the `sad` emoji until real art exists.
  - New export `getSprite(petType, stage, adultForm, mood)` replacing direct
    `petType.sprite[stage][mood]` indexing:
    - `adultForm` fallback: falls back to `'balanced'` if null/unrecognized
      (covers a pre-existing adult save from before this change, and covers
      the fact that an adult save's `adultForm` is set once and never
      recomputed — it stays `'balanced'` forever if evolution logic didn't
      run before it reached adulthood).
    - `mood` fallback: falls back to `'normal'` if the resolved mood key is
      missing from that stage's table (defensive; every stage should have
      every mood key going forward, but this keeps a future stage/mood
      addition non-breaking).
  - `spriteMood(pet, metThreshold)` gains a `sick` check: `if (pet.sick)
    return 'sick';` — ordered **after** the existing `asleep` check,
    **before** `hungry`/`sad`. This means a sick pet's hunger/sadness cue is
    hidden while sick; accepted as an intentional priority, not a bug.
    Reads `pet.sick`, which already exists per Baseline.
- `index.jsx`:
  - Replace `const sprite = petType.sprite[pet.stage][mood];` with `const
    sprite = getSprite(petType, pet.stage, pet.adultForm, mood);` and add
    the `getSprite` import.
  - Add an evolve-cue trigger: track the pet's previous `stage` in a ref,
    and in a `useEffect` keyed on `pet.stage`, play the existing `'evolve'`
    sound cue (`sound.js` already defines this tone; it's just never
    triggered today) when `stage` changes to `'adult'`. New, small,
    self-contained `useEffect` — does not touch any other unit's code.

## Unit B: Sickness

**Owns:** sickness-related additions to `simulation.js` — an addition
inside `applyElapsed` (not `grow()`) and `giveMedicine`; a new `medicine`
tone in `sound.js`; the medicine button + handler in `index.jsx`.

- `applyElapsed`: add this block immediately after the existing
  `hasPoop`/`poopMinutes` computation, before the `grow()` call:
  ```
  const poopUncleanMinutes = state.hasPoop
    ? state.poopUncleanMinutes + minutes
    : (poopSpawns > 0 ? poopMinutes % POOP_INTERVAL_MIN : 0);
  const sick = state.sick || poopUncleanMinutes > SICKNESS_THRESHOLD_MIN;
  ```
  Read carefully: `state.hasPoop` here is the **incoming** flag (before this
  call), not the `hasPoop` newly computed a few lines above it in the
  existing code. If poop was already sitting there at the start of this
  call, the entire elapsed `minutes` count toward uncleanliness. If poop
  spawns fresh partway through this call (a long offline gap), only the
  minutes since that spawn count — which is exactly `poopMinutes %
  POOP_INTERVAL_MIN` (the same remainder the existing code already returns
  as the next `poopMinutes`). Getting this backwards either makes a long
  clean absence impossible to get sick from (checking the newly-computed
  `hasPoop` and adding the full gap), or makes any absence with poop present
  count the same regardless of actual duration (checking incoming `hasPoop`
  as a gate but adding the full gap unconditionally).
  - Use the freshly computed `sick` (not `state.sick`) for the doubled
    happiness decay below and for the `grow()`-skip below — both must see
    this tick's sickness, not last tick's, or a pet that becomes sick mid-gap
    gets no doubled decay for that gap while one that entered already sick
    gets doubled decay it shouldn't for a stale reason.
  - While `sick` (the freshly computed value): double
    `HAPPINESS_DECAY_PER_MIN` for this call's happiness decay.
  - **Do not add `&& !pet.sick` to `grow()`'s met-check.** That resets
    `wellMetSince` to `null` on the failure path that already exists there
    — getting sick at the last minute of a 15-minute stage would cost the
    full 15 minutes again, a real punishment that contradicts the Goals.
    Instead, skip calling `grow()` entirely when `sick` is true:
    `const grown = sick ? state : grow({ ...state, hunger, happiness,
    energy, sleepMinutes }, now, prevNow);` — when skipped, `grown` is the
    plain incoming `state`, so `stage`/`wellMetSince`/`adultForm` pass
    through completely untouched (frozen, not reset).
  - **The function's final return must explicitly restate every field
    computed above, not just spread `...grown`** — because when `sick` is
    true, `grown` is the *original* `state`, which still carries the *old*
    `hunger`/`happiness`/`energy`/`sleepMinutes` values from before this
    call's decay/accumulation. The existing return already does this for
    `poopMinutes`/`hasPoop`/`lastSeen`; extend that same list to also
    include `hunger`, `happiness`, `energy`, `sleepMinutes` (Unit A's
    field), `sick`, `poopUncleanMinutes`:
    ```
    return {
      ...grown,
      hunger, happiness, energy, sleepMinutes,
      sick, poopUncleanMinutes,
      poopMinutes: poopMinutes % POOP_INTERVAL_MIN,
      hasPoop,
      lastSeen: now,
    };
    ```
    This is the one place in `applyElapsed` where Unit A's and Unit B's
    fields sit on the same lines — both units add their field names to this
    existing return-object's list rather than each writing a separate
    return. This makes Unit B's change genuinely no-punishment: `grow()`
    itself is untouched, solely Unit A's to edit.
- `cleanPoop`: only reset `poopUncleanMinutes` to `0` **inside the existing
  `hasPoop`-true branch** — i.e. `(state) => (state.hasPoop ? { ...state,
  hasPoop: false, poopUncleanMinutes: 0 } : state)`. The existing test
  asserts `cleanPoop` returns the *same object reference* when there's no
  poop (`toBe(clean)`); an unconditional reset breaks that.
- New `giveMedicine(state)`: `{ ...state, sick: false }`. Does **not**
  reset `poopUncleanMinutes` — that only resets on an actual clean.
- `sound.js`: add a new `medicine` tone to `TONES` (same shape as the
  existing entries, e.g. `{ freq: 700, type: 'sine', ms: 150 }`) — no other
  unit touches this file. `giveMedicine`'s handler in `index.jsx` plays it.
- Does **not** touch `creatures.js` — reads the `sick` mood case Unit A
  added there, at every stage.
- `index.jsx`: add `handleMedicine` immediately after `handleSleepToggle`
  (before `toggleSound`); add a medicine button inside `.palette`,
  immediately after the Sleep/Wake button, conditionally rendered
  `{pet.sick && (...)}` — mirrors the existing poop-button conditional
  pattern in `.screen`.
- `__tests__/pages/tamagotchi/index.test.jsx`: add a new test for the
  medicine button (seed `sick: true`, click, assert `sick` becomes `false`
  and the button disappears) — additive, does not touch the existing tests
  in that file.

Accepted trade-off, not a bug: sickness's doubled happiness decay makes the
player spend extra feed/play actions to recover, which nudges the evolution
tally (Unit A) toward `playHeavy` and away from `efficient`. Sickness
quietly costs an evolution outcome. Not addressed in this pass — flagging so
it isn't mistaken for a Unit A defect later.

## Unit C: Minigame

**Owns:** new `lib/tamagotchi/minigame.js` (+ its test file) entirely; the
palette Play button's handler and a new overlay in `index.jsx`; rewriting
one existing page test.

- Pet-tap (the `data-testid="pet"` button) keeps calling the existing
  `handlePlay` unchanged (now using the already-committed `PET_TAP_AMOUNT`)
  — a quick pat, no minigame. The minigame is reached only through the
  **palette** Play button, kept as a separate handler so this unit's diff
  never touches the pet-tap code path.
- `minigame.js`, pure functions, no DOM/React:
  - `ROUND_COUNT = 5`, `HIT_WINDOW_MS = 400`, `MIN_ROUND_SPACING_MS = 600`
  - `generateRounds(count, rng)` → array of `{ targetAt }` (ms offsets),
    strictly increasing and at least `MIN_ROUND_SPACING_MS` apart, first
    `targetAt` at least `MIN_ROUND_SPACING_MS` after `0` (so the overlay has
    time to render before the first target).
  - `scoreTap(round, tapOffsetMs)` → `{ hit, accuracy }`: `dist =
    Math.abs(tapOffsetMs - round.targetAt)`; `hit = dist <= HIT_WINDOW_MS`;
    `accuracy = clamp(1 - dist / HIT_WINDOW_MS, 0, 1)` (linear falloff,
    zero once `dist >= HIT_WINDOW_MS`).
  - **`computePlayAmount(results)` requires `results` to always be exactly
    `ROUND_COUNT` entries long, one per round, in order — a round the
    player never tapped is still present as `{ hit: false, accuracy: 0 }`,
    never omitted.** `computePlayAmount` does not itself guard against a
    shorter/empty array — that contract is the caller's (the overlay's)
    responsibility, per below. `amount = MIN_PLAY_AMOUNT + (PLAY_AMOUNT -
    MIN_PLAY_AMOUNT) * averageAccuracy`, `MIN_PLAY_AMOUNT = 10`.
- `index.jsx`:
  - Add a `minigameActive` state + `handleOpenMinigame` right after the
    `commit` callback (before `handleFeed`). Change the **palette** Play
    button's `onClick` from `handlePlay` to `handleOpenMinigame`.
  - Add a local `MinigameOverlay` function component in the same file (same
    pattern as the existing `NeedBar`), rendered as `{minigameActive &&
    (...)}` immediately after the closing `</div>` of `.screen`, before
    `.needs`.
  - **The overlay always produces a full `ROUND_COUNT`-length `results`
    array before calling `computePlayAmount`** — a round the player didn't
    tap in time is recorded as `{ hit: false, accuracy: 0 }` when its
    window closes, not left out. This is what prevents `computePlayAmount`
    from ever seeing a short/empty array and producing `NaN` (which would
    otherwise persist into `localStorage` as `null` and permanently corrupt
    the happiness stat on the next load).
  - **Cancel/close path**: the overlay has a close control. Closing before
    all rounds complete discards the session — it does **not** call
    `playWithPet` at all (no partial credit, but also no penalty; consistent
    with the no-punishment goal). Without this, a player who opens the
    overlay and walks away is stuck behind it while the 2s tick keeps
    decaying needs underneath.
  - On successful completion (all rounds resolved) it calls
    `commit((prev) => playWithPet(prev, computePlayAmount(results)),
    'play')` and closes.
  - The overlay's own round-timing logic (timers driving when each round's
    window opens/closes) lives in this React component, not in
    `minigame.js` — it is exercised by manual verification, not unit tests;
    `minigame.js`'s pure functions (`generateRounds`, `scoreTap`,
    `computePlayAmount`) are the parts covered by `minigame.test.js`.
- `__tests__/pages/tamagotchi/index.test.jsx`: the existing **"playing
  raises happiness" test currently targets the palette Play button**
  (`getByRole('button', { name: 'Play' })`) and asserts an immediate
  happiness increase — this breaks once this unit reroutes that button to
  open the overlay instead of committing directly. Rewrite it to cover the
  pet-tap path instead (`data-testid="pet"`, unaffected by this unit) for
  the immediate-happiness-increase behavior, and add new test(s) for the
  palette button opening the overlay (`minigameActive` becomes visible) and
  for a completed minigame session raising happiness. This is the one
  existing test in that file this unit is responsible for changing.

## Conflict Boundaries (why this stays mergeable)

- **`creatures.js`**: single-owned by Unit A. Units B and C never edit it.
- **`applyElapsed` in `simulation.js`**: both Unit A (the `sleepMinutes`
  block, placed right after the hunger/happiness/energy decay) and Unit B
  (the `poopUncleanMinutes`/`sick` block and the conditional `grow()` call,
  placed right after the existing `hasPoop` computation) touch this one
  function, at two different, explicitly-placed locations, **plus a third
  shared point: the final return statement**, where both units add their
  field names to the same existing list (see Unit B's return-statement
  note). That third point is a same-line-region edit, not just a
  same-function one — expected to merge as a slightly less trivial but
  still mechanical conflict (both sides add comma-separated names to one
  object literal). Whichever branch merges second should re-read the whole
  function afterward to confirm every field from both units is present in
  the return, and that the `grow()` call site correctly reflects Unit B's
  skip-when-sick change with Unit A's `sleepMinutes` included in the object
  passed to `grow()`.
- **`grow()` in `simulation.js`**: Unit A only, now (adult-form selection at
  the child→adult transition). Unit B no longer touches this function.
- **`index.jsx` import block**: all three units add an import line here (A:
  `getSprite`; B: `giveMedicine`; C: minigame functions). Three independent
  line insertions in the same block — trivial, expected.
- **`index.jsx` handler/render regions**: sprite-lookup line + evolve-cue
  effect (A), medicine button + handler (B), palette Play `onClick` +
  overlay + handler (C) — non-overlapping, clean merge.
- **`__tests__/pages/tamagotchi/index.test.jsx`**: Unit B adds one new,
  additive test (medicine button). Unit C rewrites one existing test and
  adds new ones (see Unit C). These are different tests in different parts
  of the file — Unit A makes no changes to this file at all.
- **`sound.js`**: Unit B only (new `medicine` tone). Unit A calls the
  already-existing `evolve` tone from `index.jsx`, no file change needed in
  `sound.js` itself.
- Everything in "Baseline" above (`createDefaultPet`, `loadPet`, the
  constants block) is already committed and is **not** touched by any of
  the three units — removed from the shared-conflict surface entirely.
