# Aquarium Pet Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toddler-focused Tamagotchi-style virtual aquarium mini-tool where creatures are fed, cleaned, and played with, grow over time, and never die.

**Architecture:** Pure, unit-tested game logic in `lib/aquarium/` (species config, simulation math, storage, sound). A React page at `pages/aquarium/` renders the tank with DOM + CSS animations, runs a decay/render tick while visible, and catches up on real-time offline decay at mount. State persists as one JSON blob in `localStorage`. No backend, no new dependencies.

**Tech Stack:** Next.js + React 18 (JavaScript, not TypeScript), CSS Modules, Vitest + React Testing Library, WebAudio API for sound.

## Global Constraints

- JavaScript only — never introduce TypeScript files.
- No new dependencies; do not touch `package.json` or lockfiles.
- Follow Airbnb ESLint + Prettier conventions already in the repo.
- CSS Modules co-located with the page (`pages/aquarium/index.module.css`). No inline styles in new code.
- `prop-types` for React prop validation; functional components with hooks only.
- Tests for files under `pages/` live in `__tests__/pages/` mirroring the path (Next.js treats every file under `pages/` as a route — a `.test.jsx` there breaks the build). Non-page `lib/` tests are co-located.
- Reuse existing helpers: `clamp` and `generateId` from `lib/random.js`. Do not duplicate them.
- Pure logic modules take injectable `now` (epoch ms) and `rng` (`() => number in [0,1)`) parameters defaulting to `Date.now` / `Math.random`, so tests are deterministic — matching the `weightedRandomChoice(items, rng = Math.random)` pattern already in the repo.
- All needs are integers-or-floats in `[0, 100]`; never below the floor `15`, never above `100`. There is no death state.

---

### Task 1: Species config (theming layer)

The swappable data layer. Game logic references a species only by its key; changing fish to shrimp/chicks/puppies/bunnies later means editing this file only.

**Files:**
- Create: `lib/aquarium/creatures.js`
- Test: `lib/aquarium/creatures.test.js`

**Interfaces:**
- Produces:
  - `SPECIES` — object keyed by species id.
  - `DEFAULT_SPECIES` — string key.
  - `getSpecies(key)` — returns the species config for `key`, or the default if unknown.
  - `speciesKeys()` — array of all species keys.
  - Each species config shape: `{ key, name, emoji: { baby, child, adult }, hueDeg (number), sizePx: { baby, child, adult } }`.

- [ ] **Step 1: Write the failing test**

```javascript
// lib/aquarium/creatures.test.js
import { describe, it, expect } from 'vitest';
import { SPECIES, DEFAULT_SPECIES, getSpecies, speciesKeys } from './creatures';

describe('creatures config', () => {
  it('exposes at least one species', () => {
    expect(speciesKeys().length).toBeGreaterThan(0);
  });

  it('has a default species present in SPECIES', () => {
    expect(SPECIES[DEFAULT_SPECIES]).toBeDefined();
  });

  it('every species exposes the fields render and simulation need', () => {
    speciesKeys().forEach((key) => {
      const s = SPECIES[key];
      expect(s.key).toBe(key);
      expect(typeof s.name).toBe('string');
      expect(typeof s.hueDeg).toBe('number');
      ['baby', 'child', 'adult'].forEach((stage) => {
        expect(typeof s.emoji[stage]).toBe('string');
        expect(typeof s.sizePx[stage]).toBe('number');
      });
    });
  });

  it('getSpecies returns the requested species', () => {
    expect(getSpecies(DEFAULT_SPECIES).key).toBe(DEFAULT_SPECIES);
  });

  it('getSpecies falls back to default for an unknown key', () => {
    expect(getSpecies('not-a-species').key).toBe(DEFAULT_SPECIES);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/creatures.test.js`
Expected: FAIL — cannot resolve `./creatures`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/aquarium/creatures.js

// The theming layer. Game logic references species by key only, so swapping
// fish for shrimp/chicks/puppies/bunnies later is an edit to this file alone.
export const SPECIES = {
  clownfish: {
    key: 'clownfish',
    name: 'Clownfish',
    emoji: { baby: '🐠', child: '🐠', adult: '🐡' },
    hueDeg: 20,
    sizePx: { baby: 28, child: 40, adult: 56 },
  },
  tropicalfish: {
    key: 'tropicalfish',
    name: 'Tropical Fish',
    emoji: { baby: '🐟', child: '🐟', adult: '🐠' },
    hueDeg: 200,
    sizePx: { baby: 28, child: 40, adult: 56 },
  },
  blowfish: {
    key: 'blowfish',
    name: 'Blowfish',
    emoji: { baby: '🐟', child: '🐡', adult: '🐡' },
    hueDeg: 280,
    sizePx: { baby: 28, child: 42, adult: 60 },
  },
};

export const DEFAULT_SPECIES = 'clownfish';

export const speciesKeys = () => Object.keys(SPECIES);

export const getSpecies = (key) => SPECIES[key] || SPECIES[DEFAULT_SPECIES];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/creatures.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/creatures.js lib/aquarium/creatures.test.js
git commit -m "feat: add aquarium species config theming layer"
```

---

### Task 2: Simulation — constants, defaults, real-time decay

**Files:**
- Create: `lib/aquarium/simulation.js`
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `speciesKeys`, `DEFAULT_SPECIES` from `./creatures`; `clamp`, `generateId` from `../random`.
- Produces (this task):
  - Constants: `NEED_FLOOR = 15`, `NEED_MAX = 100`, `TANK_CAP = 8`, `MET_THRESHOLD = 60`, `SCHEMA_VERSION = 1`, `HUNGER_DECAY_PER_MIN = 0.12`, `HAPPINESS_DECAY_PER_MIN = 0.10`, `CLEAN_DECAY_PER_MIN = 0.08`, `DIRTY_DRAG_PER_MIN = 0.06`, `STAGE_DURATIONS_MS = { baby: 6*3600e3, child: 12*3600e3 }`, `MAX_ELAPSED_MS = 7*24*3600e3`.
  - `createDefaultTank(now = Date.now(), rng = Math.random)` — returns a full tank object (schema per the design spec) with 2 starter baby creatures.
  - `applyElapsed(state, elapsedMs, now = Date.now())` — returns a new state with needs decayed (floored), dirty-tank happiness drag applied, and growth advanced. Pure; does not mutate input.
- Produces (later tasks extend this same file): care actions and hatch.

Growth rule for `applyElapsed`: after decay, a creature is "met" when `hunger >= MET_THRESHOLD && happiness >= MET_THRESHOLD && cleanliness >= MET_THRESHOLD`. If met, set `wellMetSince ??= now`; if `now - wellMetSince >= STAGE_DURATIONS_MS[stage]` and stage isn't `adult`, advance one stage (`baby→child→adult`) and reset `wellMetSince = now`. If not met, set `wellMetSince = null`. Growth is one-way and never regresses.

- [ ] **Step 1: Write the failing test**

```javascript
// lib/aquarium/simulation.test.js
import { describe, it, expect } from 'vitest';
import {
  NEED_FLOOR,
  NEED_MAX,
  TANK_CAP,
  MET_THRESHOLD,
  STAGE_DURATIONS_MS,
  createDefaultTank,
  applyElapsed,
} from './simulation';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('createDefaultTank', () => {
  it('starts with two baby creatures and a clean, full tank', () => {
    const tank = createDefaultTank(1000, () => 0.5);
    expect(tank.creatures).toHaveLength(2);
    tank.creatures.forEach((c) => {
      expect(c.stage).toBe('baby');
      expect(c.hunger).toBe(NEED_MAX);
      expect(c.happiness).toBe(NEED_MAX);
      expect(c.wellMetSince).toBeNull();
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(1);
    });
    expect(tank.tankCleanliness).toBe(NEED_MAX);
    expect(tank.eggProgress).toBe(0);
    expect(tank.egg).toBeNull();
    expect(tank.lastSeen).toBe(1000);
  });
});

describe('applyElapsed decay', () => {
  it('reduces needs over elapsed time', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = applyElapsed(tank, 60 * MIN, 60 * MIN);
    expect(next.creatures[0].hunger).toBeLessThan(NEED_MAX);
    expect(next.tankCleanliness).toBeLessThan(NEED_MAX);
  });

  it('never lets a need fall below the floor', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = applyElapsed(tank, 1000 * HOUR, 1000 * HOUR);
    next.creatures.forEach((c) => {
      expect(c.hunger).toBeGreaterThanOrEqual(NEED_FLOOR);
      expect(c.happiness).toBeGreaterThanOrEqual(NEED_FLOOR);
    });
    expect(next.tankCleanliness).toBeGreaterThanOrEqual(NEED_FLOOR);
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const before = tank.creatures[0].hunger;
    applyElapsed(tank, 10 * HOUR, 10 * HOUR);
    expect(tank.creatures[0].hunger).toBe(before);
  });
});

describe('applyElapsed growth', () => {
  it('advances a well-cared creature after the stage duration', () => {
    const tank = createDefaultTank(0, () => 0.5);
    // Needs start full (met). One applyElapsed just past the baby duration.
    const dur = STAGE_DURATIONS_MS.baby;
    const next = applyElapsed(tank, dur + MIN, dur + MIN);
    expect(next.creatures[0].stage).toBe('child');
  });

  it('does not advance when needs are not met', () => {
    const tank = createDefaultTank(0, () => 0.5);
    // Long enough that decay pushes needs below MET_THRESHOLD.
    const next = applyElapsed(tank, 1000 * HOUR, 1000 * HOUR);
    expect(next.creatures[0].stage).toBe('baby');
    expect(next.creatures[0].wellMetSince).toBeNull();
  });

  it('never regresses past adult', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].stage = 'adult';
    const next = applyElapsed(tank, STAGE_DURATIONS_MS.child + MIN, STAGE_DURATIONS_MS.child + MIN);
    expect(next.creatures[0].stage).toBe('adult');
  });
});

describe('constants', () => {
  it('exposes the tank cap and met threshold', () => {
    expect(TANK_CAP).toBe(8);
    expect(MET_THRESHOLD).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: FAIL — cannot resolve `./simulation`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/aquarium/simulation.js
import { clamp, generateId } from '../random';
import { speciesKeys, DEFAULT_SPECIES } from './creatures';

export const SCHEMA_VERSION = 1;
export const NEED_FLOOR = 15;
export const NEED_MAX = 100;
export const TANK_CAP = 8;
export const MET_THRESHOLD = 60;

export const HUNGER_DECAY_PER_MIN = 0.12;
export const HAPPINESS_DECAY_PER_MIN = 0.1;
export const CLEAN_DECAY_PER_MIN = 0.08;
// Extra happiness loss per minute while the tank is dirty (cleanliness below MET).
export const DIRTY_DRAG_PER_MIN = 0.06;

export const STAGE_DURATIONS_MS = { baby: 6 * 3600e3, child: 12 * 3600e3 };
// Clamp offline catch-up so an ancient save still resolves to a recoverable state.
export const MAX_ELAPSED_MS = 7 * 24 * 3600e3;

const NEXT_STAGE = { baby: 'child', child: 'adult' };

const randomSpecies = (rng) => {
  const keys = speciesKeys();
  return keys[Math.floor(rng() * keys.length)] || DEFAULT_SPECIES;
};

const makeCreature = (now, rng) => ({
  id: generateId(),
  species: randomSpecies(rng),
  bornAt: now,
  stage: 'baby',
  hunger: NEED_MAX,
  happiness: NEED_MAX,
  wellMetSince: null,
  x: 0.15 + rng() * 0.7,
  y: 0.15 + rng() * 0.7,
});

export const createDefaultTank = (now = Date.now(), rng = Math.random) => ({
  version: SCHEMA_VERSION,
  lastSeen: now,
  selectedTool: 'food',
  soundOn: true,
  tankCleanliness: NEED_MAX,
  eggProgress: 0,
  egg: null,
  creatures: [makeCreature(now, rng), makeCreature(now, rng)],
});

const decayNeed = (value, ratePerMin, minutes) =>
  clamp(value - ratePerMin * minutes, NEED_FLOOR, NEED_MAX);

const grow = (creature, now) => {
  const met =
    creature.hunger >= MET_THRESHOLD &&
    creature.happiness >= MET_THRESHOLD &&
    creature.metEnv;
  if (!met) return { ...creature, wellMetSince: null, metEnv: undefined };
  const wellMetSince = creature.wellMetSince ?? now;
  const duration = STAGE_DURATIONS_MS[creature.stage];
  if (duration != null && now - wellMetSince >= duration) {
    return { ...creature, stage: NEXT_STAGE[creature.stage], wellMetSince: now, metEnv: undefined };
  }
  return { ...creature, wellMetSince, metEnv: undefined };
};

export const applyElapsed = (state, elapsedMs, now = Date.now()) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const tankCleanliness = decayNeed(state.tankCleanliness, CLEAN_DECAY_PER_MIN, minutes);
  const dirty = tankCleanliness < MET_THRESHOLD;

  const creatures = state.creatures.map((c) => {
    const hunger = decayNeed(c.hunger, HUNGER_DECAY_PER_MIN, minutes);
    const dragged = dirty
      ? clamp(c.happiness - DIRTY_DRAG_PER_MIN * minutes, NEED_FLOOR, NEED_MAX)
      : c.happiness;
    const happiness = decayNeed(dragged, HAPPINESS_DECAY_PER_MIN, minutes);
    // metEnv folds the shared tank condition into the per-creature growth check.
    return grow({ ...c, hunger, happiness, metEnv: tankCleanliness >= MET_THRESHOLD }, now);
  });

  return { ...state, tankCleanliness, creatures, lastSeen: now };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add aquarium simulation defaults and real-time decay"
```

---

### Task 3: Simulation — care actions (feed, clean, play)

**Files:**
- Modify: `lib/aquarium/simulation.js`
- Test: `lib/aquarium/simulation.test.js` (add a `describe` block)

**Interfaces:**
- Consumes: constants and helpers from Task 2.
- Produces (all pure, return a new state, never mutate; each care action also nudges `eggProgress` up):
  - Constants: `FEED_AMOUNT = 40`, `PLAY_AMOUNT = 35`, `CLEAN_AMOUNT = 60`, `EGG_FILL_PER_ACTION = 10`, `FEED_RADIUS = 0.3`, `TANK_ACTION_MAX_TARGETS = 3`.
  - `feedCreature(state, id)` — raises that creature's `hunger` by `FEED_AMOUNT` (clamped).
  - `playCreature(state, id)` — raises that creature's `happiness` by `PLAY_AMOUNT` (clamped).
  - `feedTank(state, x, y, rng = Math.random)` — feeds up to `TANK_ACTION_MAX_TARGETS` creatures nearest the drop point within `FEED_RADIUS`; if none are within radius, feeds the single nearest.
  - `playTank(state, x, y, rng = Math.random)` — same targeting rule, raises `happiness`.
  - `cleanTank(state)` — raises `tankCleanliness` by `CLEAN_AMOUNT` (clamped).
  - Egg: `eggProgress` clamps at `NEED_MAX`; when it reaches `NEED_MAX` and `egg` is null and creatures are under `TANK_CAP`, an egg appears (`egg = { readyAt }`) and `eggProgress` resets to 0. At cap, `eggProgress` stops rising.

- [ ] **Step 1: Write the failing test**

```javascript
// append to lib/aquarium/simulation.test.js
import {
  FEED_AMOUNT,
  EGG_FILL_PER_ACTION,
  feedCreature,
  playCreature,
  feedTank,
  playTank,
  cleanTank,
} from './simulation';

describe('directed care', () => {
  it('feedCreature raises only the targeted creature and clamps at max', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 50;
    const id = tank.creatures[0].id;
    const next = feedCreature(tank, id);
    expect(next.creatures[0].hunger).toBe(Math.min(NEED_MAX, 50 + FEED_AMOUNT));
    expect(next.creatures[1].hunger).toBe(tank.creatures[1].hunger);
  });

  it('playCreature raises the targeted creature happiness', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].happiness = 40;
    const next = playCreature(tank, tank.creatures[0].id);
    expect(next.creatures[0].happiness).toBeGreaterThan(40);
  });

  it('does not mutate input', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 30;
    feedCreature(tank, tank.creatures[0].id);
    expect(tank.creatures[0].hunger).toBe(30);
  });
});

describe('tank-wide care', () => {
  it('cleanTank raises cleanliness clamped at max', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.tankCleanliness = 70;
    expect(cleanTank(tank).tankCleanliness).toBe(NEED_MAX);
  });

  it('feedTank feeds the creature nearest the drop point', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].x = 0.1;
    tank.creatures[0].y = 0.1;
    tank.creatures[0].hunger = 20;
    tank.creatures[1].x = 0.9;
    tank.creatures[1].y = 0.9;
    tank.creatures[1].hunger = 20;
    const next = feedTank(tank, 0.1, 0.1);
    expect(next.creatures[0].hunger).toBeGreaterThan(20);
  });

  it('feedTank feeds nearest even when none are within radius', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures.forEach((c, i) => {
      c.x = 0.9;
      c.y = 0.9;
      c.hunger = 20;
      c.id = `c${i}`;
    });
    const next = feedTank(tank, 0.05, 0.05);
    const raised = next.creatures.filter((c) => c.hunger > 20);
    expect(raised).toHaveLength(1);
  });
});

describe('egg progress', () => {
  it('accumulates egg progress on each care action', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = cleanTank(tank);
    expect(next.eggProgress).toBe(EGG_FILL_PER_ACTION);
  });

  it('spawns an egg when progress fills and creatures are under cap', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.eggProgress = NEED_MAX - EGG_FILL_PER_ACTION;
    const next = cleanTank(tank);
    expect(next.egg).not.toBeNull();
    expect(next.eggProgress).toBe(0);
  });

  it('stops filling at tank cap', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures = Array.from({ length: TANK_CAP }, (_, i) => ({
      ...tank.creatures[0],
      id: `c${i}`,
    }));
    tank.eggProgress = 50;
    const next = cleanTank(tank);
    expect(next.eggProgress).toBe(50);
    expect(next.egg).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: FAIL — the new care functions are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/aquarium/simulation.js`:

```javascript
export const FEED_AMOUNT = 40;
export const PLAY_AMOUNT = 35;
export const CLEAN_AMOUNT = 60;
export const EGG_FILL_PER_ACTION = 10;
export const FEED_RADIUS = 0.3;
export const TANK_ACTION_MAX_TARGETS = 3;

const raise = (value, amount) => clamp(value + amount, NEED_FLOOR, NEED_MAX);

// Care fills the egg meter; a full meter spawns an egg unless the tank is full.
const withEggProgress = (state) => {
  if (state.creatures.length >= TANK_CAP) return state;
  const filled = state.eggProgress + EGG_FILL_PER_ACTION;
  if (filled >= NEED_MAX && state.egg == null) {
    return { ...state, eggProgress: 0, egg: { readyAt: state.lastSeen } };
  }
  return { ...state, eggProgress: clamp(filled, 0, NEED_MAX) };
};

const mapCreature = (state, id, fn) => ({
  ...state,
  creatures: state.creatures.map((c) => (c.id === id ? fn(c) : c)),
});

const distance = (c, x, y) => Math.hypot(c.x - x, c.y - y);

// Targets for a tank-wide action: the nearest creatures within radius of the
// drop point, or the single nearest if none are close enough.
const targetIds = (creatures, x, y) => {
  const byDistance = [...creatures].sort((a, b) => distance(a, x, y) - distance(b, x, y));
  const within = byDistance.filter((c) => distance(c, x, y) <= FEED_RADIUS);
  const chosen = within.length > 0 ? within.slice(0, TANK_ACTION_MAX_TARGETS) : byDistance.slice(0, 1);
  return new Set(chosen.map((c) => c.id));
};

export const feedCreature = (state, id) =>
  withEggProgress(mapCreature(state, id, (c) => ({ ...c, hunger: raise(c.hunger, FEED_AMOUNT) })));

export const playCreature = (state, id) =>
  withEggProgress(mapCreature(state, id, (c) => ({ ...c, happiness: raise(c.happiness, PLAY_AMOUNT) })));

export const cleanTank = (state) =>
  withEggProgress({ ...state, tankCleanliness: raise(state.tankCleanliness, CLEAN_AMOUNT) });

export const feedTank = (state, x, y) => {
  const ids = targetIds(state.creatures, x, y);
  return withEggProgress({
    ...state,
    creatures: state.creatures.map((c) =>
      ids.has(c.id) ? { ...c, hunger: raise(c.hunger, FEED_AMOUNT) } : c),
  });
};

export const playTank = (state, x, y) => {
  const ids = targetIds(state.creatures, x, y);
  return withEggProgress({
    ...state,
    creatures: state.creatures.map((c) =>
      ids.has(c.id) ? { ...c, happiness: raise(c.happiness, PLAY_AMOUNT) } : c),
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add aquarium care actions and egg progress"
```

---

### Task 4: Simulation — hatching

**Files:**
- Modify: `lib/aquarium/simulation.js`
- Test: `lib/aquarium/simulation.test.js` (add a `describe` block)

**Interfaces:**
- Consumes: `makeCreature`-equivalent logic, `TANK_CAP` from earlier tasks.
- Produces:
  - `hatchEgg(state, now = Date.now(), rng = Math.random)` — if `egg` is present and creatures are under `TANK_CAP`, adds one new baby creature and clears `egg` (sets it to `null`). If no egg or at cap, returns state unchanged (a new object is fine, but no creature added).

- [ ] **Step 1: Write the failing test**

```javascript
// append to lib/aquarium/simulation.test.js
import { hatchEgg } from './simulation';

describe('hatchEgg', () => {
  it('adds a baby creature and clears the egg', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.egg = { readyAt: 0 };
    const next = hatchEgg(tank, 1000, () => 0.5);
    expect(next.creatures).toHaveLength(3);
    expect(next.creatures[2].stage).toBe('baby');
    expect(next.egg).toBeNull();
  });

  it('does nothing when there is no egg', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = hatchEgg(tank, 1000, () => 0.5);
    expect(next.creatures).toHaveLength(2);
  });

  it('does not exceed the tank cap', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures = Array.from({ length: TANK_CAP }, (_, i) => ({
      ...tank.creatures[0],
      id: `c${i}`,
    }));
    tank.egg = { readyAt: 0 };
    const next = hatchEgg(tank, 1000, () => 0.5);
    expect(next.creatures).toHaveLength(TANK_CAP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: FAIL — `hatchEgg` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/aquarium/simulation.js`:

```javascript
export const hatchEgg = (state, now = Date.now(), rng = Math.random) => {
  if (state.egg == null || state.creatures.length >= TANK_CAP) {
    return { ...state, egg: null };
  }
  return {
    ...state,
    egg: null,
    creatures: [...state.creatures, makeCreature(now, rng)],
  };
};
```

Note: `makeCreature` is defined in Task 2. It is module-private; `hatchEgg` lives in the same file and can call it directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add aquarium egg hatching"
```

---

### Task 5: Storage (localStorage load/save with versioning)

**Files:**
- Create: `lib/aquarium/storage.js`
- Test: `lib/aquarium/storage.test.js`

**Interfaces:**
- Consumes: `createDefaultTank`, `SCHEMA_VERSION` from `./simulation`.
- Produces:
  - `STORAGE_KEY = 'aquarium-tank'`.
  - `loadTank(now = Date.now(), rng = Math.random)` — returns a valid tank. Reads `localStorage`; on missing, corrupt (JSON parse error), or `version` mismatch, returns `createDefaultTank(now, rng)`. Never throws. Returns the raw stored tank (the caller applies elapsed decay separately). When `window`/`localStorage` is unavailable, returns a default tank.
  - `saveTank(tank, now = Date.now())` — stamps `tank.lastSeen = now` and writes JSON to `localStorage`. No-ops without throwing when storage is unavailable. Returns the saved tank object (with the updated `lastSeen`).

- [ ] **Step 1: Write the failing test**

```javascript
// lib/aquarium/storage.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEY, loadTank, saveTank } from './storage';
import { SCHEMA_VERSION } from './simulation';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a default tank when nothing is stored', () => {
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
    expect(tank.creatures.length).toBeGreaterThan(0);
  });

  it('round-trips a saved tank', () => {
    const tank = loadTank(1000, () => 0.5);
    tank.tankCleanliness = 42;
    saveTank(tank, 2000);
    const reloaded = loadTank(3000, () => 0.5);
    expect(reloaded.tankCleanliness).toBe(42);
    expect(reloaded.lastSeen).toBe(2000);
  });

  it('returns a default tank when stored JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
  });

  it('returns a default tank on version mismatch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, creatures: [] }));
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
    expect(tank.creatures.length).toBeGreaterThan(0);
  });

  it('saveTank stamps lastSeen and returns the tank', () => {
    const tank = loadTank(1000, () => 0.5);
    const saved = saveTank(tank, 5555);
    expect(saved.lastSeen).toBe(5555);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/storage.test.js`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/aquarium/storage.js
import { createDefaultTank, SCHEMA_VERSION } from './simulation';

export const STORAGE_KEY = 'aquarium-tank';

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadTank = (now = Date.now(), rng = Math.random) => {
  const store = storage();
  if (!store) return createDefaultTank(now, rng);
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return createDefaultTank(now, rng);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && Array.isArray(parsed.creatures)) {
      return parsed;
    }
  } catch {
    // fall through to default on corrupt data
  }
  return createDefaultTank(now, rng);
};

export const saveTank = (tank, now = Date.now()) => {
  const stamped = { ...tank, lastSeen: now };
  const store = storage();
  if (store) {
    store.setItem(STORAGE_KEY, JSON.stringify(stamped));
  }
  return stamped;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/storage.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/storage.js lib/aquarium/storage.test.js
git commit -m "feat: add aquarium localStorage persistence with versioning"
```

---

### Task 6: Sound (WebAudio cue helper)

A thin, dependency-free sound layer. It must never throw when `AudioContext` is unavailable (jsdom, older browsers) so the game runs silently instead of crashing.

**Files:**
- Create: `lib/aquarium/sound.js`
- Test: `lib/aquarium/sound.test.js`

**Interfaces:**
- Produces:
  - `createSound(enabled = true)` — returns a controller object `{ play(name), setEnabled(bool) }`.
    - `play(name)` — plays a short synthesized cue for `name` in `'nom' | 'pop' | 'sparkle'`; a no-op when disabled or when `AudioContext` is unavailable; never throws.
    - `setEnabled(bool)` — toggles sound on/off.

- [ ] **Step 1: Write the failing test**

```javascript
// lib/aquarium/sound.test.js
import { describe, it, expect } from 'vitest';
import { createSound } from './sound';

describe('createSound', () => {
  // jsdom has no AudioContext, so this exercises the graceful-no-op path.
  it('returns a controller with play and setEnabled', () => {
    const sound = createSound(true);
    expect(typeof sound.play).toBe('function');
    expect(typeof sound.setEnabled).toBe('function');
  });

  it('play never throws when AudioContext is unavailable', () => {
    const sound = createSound(true);
    expect(() => sound.play('nom')).not.toThrow();
    expect(() => sound.play('pop')).not.toThrow();
    expect(() => sound.play('unknown')).not.toThrow();
  });

  it('setEnabled(false) makes play a no-op without throwing', () => {
    const sound = createSound(true);
    sound.setEnabled(false);
    expect(() => sound.play('sparkle')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/sound.test.js`
Expected: FAIL — cannot resolve `./sound`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/aquarium/sound.js

// Short synthesized cues via WebAudio. No audio-file dependencies. Silent and
// safe when AudioContext is unavailable (jsdom, older browsers).
const TONES = {
  nom: { freq: 220, type: 'square', ms: 90 },
  pop: { freq: 520, type: 'triangle', ms: 80 },
  sparkle: { freq: 880, type: 'sine', ms: 140 },
};

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

export const createSound = (enabled = true) => {
  let isEnabled = enabled;
  let ctx = null;

  const ensureCtx = () => {
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const play = (name) => {
    if (!isEnabled) return;
    const tone = TONES[name];
    if (!tone) return;
    const audio = ensureCtx();
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.12, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + tone.ms / 1000);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + tone.ms / 1000);
    } catch {
      // ignore audio failures — sound is non-essential
    }
  };

  const setEnabled = (value) => {
    isEnabled = value;
  };

  return { play, setEnabled };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aquarium/sound.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/sound.js lib/aquarium/sound.test.js
git commit -m "feat: add aquarium WebAudio sound cues"
```

---

### Task 7: Aquarium page — render, tools, gestures, tick

The React integration layer. This is the largest task; work through the steps in order.

**Files:**
- Create: `pages/aquarium/index.jsx`
- Create: `pages/aquarium/index.module.css`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: everything from `lib/aquarium/` (`loadTank`, `saveTank`, `applyElapsed`, care actions, `hatchEgg`, `getSpecies`, `createSound`) and `pwaMetaTags` from `../../components/layout`.
- Produces: the default-exported `Aquarium` page component.

Behavior:
- On mount: `loadTank()`, then `applyElapsed(tank, now - tank.lastSeen, now)` to catch up offline decay, store in state.
- A `setInterval` tick (every ~2s) while mounted applies a small `applyElapsed` and persists via `saveTank`. Clear the interval on unmount.
- A tool palette (radio-select) of three tools: `food`, `sponge`, `toy`. The selected tool has a `selected` CSS class. Selecting a tool updates state and the saved `selectedTool`.
- The tank area renders each creature as a positioned element (emoji from `getSpecies(species).emoji[stage]`, size from `sizePx[stage]`, left/top from `x`/`y`). Visual need state maps to CSS classes: `hungry` (hunger < MET_THRESHOLD), `sad` (happiness < MET_THRESHOLD). Tank gets a `dirty` class when `tankCleanliness < MET_THRESHOLD`.
- Acting on the tank vs a creature with the selected tool:
  - Tapping the tank background with `food` → `feedTank(x, y)`, `sponge` → `cleanTank()`, `toy` → `playTank(x, y)`. `x`/`y` derived from click position within the tank rect (fractions 0..1).
  - Tapping a creature with `food` → `feedCreature(id)`, `toy` → `playCreature(id)`, `sponge` → `cleanTank()` (sponge is tank-wide).
- The egg, when present, renders as a tappable element; tapping it calls `hatchEgg`.
- A mute toggle button flips `soundOn` in state and calls `sound.setEnabled`. Each successful action calls `sound.play(...)` with an appropriate cue.
- Keep gesture handling pragmatic: implement `onClick` for taps first (covered by tests). Drag (pointer move while down) and long-press (pointer-hold timer) enhance feeding/cleaning/petting but are not required for the test gate; add them after taps work, reusing the same action functions.

**Testing note:** jsdom does not lay out elements, so `getBoundingClientRect` returns zeros. Tests exercise tool selection, creature/egg tap handlers, and the mute toggle — not pixel positions. Guard rect math so a zero-size rect yields `x=y=0` without dividing by zero.

- [ ] **Step 1: Write the failing test**

```jsx
// __tests__/pages/aquarium/index.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Aquarium from '../../../pages/aquarium/index';

// next/router is used via pwaMetaTags(basePath); provide a minimal mock.
vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Aquarium page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the three-tool palette', () => {
    render(<Aquarium />);
    expect(screen.getByRole('button', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sponge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toy/i })).toBeInTheDocument();
  });

  it('renders starter creatures', () => {
    render(<Aquarium />);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });

  it('selecting a tool marks it pressed', () => {
    render(<Aquarium />);
    const sponge = screen.getByRole('button', { name: /sponge/i });
    fireEvent.click(sponge);
    expect(sponge).toHaveAttribute('aria-pressed', 'true');
  });

  it('mute toggle flips its label', () => {
    render(<Aquarium />);
    const mute = screen.getByRole('button', { name: /sound/i });
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('tapping a creature with the food tool does not crash and keeps it rendered', () => {
    render(<Aquarium />);
    fireEvent.click(screen.getByRole('button', { name: /food/i }));
    const first = screen.getAllByTestId('creature')[0];
    fireEvent.click(first);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Write the page component**

```jsx
// pages/aquarium/index.jsx
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import styles from './index.module.css';
import { pwaMetaTags } from '../../components/layout';
import { getSpecies } from '../../lib/aquarium/creatures';
import { loadTank, saveTank } from '../../lib/aquarium/storage';
import {
  applyElapsed,
  feedTank,
  playTank,
  cleanTank,
  feedCreature,
  playCreature,
  hatchEgg,
  MET_THRESHOLD,
} from '../../lib/aquarium/simulation';
import { createSound } from '../../lib/aquarium/sound';

const TICK_MS = 2000;
const TOOLS = [
  { key: 'food', label: 'Food', emoji: '🍤' },
  { key: 'sponge', label: 'Sponge', emoji: '🧽' },
  { key: 'toy', label: 'Toy', emoji: '🎾' },
];

// Click position within an element as 0..1 fractions; guards a zero-size rect.
const rectFraction = (el, clientX, clientY) => {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
  };
};

export default function Aquarium() {
  const { basePath } = useRouter();
  const [tank, setTank] = useState(null);
  const soundRef = useRef(null);
  const tankRef = useRef(null);

  // Mount: load, catch up offline decay, wire sound.
  useEffect(() => {
    const now = Date.now();
    const loaded = loadTank(now);
    const caughtUp = applyElapsed(loaded, now - loaded.lastSeen, now);
    setTank(caughtUp);
    soundRef.current = createSound(caughtUp.soundOn);
  }, []);

  // Persist + slow decay tick while mounted.
  useEffect(() => {
    if (!tank) return undefined;
    const id = setInterval(() => {
      setTank((prev) => {
        if (!prev) return prev;
        const now = Date.now();
        const next = applyElapsed(prev, now - prev.lastSeen, now);
        return saveTank(next, now);
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [tank !== null]);

  const commit = useCallback((updater, cue) => {
    setTank((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (cue && soundRef.current) soundRef.current.play(cue);
      return saveTank(next, Date.now());
    });
  }, []);

  const selectTool = (key) => commit((prev) => ({ ...prev, selectedTool: key }), null);

  const handleTankClick = (e) => {
    if (!tank || e.target !== tankRef.current) return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    if (tank.selectedTool === 'food') commit((prev) => feedTank(prev, x, y), 'nom');
    else if (tank.selectedTool === 'sponge') commit((prev) => cleanTank(prev), 'sparkle');
    else commit((prev) => playTank(prev, x, y), 'pop');
  };

  const handleCreatureClick = (e, id) => {
    e.stopPropagation();
    if (!tank) return;
    if (tank.selectedTool === 'food') commit((prev) => feedCreature(prev, id), 'nom');
    else if (tank.selectedTool === 'sponge') commit((prev) => cleanTank(prev), 'sparkle');
    else commit((prev) => playCreature(prev, id), 'pop');
  };

  const handleHatch = (e) => {
    e.stopPropagation();
    commit((prev) => hatchEgg(prev, Date.now()), 'pop');
  };

  const toggleSound = () =>
    commit((prev) => {
      const soundOn = !prev.soundOn;
      if (soundRef.current) soundRef.current.setEnabled(soundOn);
      return { ...prev, soundOn };
    }, null);

  if (!tank) {
    return (
      <div className={styles.page}>
        <Head>{pwaMetaTags(basePath)}</Head>
      </div>
    );
  }

  const dirty = tank.tankCleanliness < MET_THRESHOLD;

  return (
    <div className={styles.page}>
      <Head>{pwaMetaTags(basePath)}</Head>

      <button
        type="button"
        className={styles.muteToggle}
        aria-pressed={tank.soundOn}
        aria-label={tank.soundOn ? 'Sound on' : 'Sound off'}
        onClick={toggleSound}
      >
        {tank.soundOn ? '🔊' : '🔇'}
      </button>

      <div
        ref={tankRef}
        className={`${styles.tank} ${dirty ? styles.dirty : ''}`}
        onClick={handleTankClick}
        role="presentation"
      >
        {tank.creatures.map((c) => {
          const species = getSpecies(c.species);
          const size = species.sizePx[c.stage];
          const classes = [styles.creature];
          if (c.hunger < MET_THRESHOLD) classes.push(styles.hungry);
          if (c.happiness < MET_THRESHOLD) classes.push(styles.sad);
          return (
            <button
              type="button"
              key={c.id}
              data-testid="creature"
              className={classes.join(' ')}
              style={{
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                fontSize: `${size}px`,
                filter: `hue-rotate(${species.hueDeg}deg)`,
              }}
              aria-label={species.name}
              onClick={(e) => handleCreatureClick(e, c.id)}
            >
              {species.emoji[c.stage]}
            </button>
          );
        })}

        {tank.egg && (
          <button
            type="button"
            data-testid="egg"
            className={styles.egg}
            aria-label="Hatch egg"
            onClick={handleHatch}
          >
            🥚
          </button>
        )}
      </div>

      <div className={styles.palette} role="group" aria-label="Care tools">
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.key}
            className={`${styles.tool} ${tank.selectedTool === tool.key ? styles.selected : ''}`}
            aria-pressed={tank.selectedTool === tool.key}
            aria-label={tool.label}
            onClick={() => selectTool(tool.key)}
          >
            <span aria-hidden="true">{tool.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS module**

```css
/* pages/aquarium/index.module.css */
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  background: #08324a;
}

.muteToggle {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 2;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 3rem;
  height: 3rem;
  font-size: 1.4rem;
  cursor: pointer;
}

.tank {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: linear-gradient(180deg, #0a4a6e 0%, #062f45 100%);
  transition: filter 0.4s ease;
}

.dirty {
  filter: sepia(0.5) hue-rotate(40deg) saturate(1.4) brightness(0.9);
}

.creature {
  position: absolute;
  transform: translate(-50%, -50%);
  border: none;
  background: none;
  padding: 0.5rem;
  cursor: pointer;
  line-height: 1;
  animation: swim 6s ease-in-out infinite alternate;
}

.hungry {
  opacity: 0.6;
}

.sad {
  filter: grayscale(0.6);
  animation-duration: 10s;
}

.egg {
  position: absolute;
  left: 50%;
  bottom: 12%;
  transform: translateX(-50%);
  border: none;
  background: none;
  font-size: 44px;
  cursor: pointer;
  animation: wobble 1.2s ease-in-out infinite;
}

.palette {
  display: flex;
  justify-content: space-around;
  padding: 0.75rem;
  background: #04202f;
}

.tool {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 1rem;
  border: 3px solid transparent;
  background: rgba(255, 255, 255, 0.12);
  font-size: 2rem;
  cursor: pointer;
}

.selected {
  border-color: #ffd54a;
  background: rgba(255, 213, 74, 0.25);
}

@keyframes swim {
  from { transform: translate(-50%, -50%) translateX(-8px); }
  to { transform: translate(-50%, -50%) translateX(8px); }
}

@keyframes wobble {
  0%, 100% { transform: translateX(-50%) rotate(-8deg); }
  50% { transform: translateX(-50%) rotate(8deg); }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Verify the production build accepts the new page**

Run: `npm run build`
Expected: build completes; `/aquarium` appears in the exported routes and no page-under-`pages` test-file error occurs.

- [ ] **Step 7: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css __tests__/pages/aquarium/index.test.jsx
git commit -m "feat: add aquarium page with tools, tank render, and care tick"
```

- [ ] **Step 8: Add drag and long-press gestures**

Enhance the tank and creatures with pointer handlers that reuse the existing action functions:
- Drag with `food` selected → repeated `feedTank(x, y)` sampled along the drag path (throttle to ~1 per 120ms).
- Drag with `sponge` → repeated `cleanTank()` while moving over the glass.
- Drag with `toy` → `playTank(x, y)` following the pointer.
- Long-press (pointer held ≥500ms) on a creature with `toy` → `playCreature(id)`; with `food` → `feedCreature(id)`.
Use `onPointerDown`/`onPointerMove`/`onPointerUp` with a `useRef` to track press start time and last-sample time. Do not add pinch. Keep the tap `onClick` handlers intact.

- [ ] **Step 9: Run the full test suite and commit**

Run: `npm test`
Expected: PASS (all suites).

```bash
git add pages/aquarium/index.jsx
git commit -m "feat: add drag and long-press gestures to aquarium"
```

---

### Task 8: Link the aquarium from the home page

**Files:**
- Modify: `pages/index.jsx` (the Apps `<section>`)

**Interfaces:**
- Consumes: nothing new. Adds a `next/link` to `/aquarium/`.

- [ ] **Step 1: Add the link**

In `pages/index.jsx`, inside the Apps `<section>`, add alongside the other app links:

```jsx
<p>
  <Link href="/aquarium/">Aquarium App</Link>
</p>
```

- [ ] **Step 2: Run the full suite and build**

Run: `npm test && npm run build`
Expected: tests PASS; build completes with `/aquarium` in the routes.

- [ ] **Step 3: Commit**

```bash
git add pages/index.jsx
git commit -m "feat: link aquarium app from home page"
```

---

## Self-Review Notes

- **Spec coverage:** many-creature tank (Task 2 starter + Task 4 hatch), data-driven species (Task 1), tank-wide + directed care with position targeting (Task 3), tank-wide-only clean (Task 3, sponge routes to `cleanTank`), no death / floored decay (Task 2), real-time offline decay (Task 2 `applyElapsed` + Task 7 mount catch-up), one-way care-gated growth (Task 2 growth), egg/hatch stocking with cap (Tasks 3–4), tool-selection interaction with tap/drag/long-press and no pinch (Task 7), visual-only need states (Task 7 CSS classes), WebAudio sound with mute toggle persisted (Tasks 6–7), versioned localStorage with graceful fallback (Task 5). All covered.
- **Type/name consistency:** `applyElapsed(state, elapsedMs, now)`, `feedTank/playTank(state, x, y)`, `feedCreature/playCreature(state, id)`, `cleanTank(state)`, `hatchEgg(state, now, rng)`, `loadTank(now, rng)`, `saveTank(tank, now)`, `getSpecies(key)`, `createSound(enabled)` are used identically across tasks.
- **Guardrails:** no dependency changes; JS only; `pages/` tests placed under `__tests__/`; reuses `clamp`/`generateId`.
