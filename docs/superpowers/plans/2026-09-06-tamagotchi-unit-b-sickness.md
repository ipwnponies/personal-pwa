# Tamagotchi Unit B: Sickness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the tamagotchi a recoverable sickness state: leaving poop uncleaned too long makes the pet sick (doubled happiness decay, frozen growth), and a medicine action clears it — no permanent loss.

**Architecture:** Sickness detection and its effects are added inside the existing `lib/tamagotchi/simulation.js` `applyElapsed` function (not `grow()` — sickness never resets `grow()`'s own streak logic, only skips calling it). A new `giveMedicine` pure function clears sickness. A new `medicine` sound cue and a conditionally-rendered medicine button surface it in `pages/tamagotchi/index.jsx`.

**Tech Stack:** Vanilla JS (no TypeScript), Vitest + jsdom for unit tests, React 18 function components.

**Spec:** `docs/superpowers/specs/2026-09-05-tamagotchi-game-design.md` (see "Unit B: Sickness" and "Conflict Boundaries")

## Global Constraints

- This is Unit B only, developed independently of Unit A (Evolution) and Unit C (Minigame) in a separate session/branch, starting from the same already-committed baseline. Do not wait for or reference Unit A's/Unit C's work — this plan is written directly against the current baseline files, not against any other unit's changes.
- Baseline is already committed: `createDefaultPet`'s `sick`/`poopUncleanMinutes` fields (both start `false`/`0`), `loadPet`'s additive-default spread, and `SICKNESS_THRESHOLD_MIN = 15` (in `simulation.js`) all already exist. Read them, don't recreate them.
- No death, no permanent stat loss, no failure states of any kind (spec Non-goals). Sickness must be fully recoverable via `giveMedicine` and must never reset `grow()`'s `wellMetSince` streak.
- No changes to `lib/aquarium/*` or `pages/aquarium/*`.
- No changes to `lib/tamagotchi/creatures.js` — this unit only *reads* the `sick` mood case another unit is responsible for adding there; do not add it yourself, and do not touch that file.
- Airbnb ESLint config is active (`.eslintrc.yml`) — React components must be function declarations, not arrow functions (`react/function-component-definition`). Run `npx eslint <changed files>` before each commit.
- **Merge note for whoever integrates this branch with Unit A's:** Unit A also edits `applyElapsed` (adding a `sleepMinutes` local and appending it to the object passed into `grow()`). This plan's Task 1 touches that same `grow(...)` call-site line (wrapping it in a sickness ternary) and the same final `return` object (adding `sick`/`poopUncleanMinutes`/etc. as new lines). Expect a real, but mechanical, merge conflict on the `grow(...)` call-site line specifically — resolve by keeping both edits: `grow({ ...state, hunger, happiness, energy, sleepMinutes }, now, prevNow)` inside the `sick ? state : ...` ternary this plan introduces. Re-read the whole function afterward to confirm both units' fields are present.

---

### Task 1: Sickness detection, doubled happiness decay, and growth freeze in `applyElapsed`

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`applyElapsed`)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `state.hasPoop`, `state.poopUncleanMinutes`, `state.sick` (Baseline fields); `SICKNESS_THRESHOLD_MIN` (already defined in this file).
- Produces: `applyElapsed`'s returned pet gains correct `sick`/`poopUncleanMinutes` values; happiness decays at double rate while sick; `grow()` is skipped entirely (stage/`wellMetSince` frozen, not reset) while sick. Consumed by `cleanPoop`/`giveMedicine` (Tasks 2–3) and by `creatures.js`'s `sick` mood (another unit — read-only dependency, not built here).

- [ ] **Step 1: Write the failing tests**

Add `SICKNESS_THRESHOLD_MIN` to the existing import list at the top of `lib/tamagotchi/simulation.test.js`, then add a new `describe` block:

```js
describe('applyElapsed sickness', () => {
  it('accumulates poopUncleanMinutes for the whole gap when poop was already sitting there', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const next = applyElapsed(pet, 10 * 60e3, 10 * 60e3);
    expect(next.poopUncleanMinutes).toBe(10);
  });

  it('only counts minutes since a poop that spawns partway through the gap', () => {
    const pet = { ...createDefaultPet(0), hasPoop: false, poopMinutes: 0 };
    const elapsed = (POOP_INTERVAL_MIN + 5) * 60e3;
    const next = applyElapsed(pet, elapsed, elapsed);
    expect(next.hasPoop).toBe(true);
    expect(next.poopUncleanMinutes).toBe(5);
  });

  it('becomes sick once poopUncleanMinutes exceeds the threshold', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const elapsed = (SICKNESS_THRESHOLD_MIN + 1) * 60e3;
    expect(applyElapsed(pet, elapsed, elapsed).sick).toBe(true);
  });

  it('does not become sick exactly at the threshold', () => {
    const pet = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 0 };
    const elapsed = SICKNESS_THRESHOLD_MIN * 60e3;
    expect(applyElapsed(pet, elapsed, elapsed).sick).toBe(false);
  });

  it('stays sick once sick, even if this tick alone would not cross the threshold', () => {
    const pet = { ...createDefaultPet(0), sick: true, hasPoop: false, poopUncleanMinutes: 0 };
    expect(applyElapsed(pet, 60e3, 60e3).sick).toBe(true);
  });

  it('doubles happiness decay while sick', () => {
    const elapsed = 5 * 60e3;
    const healthyNext = applyElapsed(createDefaultPet(0), elapsed, elapsed);
    const sickNext = applyElapsed({ ...createDefaultPet(0), sick: true }, elapsed, elapsed);
    const healthyLoss = NEED_MAX - healthyNext.happiness;
    const sickLoss = NEED_MAX - sickNext.happiness;
    expect(sickLoss).toBe(healthyLoss * 2);
  });

  it('freezes growth while sick, even once care needs and stage duration are met', () => {
    const pet = { ...createDefaultPet(0), wellMetSince: 0, sick: true };
    const duration = STAGE_DURATIONS_MS.baby;
    const next = applyElapsed(pet, duration, duration);
    expect(next.stage).toBe('baby');
    expect(next.wellMetSince).toBe(0);
  });

  it('still grows normally when not sick', () => {
    const pet = { ...createDefaultPet(0), wellMetSince: 0 };
    const duration = STAGE_DURATIONS_MS.baby;
    expect(applyElapsed(pet, duration, duration).stage).toBe('child');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t sickness`
Expected: FAIL — `poopUncleanMinutes`/`sick` are `undefined` on the returned pet, happiness decay isn't doubled, growth isn't frozen.

- [ ] **Step 3: Implement**

In `lib/tamagotchi/simulation.js`, change the `happiness` declaration from `const` to `let` (needed so the sickness block below can adjust it in place without a rename), then add the sickness block after the existing `hasPoop`/`poopMinutes` computation, and update the `grow()` call and final `return`:

```js
export const applyElapsed = (state, elapsedMs, now = Date.now()) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const prevNow = state.lastSeen;

  const hunger = decay(state.hunger, HUNGER_DECAY_PER_MIN, minutes);
  let happiness = decay(state.happiness, HAPPINESS_DECAY_PER_MIN, minutes);
  const energy = state.asleep
    ? raise(state.energy, ENERGY_RECOVERY_PER_MIN * minutes)
    : decay(state.energy, ENERGY_DECAY_PER_MIN, minutes);

  const poopMinutes = state.poopMinutes + minutes;
  const poopSpawns = Math.floor(poopMinutes / POOP_INTERVAL_MIN);
  const hasPoop = state.hasPoop || poopSpawns > 0;

  // state.hasPoop here is the INCOMING flag (before this call), not the
  // newly computed hasPoop above. If poop was already sitting there, the
  // whole elapsed gap counts toward uncleanliness. If it spawns fresh
  // partway through a long offline gap, only the minutes since that spawn
  // count — poopMinutes % POOP_INTERVAL_MIN, the same remainder used for
  // the next poopMinutes below.
  const poopUncleanMinutes = state.hasPoop
    ? state.poopUncleanMinutes + minutes
    : poopSpawns > 0
      ? poopMinutes % POOP_INTERVAL_MIN
      : 0;
  const sick = state.sick || poopUncleanMinutes > SICKNESS_THRESHOLD_MIN;

  // decay() clamps at NEED_FLOOR, so decaying twice at the same rate lands
  // on exactly the same result as decaying once at double the rate (both
  // hit the floor at the same point) — this doubles this tick's happiness
  // loss without redeclaring the happiness computed above.
  if (sick) happiness = decay(happiness, HAPPINESS_DECAY_PER_MIN, minutes);

  // Skip grow() entirely while sick, rather than gating its met-check —
  // gating the met-check would reset wellMetSince on the failure path that
  // already exists there, punishing a pet that gets sick near the end of a
  // stage by costing the full streak again. Skipping instead freezes
  // stage/wellMetSince untouched.
  const grown = sick ? state : grow({ ...state, hunger, happiness, energy }, now, prevNow);

  return {
    ...grown,
    hunger,
    happiness,
    energy,
    sick,
    poopUncleanMinutes,
    poopMinutes: poopMinutes % POOP_INTERVAL_MIN,
    hasPoop,
    lastSeen: now,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green (including every pre-existing test — this must not change hunger/energy/poop/growth behavior for a non-sick pet).

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): detect sickness from uncleaned poop, freeze growth while sick"
```

---

### Task 2: `cleanPoop` resets `poopUncleanMinutes`

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`cleanPoop`)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `state.hasPoop`, `state.poopUncleanMinutes`.
- Produces: `cleanPoop(state)` now also resets `poopUncleanMinutes` to `0`, but only on the branch where there was poop to clean — cleaning does not itself clear `sick` (that's `giveMedicine`'s job, Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/simulation.test.js`'s existing `describe('cleanPoop', ...)` block:

```js
  it('resets poopUncleanMinutes when cleaning', () => {
    const dirty = { ...createDefaultPet(0), hasPoop: true, poopUncleanMinutes: 20 };
    expect(cleanPoop(dirty).poopUncleanMinutes).toBe(0);
  });

  it('leaves poopUncleanMinutes untouched when there is nothing to clean', () => {
    const clean = { ...createDefaultPet(0), poopUncleanMinutes: 5 };
    expect(cleanPoop(clean)).toBe(clean);
  });
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t "resets poopUncleanMinutes"`
Expected: FAIL — `poopUncleanMinutes` stays `20` (untouched).

- [ ] **Step 3: Implement**

Change in `lib/tamagotchi/simulation.js`:

```js
export const cleanPoop = (state) =>
  state.hasPoop ? { ...state, hasPoop: false, poopUncleanMinutes: 0 } : state;
```

The existing identity-return test (`cleanPoop(clean)` returns the exact same object reference when there's no poop) still passes: the `false` branch is untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): reset poopUncleanMinutes on cleanup"
```

---

### Task 3: `giveMedicine`

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (add `giveMedicine`, exported)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `state.sick`.
- Produces: `giveMedicine(state) => pet` with `sick: false`; `poopUncleanMinutes` untouched (only a clean resets that). Consumed by `pages/tamagotchi/index.jsx` (Task 5).

- [ ] **Step 1: Write the failing test**

Add `giveMedicine` to the import list, then a new `describe` block in `lib/tamagotchi/simulation.test.js`:

```js
describe('giveMedicine', () => {
  it('clears sick without resetting poopUncleanMinutes', () => {
    const pet = { ...createDefaultPet(0), sick: true, poopUncleanMinutes: 20 };
    const treated = giveMedicine(pet);
    expect(treated.sick).toBe(false);
    expect(treated.poopUncleanMinutes).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t giveMedicine`
Expected: FAIL with "giveMedicine is not defined".

- [ ] **Step 3: Implement**

Add to `lib/tamagotchi/simulation.js`, near the other single-purpose state transitions (e.g. next to `cleanPoop`):

```js
export const giveMedicine = (state) => ({ ...state, sick: false });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): add giveMedicine to clear sickness"
```

---

### Task 4: `medicine` sound cue

**Files:**
- Modify: `lib/tamagotchi/sound.js` (`TONES`)

**Interfaces:**
- Produces: `TONES.medicine`, same shape as the existing entries. Consumed by `index.jsx`'s medicine handler (Task 5), and exercised there through the mocked `createSound` spy (this repo has no dedicated `sound.test.js` — WebAudio synthesis isn't unit-tested directly for any existing tone either; the page tests assert on the `play(name)` call, not on tone data).

- [ ] **Step 1: Implement**

In `lib/tamagotchi/sound.js`, add a new entry to `TONES`:

```js
export const TONES = {
  nom: { freq: 220, type: 'square', ms: 90 },
  play: { freq: 520, type: 'triangle', ms: 80 },
  clean: { freq: 880, type: 'sine', ms: 140 },
  evolve: { freq: 660, type: 'sine', ms: 220 },
  sleep: { freq: 180, type: 'sine', ms: 200 },
  medicine: { freq: 700, type: 'sine', ms: 150 },
};
```

- [ ] **Step 2: Lint**

Run: `npx eslint lib/tamagotchi/sound.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/tamagotchi/sound.js
git commit -m "feat(tamagotchi): add medicine sound cue"
```

---

### Task 5: Medicine button and handler in the page

**Files:**
- Modify: `pages/tamagotchi/index.jsx`
- Test: `__tests__/pages/tamagotchi/index.test.jsx`

**Interfaces:**
- Consumes: `giveMedicine` (Task 3), `TONES.medicine` via the existing `sound.js` `play` API (Task 4), `pet.sick` (Baseline).
- Produces: one new, additive test in `index.test.jsx`. Per spec's Conflict Boundaries, this is the only test this unit adds to that file — no existing test in it is modified.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/pages/tamagotchi/index.test.jsx`, inside `describe('Tamagotchi page', ...)`:

```js
  it('giving medicine clears sick and hides the medicine button, playing a cue', () => {
    seedPet({ sick: true });
    render(<Tamagotchi />);
    const medicineButton = screen.getByRole('button', { name: 'Medicine' });
    fireEvent.click(medicineButton);
    expect(readPet().sick).toBe(false);
    expect(screen.queryByRole('button', { name: 'Medicine' })).not.toBeInTheDocument();
    expect(latestPlaySpy()).toHaveBeenCalledWith('medicine');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx -t medicine`
Expected: FAIL — no button with accessible name "Medicine" exists yet.

- [ ] **Step 3: Implement**

In `pages/tamagotchi/index.jsx`, add `giveMedicine` to the existing `simulation` import list:

```js
import {
  applyElapsed,
  feedPet,
  playWithPet,
  toggleSleep,
  cleanPoop,
  giveMedicine,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
  PET_TAP_AMOUNT,
} from '../../lib/tamagotchi/simulation';
```

Add `handleMedicine` immediately after `handleSleepToggle` (before `toggleSound`):

```js
  const handleSleepToggle = () => commit((prev) => toggleSleep(prev), 'sleep');
  const handleMedicine = () => commit((prev) => giveMedicine(prev), 'medicine');
```

Add the medicine button inside `.palette`, immediately after the Sleep/Wake button, conditionally rendered the same way the existing poop button is:

```jsx
        <button
          type="button"
          className={styles.action}
          aria-pressed={pet.asleep}
          aria-label={pet.asleep ? 'Wake' : 'Sleep'}
          onClick={handleSleepToggle}
        >
          {pet.asleep ? '⏰' : '🌙'}
        </button>
        {pet.sick && (
          <button type="button" className={styles.action} aria-label="Medicine" onClick={handleMedicine}>
            💊
          </button>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi __tests__/pages/tamagotchi`
Expected: PASS, all tests green — including every pre-existing test in `index.test.jsx`, unmodified.

- [ ] **Step 5: Lint**

Run: `npx eslint pages/tamagotchi/index.jsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pages/tamagotchi/index.jsx __tests__/pages/tamagotchi/index.test.jsx
git commit -m "feat(tamagotchi): add medicine button to clear sickness"
```

---

## Self-Review Notes

- **Spec coverage:** every bullet under "Unit B: Sickness" maps to a task — `poopUncleanMinutes`/`sick` detection with the incoming-vs-computed `hasPoop` distinction, doubled happiness decay using the freshly computed `sick`, and the `grow()`-skip (not a met-check gate) are all Task 1; `cleanPoop`'s scoped reset is Task 2; `giveMedicine` is Task 3; the new tone is Task 4; the button/handler and its one additive test are Task 5.
- **Deviation from the spec's literal snippet, and why:** the spec's own pseudocode for the `grow()` call site reused the plain `happiness` name (`grow({ ...state, hunger, happiness, energy, sleepMinutes }, ...)`) without accounting for the fact that variable, as originally computed, does not yet reflect the doubled decay — using it as-is would silently skip the sickness happiness penalty entirely. This plan fixes that by changing the `happiness` declaration to `let` and reassigning it in place once `sick` is known (see Task 1's comment on why decaying twice at the same rate is exactly equivalent to decaying once at double the rate), so no rename or new variable name leaks into the return statement or call site.
- **Type/name consistency check:** `giveMedicine` (Task 3) is imported and called with the same one-argument signature in `index.jsx` (Task 5). `TONES.medicine` (Task 4) is referenced by the exact string `'medicine'` passed to `commit(..., 'medicine')` in Task 5's handler.
- **Conflict boundaries respected:** this plan never touches `creatures.js` (only reads `pet.sick`, which Baseline already provides), never touches evolution or minigame logic, and touches `index.test.jsx` with exactly one new test, matching the spec's Conflict Boundaries section.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-tamagotchi-unit-b-sickness.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
