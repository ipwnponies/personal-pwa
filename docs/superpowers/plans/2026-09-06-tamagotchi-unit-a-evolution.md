# Tamagotchi Unit A: Evolution + Sprite Reshape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the tamagotchi a branching adult form (`balanced`/`fedHeavy`/`playHeavy`/`sleepHeavy`/`efficient`) decided by how the player cared for it, and reshape sprite lookup to support that plus a `sick` mood at every stage.

**Architecture:** Pure-function tally logic added to `lib/tamagotchi/simulation.js` (care-action counters, sleep-minutes accumulation, a `determineAdultForm` classifier wired into the existing `grow()` stage transition). `lib/tamagotchi/creatures.js` reshaped so adult sprites are keyed by form, plus a `getSprite` lookup with safe fallbacks and a `sick` mood everywhere. `pages/tamagotchi/index.jsx` switched over to `getSprite` and given a small evolve sound cue.

**Tech Stack:** Vanilla JS (no TypeScript), Vitest + jsdom for unit tests, React 18 function components.

**Spec:** `docs/superpowers/specs/2026-09-05-tamagotchi-game-design.md` (see "Unit A: Evolution + Sprite Reshape" and "Conflict Boundaries")

## Global Constraints

- This is Unit A only. Units B (Sickness) and C (Minigame) are being implemented independently, in separate sessions/branches, from the same spec — do not wait for them, do not attempt to coordinate with them beyond what "Conflict Boundaries" in the spec describes.
- Baseline is already committed and is not this plan's job: `createDefaultPet`'s six new fields (`feedCount`, `playCount`, `sleepMinutes`, `adultForm`, `sick`, `poopUncleanMinutes`), `loadPet`'s additive-default spread, and the tuning constants below all already exist in `lib/tamagotchi/simulation.js` and `lib/tamagotchi/storage.js`. Read them, don't recreate them.
- Tuning constants (already defined in `simulation.js`, use verbatim, do not redefine): `EFFICIENT_THRESHOLD = 6`, `DOMINANCE_THRESHOLD = 0.5`, `SLEEP_MINUTES_PER_TALLY_UNIT = 5`.
- No death, no permanent stat loss, no failure states of any kind (spec Non-goals).
- No real pixel-art assets — sprites stay emoji-placeholder strings; don't change the shape of what `getSprite` returns (a single displayable value) so swapping in image assets later doesn't require touching call sites.
- No changes to `lib/aquarium/*` or `pages/aquarium/*`.
- Per spec's Conflict Boundaries: this unit does **not** modify `__tests__/pages/tamagotchi/index.test.jsx` at all. Verify the `index.jsx` changes by running the existing test suite (regression only) and manual verification — do not add new tests to that file.
- Airbnb ESLint config is active (`.eslintrc.yml`) — React components must be function declarations, not arrow functions (`react/function-component-definition`). Run `npx eslint <changed files>` before each commit.

---

### Task 1: Care-action tallies on feed/play

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`feedPet`, `playWithPet`)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `state.feedCount`, `state.playCount` (Baseline fields on every pet, default `0`).
- Produces: `feedPet(state, amount?)` now also returns `feedCount: state.feedCount + 1`. `playWithPet(state, amount?)` now also returns `playCount: state.playCount + 1`. Later tasks (`determineAdultForm`) read these two fields.

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/simulation.test.js`, inside the existing `describe('feedPet', ...)` and `describe('playWithPet', ...)` blocks:

```js
describe('feedPet', () => {
  it('raises hunger without exceeding NEED_MAX', () => {
    const pet = { ...createDefaultPet(0), hunger: NEED_MAX - 10 };
    expect(feedPet(pet).hunger).toBe(NEED_MAX);
    expect(feedPet({ ...pet, hunger: 0 }, FEED_AMOUNT).hunger).toBe(FEED_AMOUNT);
  });

  it('increments feedCount', () => {
    const pet = createDefaultPet(0);
    expect(feedPet(pet).feedCount).toBe(1);
    expect(feedPet(feedPet(pet)).feedCount).toBe(2);
  });
});

describe('playWithPet', () => {
  it('raises happiness and spends energy', () => {
    const pet = { ...createDefaultPet(0), happiness: 0, energy: NEED_MAX };
    const played = playWithPet(pet);
    expect(played.happiness).toBe(PLAY_AMOUNT);
    expect(played.energy).toBe(NEED_MAX - PLAY_ENERGY_COST);
  });

  it('does not drop energy below NEED_FLOOR', () => {
    const pet = { ...createDefaultPet(0), energy: 2 };
    expect(playWithPet(pet).energy).toBe(NEED_FLOOR);
  });

  it('increments playCount', () => {
    const pet = createDefaultPet(0);
    expect(playWithPet(pet).playCount).toBe(1);
    expect(playWithPet(playWithPet(pet)).playCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: FAIL — `feedPet(pet).feedCount` is `undefined`, `playWithPet(pet).playCount` is `undefined`.

- [ ] **Step 3: Implement**

In `lib/tamagotchi/simulation.js`, change:

```js
export const feedPet = (state, amount = FEED_AMOUNT) => ({
  ...state,
  hunger: raise(state.hunger, amount),
  feedCount: state.feedCount + 1,
});

export const playWithPet = (state, amount = PLAY_AMOUNT) => ({
  ...state,
  happiness: raise(state.happiness, amount),
  energy: clamp(state.energy - PLAY_ENERGY_COST, NEED_FLOOR, NEED_MAX),
  playCount: state.playCount + 1,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): tally feed/play actions for evolution"
```

---

### Task 2: Accumulate sleep minutes in `applyElapsed`

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`applyElapsed`)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `state.sleepMinutes`, `state.asleep` (Baseline fields).
- Produces: a `sleepMinutes` local computed the same way `hunger`/`happiness`/`energy` already are, threaded into the object passed to `grow()`, and present on the returned pet (via the existing `...grown` spread — `grow()` currently passes every non-stage field through unchanged). Later tasks (`determineAdultForm`, `grow()` wiring) read `pet.sleepMinutes`.

- [ ] **Step 1: Write the failing test**

Add to `lib/tamagotchi/simulation.test.js`, inside `describe('applyElapsed', ...)`:

```js
  it('accumulates sleepMinutes only while asleep', () => {
    const awake = createDefaultPet(0);
    const awakeNext = applyElapsed(awake, 5 * 60e3, 5 * 60e3);
    expect(awakeNext.sleepMinutes).toBe(0);

    const asleep = { ...createDefaultPet(0), asleep: true };
    const asleepNext = applyElapsed(asleep, 5 * 60e3, 5 * 60e3);
    expect(asleepNext.sleepMinutes).toBe(5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t "accumulates sleepMinutes"`
Expected: FAIL — `sleepMinutes` is `undefined` (field never computed, `...grown` currently passes through the stale `0` from the incoming pet, and the awake case would also read `undefined`).

- [ ] **Step 3: Implement**

In `lib/tamagotchi/simulation.js`'s `applyElapsed`, add a `sleepMinutes` local right after the existing `energy` computation, before the `poopMinutes` block:

```js
  const energy = state.asleep
    ? raise(state.energy, ENERGY_RECOVERY_PER_MIN * minutes)
    : decay(state.energy, ENERGY_DECAY_PER_MIN, minutes);

  const sleepMinutes = state.asleep ? state.sleepMinutes + minutes : state.sleepMinutes;

  const poopMinutes = state.poopMinutes + minutes;
```

Then include it in the object passed to `grow()`:

```js
  const grown = grow({ ...state, hunger, happiness, energy, sleepMinutes }, now, prevNow);
```

Do not change the function's final `return` statement — `grow()` spreads every field of the object it's given through unchanged except `stage`/`wellMetSince` (and, from Task 4, `adultForm`), so `sleepMinutes` reaches the return via the existing `...grown`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green (including the pre-existing ones — this must not change hunger/happiness/energy/poop/growth behavior).

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): accumulate minutes asleep for evolution tally"
```

---

### Task 3: `determineAdultForm` classifier

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (add `determineAdultForm`, exported)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `pet.feedCount`, `pet.playCount`, `pet.sleepMinutes`; constants `EFFICIENT_THRESHOLD`, `DOMINANCE_THRESHOLD`, `SLEEP_MINUTES_PER_TALLY_UNIT` (all already defined in this file).
- Produces: `determineAdultForm(pet) => 'efficient' | 'fedHeavy' | 'playHeavy' | 'sleepHeavy' | 'balanced'`. Consumed by Task 4's `grow()` wiring.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `lib/tamagotchi/simulation.test.js` (add `determineAdultForm` to the existing import list from `./simulation`):

```js
describe('determineAdultForm', () => {
  const pet = (feedCount, playCount, sleepMinutes) => ({ feedCount, playCount, sleepMinutes });

  it('is efficient when total care actions are below the threshold', () => {
    expect(determineAdultForm(pet(2, 1, 0))).toBe('efficient');
  });

  it('is fedHeavy when feeding dominates', () => {
    expect(determineAdultForm(pet(5, 1, 0))).toBe('fedHeavy');
  });

  it('is playHeavy when playing dominates', () => {
    expect(determineAdultForm(pet(1, 5, 0))).toBe('playHeavy');
  });

  it('is sleepHeavy when sleep minutes dominate', () => {
    // sleepMinutes 25 / SLEEP_MINUTES_PER_TALLY_UNIT (5) = 5 tally units
    expect(determineAdultForm(pet(1, 1, 25))).toBe('sleepHeavy');
  });

  it('is balanced when no single tally dominates', () => {
    // feedCount 2, playCount 2, sleepMinutes 10 -> sleep tally 2; total 6, each third
    expect(determineAdultForm(pet(2, 2, 10))).toBe('balanced');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t determineAdultForm`
Expected: FAIL with "determineAdultForm is not defined" (or `undefined` return values).

- [ ] **Step 3: Implement**

In `lib/tamagotchi/simulation.js`, add this above `grow` (so `grow` can call it in Task 4):

```js
// Classifies which adult form the child->adult transition should produce,
// based on the accumulated feed/play/sleep tally. Checked in feed > play >
// sleep order, which is also the tie-break: this only matters once
// DOMINANCE_THRESHOLD is tuned below 0.5 (at 0.5, two fractions can't both
// exceed it, since all three fractions sum to 1).
export const determineAdultForm = (pet) => {
  const sleepTallyUnits = Math.floor(pet.sleepMinutes / SLEEP_MINUTES_PER_TALLY_UNIT);
  const total = pet.feedCount + pet.playCount + sleepTallyUnits;
  if (total < EFFICIENT_THRESHOLD) return 'efficient';

  const feedFrac = pet.feedCount / total;
  const playFrac = pet.playCount / total;
  const sleepFrac = sleepTallyUnits / total;

  if (feedFrac > DOMINANCE_THRESHOLD) return 'fedHeavy';
  if (playFrac > DOMINANCE_THRESHOLD) return 'playHeavy';
  if (sleepFrac > DOMINANCE_THRESHOLD) return 'sleepHeavy';
  return 'balanced';
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): classify adult form from care tally"
```

---

### Task 4: Wire `adultForm` into `grow()`'s child→adult transition

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`grow`)
- Test: `lib/tamagotchi/simulation.test.js`

**Interfaces:**
- Consumes: `determineAdultForm(pet)` (Task 3).
- Produces: `grow()`'s returned pet gains `adultForm` set to `determineAdultForm(pet)` only on the transition where `NEXT_STAGE[pet.stage] === 'adult'`; on the baby→child transition (and on the no-growth paths), `adultForm` passes through unchanged (stays `null` until the pet reaches adulthood, per Baseline default).

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/simulation.test.js`'s `describe('applyElapsed', ...)` block (this exercises `grow()` through the public `applyElapsed` entry point, same as the existing growth tests):

```js
  it('sets adultForm on the child->adult transition', () => {
    const pet = { ...createDefaultPet(0), stage: 'child', feedCount: 5, playCount: 1, sleepMinutes: 0 };
    const duration = STAGE_DURATIONS_MS.child;
    const next = applyElapsed(pet, duration, duration);
    expect(next.stage).toBe('adult');
    expect(next.adultForm).toBe('fedHeavy');
  });

  it('does not set adultForm on the baby->child transition', () => {
    const pet = createDefaultPet(0);
    const duration = STAGE_DURATIONS_MS.baby;
    const next = applyElapsed(pet, duration, duration);
    expect(next.stage).toBe('child');
    expect(next.adultForm).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `npx vitest run lib/tamagotchi/simulation.test.js -t "adultForm"`
Expected: FAIL on the child->adult case — `next.adultForm` is `null` (unchanged), not `'fedHeavy'`. The baby->child case already passes today (nothing sets `adultForm` yet) — that's fine, it's a regression guard for the next step.

- [ ] **Step 3: Implement**

In `lib/tamagotchi/simulation.js`, change `grow`:

```js
const grow = (pet, now, prevNow) => {
  const met = pet.hunger >= MET_THRESHOLD && pet.happiness >= MET_THRESHOLD;
  if (!met) return { ...pet, wellMetSince: null };
  const wellMetSince = pet.wellMetSince ?? prevNow;
  const duration = STAGE_DURATIONS_MS[pet.stage];
  if (duration != null && now - wellMetSince >= duration) {
    const nextStage = NEXT_STAGE[pet.stage];
    const adultForm = nextStage === 'adult' ? determineAdultForm(pet) : pet.adultForm;
    return { ...pet, stage: nextStage, wellMetSince: now, adultForm };
  }
  return { ...pet, wellMetSince };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): set adultForm when a pet reaches adulthood"
```

---

### Task 5: Reshape adult sprites into forms, add `sick` mood at every stage

**Files:**
- Modify: `lib/tamagotchi/creatures.js` (`PETS.blob.sprite`)
- Test: `lib/tamagotchi/creatures.test.js`

**Interfaces:**
- Produces: `PETS.blob.sprite.adult` becomes `{ balanced, fedHeavy, playHeavy, sleepHeavy, efficient }`, each a full `{ normal, hungry, sad, asleep, sick }` mood map. `PETS.blob.sprite.baby` and `.child` each gain a `sick` key. Consumed by Task 6 (`getSprite`).

- [ ] **Step 1: Write the failing test**

Add to `lib/tamagotchi/creatures.test.js`:

```js
describe('PETS.blob.sprite shape', () => {
  const moods = ['normal', 'hungry', 'sad', 'asleep', 'sick'];
  const forms = ['balanced', 'fedHeavy', 'playHeavy', 'sleepHeavy', 'efficient'];

  it('has every mood key at the baby and child stages', () => {
    moods.forEach((mood) => {
      expect(PETS.blob.sprite.baby[mood]).toBeDefined();
      expect(PETS.blob.sprite.child[mood]).toBeDefined();
    });
  });

  it('has every form, each with every mood key, at the adult stage', () => {
    forms.forEach((form) => {
      expect(PETS.blob.sprite.adult[form]).toBeDefined();
      moods.forEach((mood) => {
        expect(PETS.blob.sprite.adult[form][mood]).toBeDefined();
      });
    });
  });
});
```

Add `PETS` to the existing import line at the top of the file: `import { getPetType, spriteMood, petKeys, DEFAULT_PET, PETS } from './creatures';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/creatures.test.js -t "sprite shape"`
Expected: FAIL — `PETS.blob.sprite.baby.sick` is `undefined`, `PETS.blob.sprite.adult.balanced` is `undefined` (adult is currently a flat mood map, not form-keyed).

- [ ] **Step 3: Implement**

Replace `PETS` in `lib/tamagotchi/creatures.js`:

```js
export const PETS = {
  blob: {
    key: 'blob',
    name: 'Blob',
    sprite: {
      baby: { normal: '🥚', hungry: '🥚', sad: '🥚', asleep: '🥚', sick: '🥚' },
      child: { normal: '🐣', hungry: '🐣', sad: '🐣', asleep: '💤', sick: '🐣' },
      adult: {
        balanced: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        fedHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        playHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        sleepHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        efficient: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
      },
    },
  },
};
```

(All five forms share the same placeholder emoji for now — real per-form art is future work per the spec's Non-goals. `sick` reuses each stage's existing `sad` emoji, per spec.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git commit -m "feat(tamagotchi): reshape adult sprites into forms, add sick mood"
```

---

### Task 6: `getSprite` lookup with fallbacks

**Files:**
- Modify: `lib/tamagotchi/creatures.js` (add `getSprite`, exported)
- Test: `lib/tamagotchi/creatures.test.js`

**Interfaces:**
- Consumes: `PETS` shape from Task 5.
- Produces: `getSprite(petType, stage, adultForm, mood) => string`. `adultForm` falls back to `'balanced'` when null/unrecognized; `mood` falls back to `'normal'` when missing from the resolved stage's table. Consumed by `pages/tamagotchi/index.jsx` (Task 8).

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/creatures.test.js` (add `getSprite` to the import line):

```js
describe('getSprite', () => {
  const blob = getPetType('blob');

  it('looks up baby/child sprites directly by mood', () => {
    expect(getSprite(blob, 'baby', null, 'normal')).toBe('🥚');
    expect(getSprite(blob, 'child', null, 'asleep')).toBe('💤');
  });

  it('looks up adult sprites by form and mood', () => {
    expect(getSprite(blob, 'adult', 'fedHeavy', 'normal')).toBe('🐥');
  });

  it('falls back to balanced for a null or unrecognized adult form', () => {
    expect(getSprite(blob, 'adult', null, 'normal')).toBe(PETS.blob.sprite.adult.balanced.normal);
    expect(getSprite(blob, 'adult', 'nonexistent', 'normal')).toBe(PETS.blob.sprite.adult.balanced.normal);
  });

  it('falls back to normal for an unrecognized mood', () => {
    expect(getSprite(blob, 'baby', null, 'nonexistent')).toBe(PETS.blob.sprite.baby.normal);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/creatures.test.js -t getSprite`
Expected: FAIL with "getSprite is not defined".

- [ ] **Step 3: Implement**

Add to `lib/tamagotchi/creatures.js`:

```js
// Sprite lookup, form/mood fallback-safe. Kept string-in/string-out so a
// later swap to image assets only changes the values stored here, not any
// call site.
export const getSprite = (petType, stage, adultForm, mood) => {
  const stageSprites =
    stage === 'adult'
      ? petType.sprite.adult[adultForm] || petType.sprite.adult.balanced
      : petType.sprite[stage];
  return stageSprites[mood] || stageSprites.normal;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git commit -m "feat(tamagotchi): add getSprite lookup with form/mood fallbacks"
```

---

### Task 7: `spriteMood` gains a `sick` check

**Files:**
- Modify: `lib/tamagotchi/creatures.js` (`spriteMood`)
- Test: `lib/tamagotchi/creatures.test.js`

**Interfaces:**
- Consumes: `pet.sick` (Baseline field, default `false`).
- Produces: `spriteMood` can now return `'sick'`, checked after `asleep` and before `hungry`/`sad`.

- [ ] **Step 1: Write the failing test**

Add to `lib/tamagotchi/creatures.test.js`'s `describe('spriteMood', ...)` block:

```js
  it('is sick when the pet is sick, taking priority over hungry/sad but not asleep', () => {
    expect(spriteMood({ ...base, sick: true, hunger: 0 }, 60)).toBe('sick');
    expect(spriteMood({ ...base, sick: true, asleep: true }, 60)).toBe('asleep');
  });
```

Also add `sick: false` to the block's `base` fixture:

```js
  const base = { hunger: 100, happiness: 100, asleep: false, sick: false };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/creatures.test.js -t "is sick"`
Expected: FAIL — `spriteMood` returns `'hungry'` instead of `'sick'` for the first assertion (no sick check exists yet).

- [ ] **Step 3: Implement**

In `lib/tamagotchi/creatures.js`, change `spriteMood`:

```js
export const spriteMood = (pet, metThreshold) => {
  if (pet.asleep) return 'asleep';
  if (pet.sick) return 'sick';
  if (pet.hunger < metThreshold) return 'hungry';
  if (pet.happiness < metThreshold) return 'sad';
  return 'normal';
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git commit -m "feat(tamagotchi): show sick mood ahead of hungry/sad"
```

---

### Task 8: Wire `getSprite` and an evolve cue into the page

**Files:**
- Modify: `pages/tamagotchi/index.jsx`

**Interfaces:**
- Consumes: `getSprite` (Task 6), `pet.adultForm`/`pet.stage`/`pet.sick` (Baseline + Tasks 4/7).
- Produces: no new exports — this task only rewires an existing page. Per spec's Conflict Boundaries, this unit does **not** add or modify anything in `__tests__/pages/tamagotchi/index.test.jsx`; verify with the existing suite (regression) plus manual check.

- [ ] **Step 1: Update the import and sprite-lookup line**

In `pages/tamagotchi/index.jsx`, change:

```js
import { getPetType, spriteMood } from '../../lib/tamagotchi/creatures';
```

to:

```js
import { getPetType, spriteMood, getSprite } from '../../lib/tamagotchi/creatures';
```

and change:

```js
const sprite = petType.sprite[pet.stage][mood];
```

to:

```js
const sprite = getSprite(petType, pet.stage, pet.adultForm, mood);
```

- [ ] **Step 2: Run the full test suite to confirm no regression**

Run: `npx vitest run lib/tamagotchi __tests__/pages/tamagotchi`
Expected: PASS, same tests as before this task (this is a straight swap — `getSprite` on a `baby`/`child` stage with any mood resolves identically to the old direct indexing).

- [ ] **Step 3: Add the evolve-cue effect**

Add a ref to track the previous stage, and a new `useEffect` keyed on the pet's stage, placed among the other hooks (before the `if (!pet) return ...` early return) so it runs unconditionally on every render per React's rules of hooks:

```js
  const prevStageRef = useRef(null);

  // Plays the existing 'evolve' cue the moment the pet reaches adulthood.
  // Guards on pet being loaded since this hook runs before the early
  // return below, on every render including the first (pet === null).
  useEffect(() => {
    if (!pet) return;
    if (prevStageRef.current && prevStageRef.current !== 'adult' && pet.stage === 'adult') {
      if (soundRef.current) soundRef.current.play('evolve');
    }
    prevStageRef.current = pet.stage;
  }, [pet]);
```

Place this block directly after the existing "Persist + slow decay tick while mounted" `useEffect` and before the `commit` callback.

- [ ] **Step 4: Run the full test suite again**

Run: `npx vitest run lib/tamagotchi __tests__/pages/tamagotchi`
Expected: PASS — the new effect doesn't fire in any existing test (none of them grow a pet all the way to `adult`), so this is a no-op regression check.

- [ ] **Step 5: Lint**

Run: `npx eslint pages/tamagotchi/index.jsx`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `/tamagotchi` in a browser.
- Confirm the pet still renders and all existing buttons (Feed/Play/Sleep/mute) still work — this is the regression check automated tests can't fully cover (visual sprite rendering).
- Optional but useful: temporarily lower `STAGE_DURATIONS_MS` in `simulation.js` in a scratch copy (do not commit) to confirm a pet reaching `adult` shows a sprite and plays the evolve cue, then revert.

- [ ] **Step 7: Commit**

```bash
git add pages/tamagotchi/index.jsx
git commit -m "feat(tamagotchi): use getSprite and play an evolve cue on growth"
```

---

## Self-Review Notes

- **Spec coverage:** every bullet under "Unit A: Evolution + Sprite Reshape" in the spec maps to a task above — care tallies (Task 1), sleep accumulation + grow() call-site wiring (Task 2), `determineAdultForm` incl. tie-break ordering (Task 3), `grow()` wiring restricted to the child→adult transition (Task 4), sprite reshape + `sick` mood at every stage (Task 5), `getSprite` with both fallbacks (Task 6), `spriteMood`'s `sick` check ordered correctly (Task 7), and the `index.jsx` sprite-lookup swap + evolve-cue effect (Task 8).
- **Tie-break gap, intentional:** the spec itself notes the feed>play>sleep tie-break is unreachable at the current `DOMINANCE_THRESHOLD` of `0.5` (three fractions summing to 1 can't have two exceed 0.5 simultaneously). Task 3's implementation encodes the tie-break structurally (checked in that exact order), but no test exercises it directly, matching the spec's own "known limitation, not a merge blocker" framing — not a coverage gap to fix now.
- **Conflict boundaries respected:** this plan never touches `__tests__/pages/tamagotchi/index.test.jsx` (Task 8 is verify-only there), never touches `sound.js` (the evolve tone already exists, only its call site is new), and never touches anything sickness- or minigame-specific.
- **Type/name consistency check:** `determineAdultForm` (Task 3) is called by `grow()` (Task 4) with the exact name and one-argument signature defined in Task 3. `getSprite` (Task 6) is called from `index.jsx` (Task 8) with the same four-argument order (`petType, stage, adultForm, mood`) it's defined with in Task 6. `PETS.blob.sprite.adult.balanced` (Task 5's fallback target) matches the key `getSprite` falls back to (Task 6).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-tamagotchi-unit-a-evolution.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
