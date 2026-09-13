# Tamagotchi Species Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the tamagotchi three player-chosen species, each with its own adult-form branch set, chosen when a pet is created and fixed for that pet's life.

**Architecture:** The care tally in `lib/tamagotchi/simulation.js` keeps producing a species-independent *verdict* (`balanced`/`fedHeavy`/`playHeavy`/`sleepHeavy`/`efficient`); `lib/tamagotchi/creatures.js` maps that verdict onto the species' own *form* key. `lib/tamagotchi/storage.js`'s `loadPet` stops fabricating a default pet and returns `null` when there is no save, which lets `pages/tamagotchi/index.jsx` run a three-state machine (loading / choosing / playing) with a new `components/tamagotchi/SpeciesChooser.jsx` in the choosing state.

**Tech Stack:** Vanilla JS (no TypeScript), React 18 function components, Vitest + jsdom, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-09-12-tamagotchi-species-variety-design.md`

## Global Constraints

- No new dependencies. Do not touch `package.json` or `package-lock.json`.
- `SCHEMA_VERSION` stays `1`. No migration code, no save-format rewrite.
- `pet.petType` keeps its name. Do not rename it to `species`.
- Sprites stay emoji placeholder strings. `getSprite` keeps returning a single displayable value so image assets can be swapped in later without touching call sites.
- No death, no permanent stat loss, no failure states. The restart control in Task 6 is the only destructive action and is player-initiated and confirmed.
- No changes to `lib/aquarium/*` or `pages/aquarium/*`.
- Airbnb ESLint config is active (`.eslintrc.yml`). React components must be function declarations, not arrow functions (`react/function-component-definition`). Run `npx eslint <changed files>` before each commit.
- Run tests with `npx vitest run <path>`. The whole suite is `npm test`.
- `node_modules` may be absent in a fresh checkout. Run `npm ci` before Task 1. Without it `npx` fetches an unpinned ESLint that rejects `.eslintrc.yml` outright. `npm ci` installs from the committed lockfile and changes no manifest.

---

### Task 1: Verdict-to-form mapping in `creatures.js`

**Files:**
- Modify: `lib/tamagotchi/creatures.js`
- Test: `lib/tamagotchi/creatures.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveForm(petType, verdict) => string` (a form key). Every `PETS` entry gains `defaultForm` (a string) and `forms` (a map from all five verdict names to that species' form keys). `getSprite`'s adult fallback becomes `petType.sprite.adult[petType.defaultForm]`. Consumed by Task 2 (new species declare the same two fields) and Task 3 (`grow()` calls `resolveForm`).

- [ ] **Step 1: Write the failing test**

Add to `lib/tamagotchi/creatures.test.js`. Add `resolveForm` to the existing import on line 2, then append this describe block:

```js
describe('resolveForm', () => {
  const blob = getPetType('blob');

  it('maps a verdict to that species form key', () => {
    expect(resolveForm(blob, 'fedHeavy')).toBe('fedHeavy');
    expect(resolveForm(blob, 'balanced')).toBe('balanced');
  });

  it('falls back to the species defaultForm for an unrecognized verdict', () => {
    expect(resolveForm(blob, 'nonexistent')).toBe(blob.defaultForm);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: FAIL with `resolveForm is not a function` (or an import error naming `resolveForm`).

- [ ] **Step 3: Write minimal implementation**

In `lib/tamagotchi/creatures.js`, add `defaultForm` and `forms` to the `blob` entry, immediately after its `name` line and before `sprite`:

```js
    defaultForm: 'balanced',
    // Blob's form keys are deliberately identical to the five verdict names.
    // That identity is what lets every save written before species variety
    // resolve its stored adultForm with no migration.
    forms: {
      balanced: 'balanced',
      fedHeavy: 'fedHeavy',
      playHeavy: 'playHeavy',
      sleepHeavy: 'sleepHeavy',
      efficient: 'efficient',
    },
```

Then add the new export after `getPetType`:

```js
// A verdict is what the care tally concluded (species-independent, computed in
// simulation.js). A form is what this species calls that outcome. A species
// with fewer forms than verdicts maps several verdicts onto one form.
export const resolveForm = (petType, verdict) => petType.forms[verdict] || petType.defaultForm;
```

And change `getSprite`'s adult fallback from the literal `balanced` to the species' own default:

```js
export const getSprite = (petType, stage, adultForm, mood) => {
  const stageSprites =
    stage === 'adult'
      ? petType.sprite.adult[adultForm] || petType.sprite.adult[petType.defaultForm]
      : petType.sprite[stage];
  return stageSprites[mood] || stageSprites.normal;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: PASS, including the pre-existing "falls back to balanced for a null or unrecognized adult form" test — blob's `defaultForm` is `'balanced'`, so that assertion still holds.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git add lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git commit -m "feat(tamagotchi): map care verdicts onto per-species form keys"
```

---

### Task 2: Add the Sprout and Ember species

**Files:**
- Modify: `lib/tamagotchi/creatures.js`
- Test: `lib/tamagotchi/creatures.test.js:45-64` (replace the blob-only shape block)

**Interfaces:**
- Consumes: `resolveForm`, `defaultForm`, `forms` from Task 1.
- Produces: `PETS.sprout` and `PETS.ember`, so `petKeys()` returns `['blob', 'sprout', 'ember']`. Consumed by Task 5's chooser, which renders one tap target per key.

- [ ] **Step 1: Write the failing test**

In `lib/tamagotchi/creatures.test.js`, replace the entire `describe('PETS.blob.sprite shape', ...)` block (lines 45-64) with a roster-wide completeness check, and add the mapping tests. `petKeys` is already imported on line 2:

```js
describe('every species sprite table', () => {
  const moods = ['normal', 'hungry', 'sad', 'asleep', 'sick'];
  const verdicts = ['balanced', 'fedHeavy', 'playHeavy', 'sleepHeavy', 'efficient'];

  petKeys().forEach((key) => {
    describe(key, () => {
      const petType = PETS[key];

      it('has every mood key at the baby and child stages', () => {
        moods.forEach((mood) => {
          expect(petType.sprite.baby[mood]).toBeDefined();
          expect(petType.sprite.child[mood]).toBeDefined();
        });
      });

      it('maps every verdict to a declared form', () => {
        verdicts.forEach((verdict) => {
          expect(petType.forms[verdict]).toBeDefined();
        });
      });

      it('has a sprite table with every mood key for every declared form', () => {
        Object.values(petType.forms).forEach((form) => {
          expect(petType.sprite.adult[form]).toBeDefined();
          moods.forEach((mood) => {
            expect(petType.sprite.adult[form][mood]).toBeDefined();
          });
        });
      });

      it('has a defaultForm that exists in its adult sprite table', () => {
        expect(petType.sprite.adult[petType.defaultForm]).toBeDefined();
      });
    });
  });
});

describe('species branch sets', () => {
  it('gives sprout one form shared by the sleepHeavy and efficient verdicts', () => {
    const sprout = getPetType('sprout');
    expect(resolveForm(sprout, 'sleepHeavy')).toBe('evergreen');
    expect(resolveForm(sprout, 'efficient')).toBe('evergreen');
    expect(resolveForm(sprout, 'fedHeavy')).toBe('fruit');
  });

  it('gives ember three forms covering all five verdicts', () => {
    const ember = getPetType('ember');
    expect(new Set(Object.values(ember.forms)).size).toBe(3);
    expect(resolveForm(ember, 'balanced')).toBe('hearth');
    expect(resolveForm(ember, 'efficient')).toBe('hearth');
    expect(resolveForm(ember, 'playHeavy')).toBe('wildfire');
    expect(resolveForm(ember, 'sleepHeavy')).toBe('wildfire');
    expect(resolveForm(ember, 'fedHeavy')).toBe('forge');
  });

  it('falls back to each species own defaultForm, not to balanced', () => {
    // Blob's defaultForm IS 'balanced', so only a species without a balanced
    // form can catch a regression in getSprite's adult fallback.
    expect(getSprite(getPetType('ember'), 'adult', null, 'normal')).toBe('🏮');
    expect(getSprite(getPetType('sprout'), 'adult', 'nonexistent', 'normal')).toBe('🌸');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: FAIL — `getPetType('sprout')` falls back to blob, so `resolveForm(sprout, 'sleepHeavy')` returns `'sleepHeavy'`, not `'evergreen'`.

- [ ] **Step 3: Write minimal implementation**

In `lib/tamagotchi/creatures.js`, add both species to `PETS` after the `blob` entry:

```js
  sprout: {
    key: 'sprout',
    name: 'Sprout',
    defaultForm: 'bloom',
    forms: {
      balanced: 'bloom',
      fedHeavy: 'fruit',
      playHeavy: 'vine',
      sleepHeavy: 'evergreen',
      efficient: 'evergreen',
    },
    sprite: {
      baby: { normal: '🌰', hungry: '🌰', sad: '🌰', asleep: '🌰', sick: '🌰' },
      child: { normal: '🌱', hungry: '🌱', sad: '🥀', asleep: '💤', sick: '🥀' },
      adult: {
        bloom: { normal: '🌸', hungry: '🌷', sad: '🥀', asleep: '💤', sick: '🥀' },
        fruit: { normal: '🍑', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
        vine: { normal: '🍃', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
        evergreen: { normal: '🌲', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
      },
    },
  },
  ember: {
    key: 'ember',
    name: 'Ember',
    defaultForm: 'hearth',
    forms: {
      balanced: 'hearth',
      fedHeavy: 'forge',
      playHeavy: 'wildfire',
      sleepHeavy: 'wildfire',
      efficient: 'hearth',
    },
    sprite: {
      baby: { normal: '🕯️', hungry: '🕯️', sad: '🕯️', asleep: '🕯️', sick: '🕯️' },
      child: { normal: '🔥', hungry: '🔥', sad: '💨', asleep: '💤', sick: '💨' },
      adult: {
        hearth: { normal: '🏮', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
        forge: { normal: '⚒️', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
        wildfire: { normal: '🌋', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
      },
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/creatures.test.js`
Expected: PASS, with the completeness block now running once per species.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git add lib/tamagotchi/creatures.js lib/tamagotchi/creatures.test.js
git commit -m "feat(tamagotchi): add sprout and ember species with their own branch sets"
```

---

### Task 3: Species-aware evolution in `simulation.js`

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`determineAdultForm`, `grow`, the `creatures` import on line 2)
- Test: `lib/tamagotchi/simulation.test.js` (the import list, and the `describe('determineAdultForm', ...)` block at lines 284-308)

**Interfaces:**
- Consumes: `resolveForm` and `getPetType` from `./creatures` (Task 1).
- Produces: `careVerdict(pet) => string` (a verdict), replacing the export named `determineAdultForm`. `grow()` now writes a species form key into `pet.adultForm`. No other module imports `determineAdultForm` — only `simulation.js` and its test reference it.

- [ ] **Step 1: Write the failing test**

In `lib/tamagotchi/simulation.test.js`, rename `determineAdultForm` to `careVerdict` in the import list (line 10) and rewrite the describe block at lines 284-308:

```js
describe('careVerdict', () => {
  const pet = (feedCount, playCount, sleepMinutes) => ({ feedCount, playCount, sleepMinutes });

  it('is efficient when total care actions are below the threshold', () => {
    expect(careVerdict(pet(2, 1, 0))).toBe('efficient');
  });

  it('is fedHeavy when feeding dominates', () => {
    expect(careVerdict(pet(5, 1, 0))).toBe('fedHeavy');
  });

  it('is playHeavy when playing dominates', () => {
    expect(careVerdict(pet(1, 5, 0))).toBe('playHeavy');
  });

  it('is sleepHeavy when sleep minutes dominate', () => {
    // sleepMinutes 25 / SLEEP_MINUTES_PER_TALLY_UNIT (5) = 5 tally units
    expect(careVerdict(pet(1, 1, 25))).toBe('sleepHeavy');
  });

  it('is balanced when no single tally dominates', () => {
    // feedCount 2, playCount 2, sleepMinutes 10 -> sleep tally 2; total 6, each third
    expect(careVerdict(pet(2, 2, 10))).toBe('balanced');
  });
});
```

Then add a species-branch test to the existing `applyElapsed` growth describe block, directly after the existing `'sets adultForm on the child->adult transition'` test (line 188). It reuses that test's setup shape:

```js
  it('resolves the adult form through the species branch set', () => {
    const childStartTime = 0;
    const grownAt = childStartTime + STAGE_DURATIONS_MS.child;
    const elapsed = 60 * 1000;
    const childPet = (petType) => ({
      ...createDefaultPet(childStartTime),
      petType,
      stage: 'child',
      wellMetSince: childStartTime,
      lastSeen: grownAt - elapsed,
      feedCount: 5,
      playCount: 1,
    });

    // The same fedHeavy verdict, two species, two different form keys.
    expect(applyElapsed(childPet('blob'), elapsed, grownAt).adultForm).toBe('fedHeavy');
    expect(applyElapsed(childPet('ember'), elapsed, grownAt).adultForm).toBe('forge');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: FAIL — the import of `careVerdict` resolves to `undefined`, and the ember case returns `'fedHeavy'` instead of `'forge'`.

- [ ] **Step 3: Write minimal implementation**

In `lib/tamagotchi/simulation.js`, widen the creatures import on line 2:

```js
import { DEFAULT_PET, getPetType, resolveForm } from './creatures';
```

Rename the exported function (body unchanged) so its name matches what it returns:

```js
// Classifies the care tally into a species-independent verdict. creatures.js
// maps that verdict onto the species' own form key — keeping the tally math
// here and the branch naming there.
export const careVerdict = (pet) => {
```

In `grow()`, resolve the verdict through the pet's species:

```js
    const adultForm =
      nextStage === 'adult' ? resolveForm(getPetType(pet.petType), careVerdict(pet)) : pet.adultForm;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/simulation.test.js`
Expected: PASS, including the pre-existing `'sets adultForm on the child->adult transition'` test — its pet is a blob, whose form keys are identical to the verdict names.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git add lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): resolve adult form through the pet's species branch set"
```

---

### Task 4: Pet creation takes a species, and `loadPet` reports no save

**Files:**
- Modify: `lib/tamagotchi/simulation.js` (`createDefaultPet`)
- Modify: `lib/tamagotchi/storage.js` (`loadPet`, its `createDefaultPet` import, plus a new `clearPet`)
- Test: `lib/tamagotchi/storage.test.js`
- Test: `lib/tamagotchi/simulation.test.js` (the species parameter belongs with the function that takes it)

**Interfaces:**
- Consumes: `DEFAULT_PET` from `./creatures`, already imported by `simulation.js`.
- Produces: `createDefaultPet(now = Date.now(), petType = DEFAULT_PET)`; `loadPet()` (its `now` parameter goes away, see Step 3) returns `null` instead of a fabricated pet when there is no valid save; `clearPet()` removes `STORAGE_KEY`. Consumed by Task 5 (the page's three-state machine) and Task 6 (the restart control).

**Watch out:** this is the riskiest task in the plan. `loadPet`'s old contract was "always returns a pet", and four existing tests assert it. Every caller must now handle `null`. The only production caller is `pages/tamagotchi/index.jsx`, updated in Task 5.

- [ ] **Step 1: Write the failing test**

In `lib/tamagotchi/storage.test.js`, add `clearPet` to the import on line 2, then replace the three tests that assert a fabricated pet (lines 10-14, 22-25, 27-30) with null assertions:

```js
  it('returns null when nothing is stored', () => {
    expect(loadPet()).toBeNull();
  });

  it('returns null for a save with a mismatched version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createDefaultPet(0), version: 999 }));
    expect(loadPet()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadPet()).toBeNull();
  });
```

`loadPet` loses its parameter in Step 3, so drop the argument from the three surviving call sites too: lines 19, 36 and 48 all call `loadPet(1000)` today.

Append after the `savePet` describe block:

```js
describe('clearPet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a stored pet so loadPet reports no save', () => {
    savePet(createDefaultPet(0), 0);
    clearPet();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadPet()).toBeNull();
  });
});
```

`createDefaultPet` lives in `simulation.js`, so its species test belongs in `lib/tamagotchi/simulation.test.js`. Append these two cases to the existing `describe('createDefaultPet', ...)` block there:

```js
  it('defaults to the default pet type', () => {
    expect(createDefaultPet(0).petType).toBe('blob');
  });

  it('takes the chosen species', () => {
    expect(createDefaultPet(0, 'ember').petType).toBe('ember');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tamagotchi/storage.test.js`
Expected: FAIL — `loadPet()` returns an object rather than `null`, `clearPet` is not a function, and `createDefaultPet(0, 'ember').petType` is `'blob'`.

- [ ] **Step 3: Write minimal implementation**

In `lib/tamagotchi/simulation.js`, give `createDefaultPet` a species parameter:

```js
export const createDefaultPet = (now = Date.now(), petType = DEFAULT_PET) => ({
  version: SCHEMA_VERSION,
  lastSeen: now,
  petType,
```

(the rest of the object literal is unchanged)

In `lib/tamagotchi/storage.js`, two things change together. `createDefaultPet` has no remaining call site, so trim line 1 to:

```js
import { SCHEMA_VERSION } from './simulation';
```

Leaving it imported is a `no-unused-vars` error under Airbnb, which fails Step 5.

Then rewrite `loadPet`'s three fallback paths to return `null`, and add `clearPet`:

```js
// Returns null when there is no usable save. The page distinguishes "no pet
// yet" from "still loading" and shows the species chooser, so a corrupt or
// version-mismatched save sends the player back to the chooser rather than
// silently handing them a pet they did not pick.
//
// Takes no arguments: every path that needed the current time was the one
// fabricating a pet, and an unused parameter is a lint error here.
export const loadPet = () => {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && typeof parsed.hunger === 'number') {
      // Additive-safe defaults for fields introduced after this save was
      // written — spread order lets an old-shaped save fall back to these
      // while a save that already has them keeps its own values.
      return {
        feedCount: 0,
        playCount: 0,
        sleepMinutes: 0,
        adultForm: null,
        sick: false,
        poopUncleanMinutes: 0,
        ...parsed,
      };
    }
  } catch {
    // fall through to null on corrupt data
  }
  return null;
};
```

```js
export const clearPet = () => {
  const store = storage();
  if (store) store.removeItem(STORAGE_KEY);
};
```

Callers to update for the dropped parameter: six in `storage.test.js` (lines 11, 19, 24, 29, 36, 48 before this task's edits) and one in `pages/tamagotchi/index.jsx:123`, handled in Task 5. Airbnb sets `no-unused-vars` to `args: 'after-used'`, so keeping an unused `now` is an error, not a warning — decide it here rather than discovering it at Step 5.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/storage.test.js lib/tamagotchi/simulation.test.js`
Expected: PASS. `simulation.test.js` is included because `createDefaultPet` changed; its existing single-argument calls are unaffected by the new defaulted parameter.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint lib/tamagotchi/storage.js lib/tamagotchi/storage.test.js lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git add lib/tamagotchi/storage.js lib/tamagotchi/storage.test.js lib/tamagotchi/simulation.js lib/tamagotchi/simulation.test.js
git commit -m "feat(tamagotchi): report an absent save and create pets of a chosen species"
```

---

### Task 5: Species chooser and the page's three-state machine

**Files:**
- Create: `components/tamagotchi/SpeciesChooser.jsx`
- Create: `components/tamagotchi/SpeciesChooser.module.css`
- Modify: `pages/tamagotchi/index.jsx` (imports, mount effect, render)
- Test: `__tests__/pages/tamagotchi/index.test.jsx`

**Interfaces:**
- Consumes: `petKeys`/`PETS` from `creatures.js`; `loadPet` returning `null` and `createDefaultPet(now, petType)` from Task 4.
- Produces: `SpeciesChooser` (default export, props: `onChoose: (key: string) => void`). The page gains a `status` state of `'loading' | 'choosing' | 'playing'`, and `handleChooseSpecies(key)`. Consumed by Task 6, whose restart control sets `status` back to `'choosing'`.

**Watch out:** the component must live under `components/`, not `pages/` — every file under `pages/` becomes a Next.js route.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/pages/tamagotchi/index.test.jsx`, inside the existing `describe('Tamagotchi page', ...)`:

```js
  it('shows the species chooser when there is no saved pet', () => {
    render(<Tamagotchi />);
    expect(screen.getByRole('button', { name: 'Blob' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sprout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ember' })).toBeInTheDocument();
    expect(screen.queryByTestId('pet')).not.toBeInTheDocument();
  });

  it('hatches the chosen species and persists it', () => {
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Ember' }));
    expect(readPet().petType).toBe('ember');
    expect(readPet().stage).toBe('baby');
    expect(screen.getByTestId('pet')).toBeInTheDocument();
    expect(screen.getByTestId('pet')).toHaveTextContent('🕯️');
  });

  it('plays the evolve cue as the hatch sound', () => {
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Sprout' }));
    expect(latestPlaySpy()).toHaveBeenCalledWith('evolve');
  });

  it('skips the chooser when a saved pet exists', () => {
    seedPet({ petType: 'sprout' });
    render(<Tamagotchi />);
    expect(screen.queryByRole('button', { name: 'Ember' })).not.toBeInTheDocument();
    expect(screen.getByTestId('pet')).toHaveTextContent('🌰');
  });
```

The first existing test, `'renders the pet and care actions'` (line 64), renders with empty storage and would now hit the chooser. Change it to seed a pet first:

```js
  it('renders the pet and care actions', () => {
    seedPet();
    render(<Tamagotchi />);
    expect(screen.getByTestId('pet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sleep' })).toBeInTheDocument();
  });
```

One other existing test also renders without seeding: `'opens the minigame overlay from the palette Play button'` (line 87). Add `seedPet();` as the first line of its body too. Every other test in the file already seeds.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx`
Expected: FAIL — no button named `Blob` exists; the page renders a pet straight away.

- [ ] **Step 3: Write the chooser component**

Create `components/tamagotchi/SpeciesChooser.jsx`:

```jsx
import React from 'react';
import PropTypes from 'prop-types';

import styles from './SpeciesChooser.module.css';
import { PETS, petKeys } from '../../lib/tamagotchi/creatures';

// Shown only when there is no saved pet. Species is fixed for a pet's life, so
// this is the one moment the player picks one.
export default function SpeciesChooser({ onChoose }) {
  return (
    <div className={styles.chooser} role="group" aria-label="Choose a pet">
      <p className={styles.prompt}>Pick a pet</p>
      <div className={styles.choices}>
        {petKeys().map((key) => (
          <button
            key={key}
            type="button"
            className={styles.choice}
            aria-label={PETS[key].name}
            onClick={() => onChoose(key)}
          >
            <span className={styles.choiceSprite}>{PETS[key].sprite.baby.normal}</span>
            <span className={styles.choiceName}>{PETS[key].name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

SpeciesChooser.propTypes = {
  onChoose: PropTypes.func.isRequired,
};
```

Create `components/tamagotchi/SpeciesChooser.module.css`:

```css
.chooser {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem 1rem;
}

.prompt {
  margin: 0;
  font-size: 1.25rem;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-width: 5.5rem;
  padding: 1rem;
  border: 2px solid currentColor;
  border-radius: 0.75rem;
  background: none;
  color: inherit;
  cursor: pointer;
}

.choiceSprite {
  font-size: 2.5rem;
  line-height: 1;
}

.choiceName {
  font-size: 0.9rem;
}
```

- [ ] **Step 4: Wire the page's three-state machine**

In `pages/tamagotchi/index.jsx`, add the imports:

```js
import SpeciesChooser from '../../components/tamagotchi/SpeciesChooser';
```

and add `createDefaultPet` to the existing `simulation` import list.

Replace the `pet` state declaration and the mount effect (lines 117-127) with:

```js
  const [pet, setPet] = useState(null);
  // 'loading' until the save is read, then 'choosing' (no pet yet) or 'playing'.
  // pet === null alone can't tell those apart.
  const [status, setStatus] = useState('loading');
  const soundRef = useRef(null);

  // Mount: load, catch up offline decay, wire sound.
  useEffect(() => {
    const now = Date.now();
    const loaded = loadPet();
    if (!loaded) {
      // No sound engine yet: handleChooseSpecies builds one for the pet it
      // hatches, so there is nothing to wire until a species is picked.
      setStatus('choosing');
      return;
    }
    const caughtUp = applyElapsed(loaded, now - loaded.lastSeen, now);
    setPet(caughtUp);
    setStatus('playing');
    soundRef.current = createSound(caughtUp.soundOn);
  }, []);
```

Add the hatch handler, directly after `handleMinigameCancel`:

```js
  const handleChooseSpecies = (key) => {
    const now = Date.now();
    const hatched = savePet(createDefaultPet(now, key), now);
    setPet(hatched);
    setStatus('playing');
    // Build a fresh engine rather than reuse soundRef. After a restart it
    // still carries the previous pet's setEnabled(false), which would leave
    // the new pet silent while the UI reports Sound on.
    soundRef.current = createSound(hatched.soundOn);
    soundRef.current.play('evolve');
  };
```

Replace the `if (!pet)` early return (lines 190-196) with the two non-playing states:

```js
  if (status === 'loading' || !pet) {
    return (
      <div className={styles.page}>
        <Head>{pwaMetaTags(basePath)}</Head>
        {status === 'choosing' && <SpeciesChooser onChoose={handleChooseSpecies} />}
      </div>
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint components/tamagotchi/SpeciesChooser.jsx pages/tamagotchi/index.jsx __tests__/pages/tamagotchi/index.test.jsx
git add components/tamagotchi pages/tamagotchi/index.jsx __tests__/pages/tamagotchi/index.test.jsx
git commit -m "feat(tamagotchi): pick a species when no pet exists"
```

---

### Task 6: Restart control with a two-step confirm

**Files:**
- Modify: `pages/tamagotchi/index.jsx` (imports, `commit`, `handleOpenMinigame`, the palette)
- Modify: `pages/tamagotchi/index.module.css` (one new class)
- Test: `__tests__/pages/tamagotchi/index.test.jsx`

**Interfaces:**
- Consumes: `clearPet` from Task 4; `status`/`setStatus` from Task 5.
- Produces: nothing other tasks depend on. This is the last code task.

**Watch out:** this is the only destructive action in the app. It must take two deliberate taps, any other interaction must cancel the pending confirm, the confirm target must never land on the arming button's own position (a double tap there would destroy the pet), and an armed confirm must expire on its own.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/pages/tamagotchi/index.test.jsx`:

```js
  it('requires two taps to start a new pet, then returns to the chooser', () => {
    seedPet({ petType: 'sprout', hunger: 42 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    expect(readPet().hunger).toBe(42);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new pet' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Blob' })).toBeInTheDocument();
    expect(screen.queryByTestId('pet')).not.toBeInTheDocument();
  });

  it('cancels a pending restart when another care action is taken', () => {
    seedPet({ hunger: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New pet' })).toBeInTheDocument();
    expect(readPet().hunger).toBeGreaterThan(10);
  });

  it('cancels a pending restart from the arming button position', () => {
    seedPet();
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new pet' }));
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('drops a pending restart left unconfirmed', () => {
    vi.useFakeTimers();
    seedPet();
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    act(() => {
      vi.advanceTimersByTime(5000); // RESTART_CONFIRM_MS
    });
    expect(screen.queryByRole('button', { name: 'Confirm new pet' })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    vi.useRealTimers();
  });

  it('gives a new pet a fresh sound engine instead of the old pet mute', () => {
    seedPet({ soundOn: false });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'New pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new pet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blob' }));
    expect(screen.getByRole('button', { name: 'Sound on' })).toBeInTheDocument();
    // createSound is re-invoked for the hatched pet, enabled per its soundOn.
    expect(vi.mocked(createSound).mock.calls.at(-1)[0]).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx`
Expected: FAIL — no button named `New pet` exists.

- [ ] **Step 3: Write the implementation**

In `pages/tamagotchi/index.jsx`, add `clearPet` to the storage import:

```js
import { loadPet, savePet, clearPet } from '../../lib/tamagotchi/storage';
```

Add the confirm window constant next to `TICK_MS`:

```js
const RESTART_CONFIRM_MS = 5000;
```

Add the confirm state next to `minigameActive`:

```js
  const [confirmRestart, setConfirmRestart] = useState(false);
```

Add the auto-disarm effect with the other hooks, above the early return:

```js
  // Disarms itself. The 2s tick does not go through commit, so without this
  // a confirm the player walked away from stays armed indefinitely.
  useEffect(() => {
    if (!confirmRestart) return undefined;
    const id = setTimeout(() => setConfirmRestart(false), RESTART_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmRestart]);
```

Every care action goes through `commit`, so cancelling a pending confirm there covers all of them. Add the reset as the first statement inside `commit`'s `useCallback` body, before `setPet`:

```js
  const commit = useCallback((updater, cue) => {
    setConfirmRestart(false);
    setPet((prev) => {
```

Opening the minigame does not go through `commit`, so reset there too:

```js
  const handleOpenMinigame = () => {
    setConfirmRestart(false);
    setMinigameActive(true);
  };
```

Add the restart handler after `handleMedicine`:

```js
  const handleRestart = () => {
    clearPet();
    setPet(null);
    setConfirmRestart(false);
    setStatus('choosing');
  };
```

Add the control as the last child of `.palette`, after the medicine button:

```jsx
        {confirmRestart ? (
          <>
            {/* The arming tap's own position becomes Cancel, so a second tap
                in the same place is harmless. The destructive target only
                appears in a palette slot that was empty a moment earlier. */}
            <button
              type="button"
              className={styles.action}
              aria-label="Cancel new pet"
              onClick={() => setConfirmRestart(false)}
            >
              ✖️
            </button>
            <button
              type="button"
              className={styles.actionDanger}
              aria-label="Confirm new pet"
              onClick={handleRestart}
            >
              ❗
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-label="New pet"
            onClick={() => setConfirmRestart(true)}
          >
            🔄
          </button>
        )}
```

Add the confirm styling to `pages/tamagotchi/index.module.css`, after the existing `.action` rule:

```css
.actionDanger {
  composes: action;
  outline: 2px solid crimson;
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and lint**

Run: `npm test`
Expected: PASS, every file.

```bash
npx eslint pages/tamagotchi/index.jsx __tests__/pages/tamagotchi/index.test.jsx
```

- [ ] **Step 6: Commit**

```bash
git add pages/tamagotchi/index.jsx pages/tamagotchi/index.module.css __tests__/pages/tamagotchi/index.test.jsx
git commit -m "feat(tamagotchi): start a new pet behind a two-step confirm"
```

---

### Task 7: Correct the tamagotchi rules file

**Files:**
- Modify: `.claude/rules/tamagotchi.md:10-14` and its Conventions section

**Interfaces:** none. Documentation only.

- [ ] **Step 1: Replace the stale scaffold paragraph**

`.claude/rules/tamagotchi.md` lines 10-14 still say evolution, minigames, and sickness are unbuilt. Replace that paragraph with:

```markdown
Virtual pet. Needs decay over time, tap-driven care actions, branching
evolution, a recoverable sickness state, a timing minigame, and three species
the player picks from when a pet is created. No death and no permanent stat
loss anywhere — that is a standing design constraint, not an omission.
```

- [ ] **Step 2: Document the verdict/form split under Conventions**

Append to the Conventions list:

```markdown
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
```

- [ ] **Step 3: Update the creatures.js layout line**

The Layout section describes `creatures.js` as "Currently a single `blob` placeholder". Replace that sentence with:

```markdown
  Three species (`blob`, `sprout`, `ember`), each declaring its own adult
  `forms` map and `defaultForm`.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/tamagotchi.md
git commit -m "docs(tamagotchi): correct the rules file for shipped mechanics"
```

---

## Verification

After Task 7, confirm the whole change end to end:

- [ ] `npm test` passes.
- [ ] `npx eslint .` passes.
- [ ] `npm run dev`, open `/tamagotchi` with `localStorage` cleared: the chooser shows three species; picking Ember hatches a 🕯️; the restart control takes two taps and returns to the chooser.
