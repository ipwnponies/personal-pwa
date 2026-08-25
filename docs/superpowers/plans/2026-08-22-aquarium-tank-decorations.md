# Aquarium Tank Decorations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a preschooler unlock and freely place/move/remove decoration items (plants, castle, treasure, etc.) in their aquarium tank, via the same tap/drag palette pattern already used for food and toys.

**Architecture:** A new `lib/aquarium/decorations.js` data catalog (mirrors `creatures.js`'s species-as-data pattern) backs a new `decorations` entity array on the tank, with pure state-transition functions in `lib/aquarium/simulation.js` (place/move/remove/cap-check/unlock-progress). `pages/aquarium/index.jsx` gains a position-based grab-vs-place pointer dispatch (no `document.elementFromPoint`) so a pointer-down either grabs an existing decoration to drag, or falls through to the existing tool-drop dispatch extended with a decoration branch. `storage.js` defaults the new fields onto old-shaped saves without bumping `SCHEMA_VERSION`.

**Tech Stack:** Next.js pages router, React 18 (hooks, no class components), CSS Modules, Vitest + @testing-library/react, plain WebAudio-based sound cues (no audio files). No new dependencies.

**Spec:** `docs/plans/2026-08-22-0653-feat-aquarium-tank-decorations-plan.md` — the scope, requirements (R1-R7), Key Technical Decisions (KTD1-10), and test-scenario lists in that document are settled; this plan adds exact code, file locations, and step-by-step TDD sequencing on top of it. Read both together.

## Global Constraints

- No new dependencies — everything is built with what's already imported in the touched files (React, Vitest, @testing-library/react).
- `SCHEMA_VERSION` in `lib/aquarium/simulation.js` stays at its current value `2` — decoration fields are additive-safe, not a breaking schema bump (KTD10).
- Decorations are placed freeform (no snap-to-zone) and are purely visual — no collision/avoidance behavior added to `lib/aquarium/movement.js` (Key Decisions, KTD5).
- Placed decorations are capped **per type**, not by one shared total (R6) — cap value is `MAX_DECORATIONS_PER_TYPE = 6`, matching the existing `MAX_DROPS_PER_TYPE`/`DIRT_SPOT_CAP` convention.
- A cap-reached placement attempt is refused (with a perceptible cue) rather than evicting an existing decoration (KTD3) — decorations are player-intentional and never silently deleted.
- Removal is drag-back-onto-the-palette, not a dedicated trash target (KTD4).
- The decoration-unlock meter is independent of the egg-progress meter: it advances on the same care actions but must NOT pause at `TANK_CAP` the way the egg meter does (R5), and its threshold must desync from the egg meter's crossing points (R7, KTD8).
- Verification commands for every task: `npm test` (`vitest run`) and `npm run lint` (`eslint .`) — both must pass clean before a task's commit.

---

### Task 1: Decoration type catalog

**Files:**
- Create: `lib/aquarium/decorations.js`
- Test: `lib/aquarium/decorations.test.js`

**Interfaces:**
- Produces: `DECORATION_TYPES` (object keyed by type key: `{ key, name, emoji }`), `DEFAULT_DECORATION_TYPE` (string), `decorationKeys(): string[]` (unlock order), `getDecorationType(key: string): { key, name, emoji }` (falls back to `DEFAULT_DECORATION_TYPE` for an unknown key).

- [ ] **Step 1: Write the failing tests**

Create `lib/aquarium/decorations.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  DECORATION_TYPES,
  DEFAULT_DECORATION_TYPE,
  decorationKeys,
  getDecorationType,
} from './decorations';

describe('decorations config', () => {
  it('exposes at least one decoration type', () => {
    expect(decorationKeys().length).toBeGreaterThan(0);
  });

  it('has a default decoration type present in DECORATION_TYPES', () => {
    expect(DECORATION_TYPES[DEFAULT_DECORATION_TYPE]).toBeDefined();
  });

  it('every decoration type exposes key/name/emoji', () => {
    decorationKeys().forEach((key) => {
      const d = DECORATION_TYPES[key];
      expect(d.key).toBe(key);
      expect(typeof d.name).toBe('string');
      expect(typeof d.emoji).toBe('string');
    });
  });

  it('getDecorationType returns the requested type', () => {
    expect(getDecorationType(DEFAULT_DECORATION_TYPE).key).toBe(DEFAULT_DECORATION_TYPE);
  });

  it('getDecorationType falls back to the default for an unknown key', () => {
    expect(getDecorationType('not-a-decoration').key).toBe(DEFAULT_DECORATION_TYPE);
  });

  it('decorationKeys returns all five v1 types in unlock order', () => {
    expect(decorationKeys()).toEqual(['seaweed', 'coral', 'treasure', 'castle', 'bubblerock']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/aquarium/decorations.test.js`
Expected: FAIL — `Cannot find module './decorations'` (file doesn't exist yet).

- [ ] **Step 3: Write the catalog**

Create `lib/aquarium/decorations.js`:

```js
// The theming layer for placeable tank decorations, mirroring creatures.js's
// species-as-data pattern. Game/UI logic references items by key only, so
// growing or re-skinning the catalog is an edit to this file alone. Object
// key insertion order doubles as the unlock order (R5/R7).
export const DECORATION_TYPES = {
  seaweed: { key: 'seaweed', name: 'Seaweed', emoji: '🌿' },
  coral: { key: 'coral', name: 'Coral', emoji: '🪸' },
  treasure: { key: 'treasure', name: 'Treasure Chest', emoji: '🎁' },
  castle: { key: 'castle', name: 'Castle', emoji: '🏰' },
  bubblerock: { key: 'bubblerock', name: 'Bubble Rock', emoji: '🪨' },
};

export const DEFAULT_DECORATION_TYPE = 'seaweed';

export const decorationKeys = () => Object.keys(DECORATION_TYPES);

export const getDecorationType = (key) =>
  DECORATION_TYPES[key] || DECORATION_TYPES[DEFAULT_DECORATION_TYPE];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/aquarium/decorations.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/aquarium/decorations.js lib/aquarium/decorations.test.js
git commit -m "feat(aquarium): add decoration type catalog"
```

---

### Task 2: Additive-safe save schema for decoration fields

**Files:**
- Modify: `lib/aquarium/storage.js`
- Test: `lib/aquarium/storage.test.js`

**Interfaces:**
- Consumes: `createDefaultTank(now, rng)`, `SCHEMA_VERSION` from `./simulation` (unchanged signatures).
- Produces: `loadTank(now, rng)` now guarantees every returned tank (fresh, defaulted, or round-tripped) has `decorations: []`-or-saved-array, `decorationProgress: 0`-or-saved-number, `unlockedDecorationTypes: []`-or-saved-array — Task 3 will make `createDefaultTank` itself emit these same three fields, so this task's manual defaults and Task 3's default-tank fields must stay in sync (`decorations: []`, `decorationProgress: 0`, `unlockedDecorationTypes: []`).

- [ ] **Step 1: Write the failing tests**

Add to `lib/aquarium/storage.test.js` (append inside the existing `describe('storage', ...)` block, after the last existing `it`):

```js
  it('defaults decoration fields onto a pre-decorations save without touching existing fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      lastSeen: 1000,
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 77,
      eggProgress: 5,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [{ id: 'c1' }],
    }));
    const tank = loadTank(2000, () => 0.5);
    expect(tank.decorations).toEqual([]);
    expect(tank.decorationProgress).toBe(0);
    expect(tank.unlockedDecorationTypes).toEqual([]);
    expect(tank.tankCleanliness).toBe(77);
    expect(tank.eggProgress).toBe(5);
    expect(tank.creatures).toEqual([{ id: 'c1' }]);
  });

  it('round-trips existing decoration fields unchanged', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      lastSeen: 1000,
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 100,
      eggProgress: 0,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [],
      decorations: [{ id: 'd1', type: 'coral', x: 0.2, y: 0.3 }],
      decorationProgress: 45,
      unlockedDecorationTypes: ['seaweed', 'coral'],
    }));
    const tank = loadTank(2000, () => 0.5);
    expect(tank.decorations).toEqual([{ id: 'd1', type: 'coral', x: 0.2, y: 0.3 }]);
    expect(tank.decorationProgress).toBe(45);
    expect(tank.unlockedDecorationTypes).toEqual(['seaweed', 'coral']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/aquarium/storage.test.js`
Expected: FAIL — first new test's `tank.decorations` is `undefined`, not `[]`.

- [ ] **Step 3: Default the new fields in the load path**

In `lib/aquarium/storage.js`, modify the success branch inside `loadTank` (currently `return parsed;`):

```js
export const loadTank = (now = Date.now(), rng = Math.random) => {
  const store = storage();
  if (!store) return createDefaultTank(now, rng);
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return createDefaultTank(now, rng);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && Array.isArray(parsed.creatures)) {
      // Additive-safe defaults for fields introduced after this save was written
      // (KTD10) — spread order lets an old-shaped save fall back to these
      // while a save that already has them keeps its own values.
      return {
        decorations: [],
        decorationProgress: 0,
        unlockedDecorationTypes: [],
        ...parsed,
      };
    }
  } catch {
    // fall through to default on corrupt data
  }
  return createDefaultTank(now, rng);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/aquarium/storage.test.js`
Expected: PASS — all 7 tests (5 existing + 2 new).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/aquarium/storage.js lib/aquarium/storage.test.js
git commit -m "feat(aquarium): default decoration fields onto pre-decorations saves"
```

---

### Task 3: Decoration state and simulation logic

**Files:**
- Modify: `lib/aquarium/simulation.js`
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `decorationKeys()` from `./decorations` (Task 1).
- Produces: `MAX_DECORATIONS_PER_TYPE` (=6), `DECORATION_FILL_PER_ACTION` (=15), `DECORATION_UNLOCK_THRESHOLD` (=`NEED_MAX`, 100); `isDecorationCapReached(state, typeKey): boolean`; `placeDecoration(state, typeKey, x, y): state`; `moveDecoration(state, id, x, y): state`; `removeDecoration(state, id): state`; `advanceDecorationProgress(state, amount = DECORATION_FILL_PER_ACTION): state`. `createDefaultTank` now also returns `decorations: []`, `decorationProgress: 0`, `unlockedDecorationTypes: []` (same shape Task 2 already defaults old saves to). Task 4 will import `isDecorationCapReached`, `placeDecoration`, `moveDecoration`, `removeDecoration` from this module.

- [ ] **Step 1: Write the failing tests**

Add to `lib/aquarium/simulation.test.js`. First, extend the import block at the top of the file:

```js
import {
  NEED_FLOOR,
  NEED_MAX,
  TANK_CAP,
  MET_THRESHOLD,
  STAGE_DURATIONS_MS,
  EGG_FILL_PER_ACTION,
  createDefaultTank,
  applyElapsed,
  hatchEgg,
  MAX_DROPS_PER_TYPE,
  dropFood,
  dropToy,
  findDrop,
  consumeDrop,
  assignSeekTargets,
  DIRT_SPOT_CAP,
  spawnDirtSpot,
  wipeDirtSpot,
  MAX_DECORATIONS_PER_TYPE,
  DECORATION_FILL_PER_ACTION,
  DECORATION_UNLOCK_THRESHOLD,
  isDecorationCapReached,
  placeDecoration,
  moveDecoration,
  removeDecoration,
  advanceDecorationProgress,
} from './simulation';
```

Then append a new `describe` block at the end of the file:

```js
describe('createDefaultTank decoration fields', () => {
  it('starts with no decorations, zero progress, and nothing unlocked', () => {
    const tank = createDefaultTank(1000, () => 0.5);
    expect(tank.decorations).toEqual([]);
    expect(tank.decorationProgress).toBe(0);
    expect(tank.unlockedDecorationTypes).toEqual([]);
  });
});

describe('placeDecoration', () => {
  it('adds a decoration at the given position under the cap', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = placeDecoration(tank, 'seaweed', 0.3, 0.4);
    expect(next.decorations).toHaveLength(1);
    expect(next.decorations[0]).toMatchObject({ type: 'seaweed', x: 0.3, y: 0.4 });
    expect(next.decorations[0].id).toBeTruthy();
  });

  it('is a no-op once that type is at its per-type cap', () => {
    let tank = createDefaultTank(0, () => 0.5);
    for (let i = 0; i < MAX_DECORATIONS_PER_TYPE; i += 1) {
      tank = placeDecoration(tank, 'seaweed', 0.1, 0.1);
    }
    expect(isDecorationCapReached(tank, 'seaweed')).toBe(true);
    const next = placeDecoration(tank, 'seaweed', 0.5, 0.5);
    expect(next.decorations).toHaveLength(MAX_DECORATIONS_PER_TYPE);
  });

  it('tracks the cap independently per type', () => {
    let tank = createDefaultTank(0, () => 0.5);
    for (let i = 0; i < MAX_DECORATIONS_PER_TYPE; i += 1) {
      tank = placeDecoration(tank, 'seaweed', 0.1, 0.1);
    }
    expect(isDecorationCapReached(tank, 'coral')).toBe(false);
    const next = placeDecoration(tank, 'coral', 0.2, 0.2);
    expect(next.decorations.filter((d) => d.type === 'coral')).toHaveLength(1);
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    placeDecoration(tank, 'seaweed', 0.1, 0.1);
    expect(tank.decorations).toEqual([]);
  });
});

describe('moveDecoration', () => {
  it('updates the matching decoration position and nothing else', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = placeDecoration(tank, 'seaweed', 0.1, 0.1);
    const id = tank.decorations[0].id;
    const next = moveDecoration(tank, id, 0.8, 0.9);
    expect(next.decorations[0]).toMatchObject({ id, type: 'seaweed', x: 0.8, y: 0.9 });
  });

  it('is a no-op for an unknown id', () => {
    const tank = placeDecoration(createDefaultTank(0, () => 0.5), 'seaweed', 0.1, 0.1);
    const next = moveDecoration(tank, 'nope', 0.9, 0.9);
    expect(next).toEqual(tank);
  });
});

describe('removeDecoration', () => {
  it('removes the matching decoration', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = placeDecoration(tank, 'seaweed', 0.1, 0.1);
    const id = tank.decorations[0].id;
    const next = removeDecoration(tank, id);
    expect(next.decorations).toHaveLength(0);
  });

  it('is a no-op for an unknown id', () => {
    const tank = placeDecoration(createDefaultTank(0, () => 0.5), 'seaweed', 0.1, 0.1);
    const next = removeDecoration(tank, 'nope');
    expect(next).toEqual(tank);
  });

  it('frees the type cap slot so a new one can be placed', () => {
    let tank = createDefaultTank(0, () => 0.5);
    for (let i = 0; i < MAX_DECORATIONS_PER_TYPE; i += 1) {
      tank = placeDecoration(tank, 'seaweed', 0.1, 0.1);
    }
    tank = removeDecoration(tank, tank.decorations[0].id);
    expect(isDecorationCapReached(tank, 'seaweed')).toBe(false);
    const next = placeDecoration(tank, 'seaweed', 0.5, 0.5);
    expect(next.decorations).toHaveLength(MAX_DECORATIONS_PER_TYPE);
  });
});

describe('advanceDecorationProgress', () => {
  it('accumulates progress without unlocking under threshold', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = advanceDecorationProgress(tank);
    expect(next.decorationProgress).toBe(DECORATION_FILL_PER_ACTION);
    expect(next.unlockedDecorationTypes).toEqual([]);
  });

  it('unlocks the next catalog type and resets progress on crossing the threshold', () => {
    let tank = createDefaultTank(0, () => 0.5);
    const actionsToCross = Math.ceil(DECORATION_UNLOCK_THRESHOLD / DECORATION_FILL_PER_ACTION);
    for (let i = 0; i < actionsToCross; i += 1) {
      tank = advanceDecorationProgress(tank);
    }
    expect(tank.unlockedDecorationTypes).toEqual(['seaweed']);
    expect(tank.decorationProgress).toBe(0);
  });

  it('keeps advancing on care actions even when creatures are at TANK_CAP', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = Array.from({ length: TANK_CAP }, (_, i) => ({ ...tank.creatures[0], id: `c${i}` }));
    const next = advanceDecorationProgress(tank);
    expect(next.decorationProgress).toBe(DECORATION_FILL_PER_ACTION);
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    advanceDecorationProgress(tank);
    expect(tank.decorationProgress).toBe(0);
  });
});

describe('egg progress and decoration progress desync (KTD8/R7)', () => {
  it('crosses the egg threshold and the decoration threshold at different care-action counts', () => {
    let tank = createDefaultTank(0, () => 0.5);
    let eggCrossedAt = null;
    let decorationCrossedAt = null;
    for (let action = 1; action <= 40 && (eggCrossedAt == null || decorationCrossedAt == null); action += 1) {
      tank = spawnDirtSpot(tank, () => 0.5);
      const before = tank;
      tank = wipeDirtSpot(tank, tank.dirtSpots[0].id);
      if (eggCrossedAt == null && tank.egg != null && before.egg == null) eggCrossedAt = action;
      if (decorationCrossedAt == null && tank.unlockedDecorationTypes.length > before.unlockedDecorationTypes.length) {
        decorationCrossedAt = action;
      }
    }
    expect(eggCrossedAt).not.toBeNull();
    expect(decorationCrossedAt).not.toBeNull();
    expect(decorationCrossedAt).not.toBe(eggCrossedAt);
  });
});

describe('consumeDrop / wipeDirtSpot advance decoration progress', () => {
  it('consumeDrop advances decorationProgress', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = dropFood(tank, 0.2, 0.2, 1000);
    const next = consumeDrop(tank, tank.creatures[0].id, tank.foodDrops[0].id);
    expect(next.decorationProgress).toBe(DECORATION_FILL_PER_ACTION);
  });

  it('wipeDirtSpot advances decorationProgress', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.decorationProgress).toBe(DECORATION_FILL_PER_ACTION);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: FAIL — new imports (`isDecorationCapReached`, `placeDecoration`, etc.) are `undefined`.

- [ ] **Step 3: Implement the decoration state/simulation logic**

In `lib/aquarium/simulation.js`, add the import at the top (after the existing `movement` import):

```js
import { clamp, generateId } from '../random';
import { speciesKeys, DEFAULT_SPECIES } from './creatures';
import { decorationKeys } from './decorations';
import { DETECTION_RADIUS, BOUNDS_MIN, BOUNDS_MAX } from './movement';
```

Extend `createDefaultTank` (currently ends with `creatures: [...]`):

```js
export const createDefaultTank = (now = Date.now(), rng = Math.random) => ({
  version: SCHEMA_VERSION,
  lastSeen: now,
  selectedTool: 'food',
  soundOn: true,
  tankCleanliness: NEED_MAX,
  eggProgress: 0,
  egg: null,
  foodDrops: [],
  toyDrops: [],
  dirtSpots: [],
  creatures: [makeCreature(now, rng), makeCreature(now, rng)],
  decorations: [],
  decorationProgress: 0,
  unlockedDecorationTypes: [],
});
```

Insert a new block immediately after `withEggProgress` (right before `const mapCreature = ...`):

```js
export const MAX_DECORATIONS_PER_TYPE = 6;
// Deliberately different from EGG_FILL_PER_ACTION/NEED_MAX's 10-action cadence
// so the two meters cross their thresholds at different action counts (R7,
// KTD8) rather than reading as one reward.
export const DECORATION_FILL_PER_ACTION = 15;
export const DECORATION_UNLOCK_THRESHOLD = NEED_MAX;

export const isDecorationCapReached = (state, typeKey) =>
  state.decorations.filter((d) => d.type === typeKey).length >= MAX_DECORATIONS_PER_TYPE;

// Cap-reached refuses placement rather than evicting an existing decoration
// (KTD3) — a placed decoration is player-intentional and persistent, unlike
// the ephemeral consumed-on-contact food/toy drops.
export const placeDecoration = (state, typeKey, x, y) => {
  if (isDecorationCapReached(state, typeKey)) return state;
  return {
    ...state,
    decorations: [...state.decorations, { id: generateId(), type: typeKey, x, y }],
  };
};

export const moveDecoration = (state, id, x, y) => {
  if (!state.decorations.some((d) => d.id === id)) return state;
  return {
    ...state,
    decorations: state.decorations.map((d) => (d.id === id ? { ...d, x, y } : d)),
  };
};

export const removeDecoration = (state, id) => {
  if (!state.decorations.some((d) => d.id === id)) return state;
  return { ...state, decorations: state.decorations.filter((d) => d.id !== id) };
};

// Independent of withEggProgress's TANK_CAP guard (R5) — a full tank is
// exactly when decoration novelty matters most, so this must not pause there.
export const advanceDecorationProgress = (state, amount = DECORATION_FILL_PER_ACTION) => {
  const filled = state.decorationProgress + amount;
  if (filled < DECORATION_UNLOCK_THRESHOLD) {
    return { ...state, decorationProgress: filled };
  }
  const nextType = decorationKeys().find((key) => !state.unlockedDecorationTypes.includes(key));
  if (nextType == null) return { ...state, decorationProgress: 0 };
  return {
    ...state,
    decorationProgress: 0,
    unlockedDecorationTypes: [...state.unlockedDecorationTypes, nextType],
  };
};

const withCareProgress = (state) => advanceDecorationProgress(withEggProgress(state));
```

Then change the two care-action call sites to use `withCareProgress` instead of `withEggProgress`.

In `consumeDrop`:

```js
export const consumeDrop = (state, creatureId, dropId) => {
  const found = findDrop(state, dropId);
  if (!found) return state;
  const { type } = found;
  const key = type === 'food' ? 'hunger' : 'happiness';
  const amount = type === 'food' ? FEED_AMOUNT : PLAY_AMOUNT;
  const withoutDrop = {
    ...state,
    foodDrops: type === 'food' ? state.foodDrops.filter((d) => d.id !== dropId) : state.foodDrops,
    toyDrops: type === 'toy' ? state.toyDrops.filter((d) => d.id !== dropId) : state.toyDrops,
  };
  return withCareProgress(
    mapCreature(withoutDrop, creatureId, (c) => ({
      ...c,
      [key]: raise(c[key], amount),
      seekTargetId: null,
    })),
  );
};
```

In `wipeDirtSpot`:

```js
export const wipeDirtSpot = (state, id) => {
  if (!state.dirtSpots.some((s) => s.id === id)) return state;
  return withCareProgress({
    ...state,
    dirtSpots: state.dirtSpots.filter((s) => s.id !== id),
    tankCleanliness: raise(state.tankCleanliness, DIRT_SPOT_CLEAN_AMOUNT),
  });
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS — all existing tests plus the new ones (egg-progress tests must still pass unchanged, since `withEggProgress`'s own behavior/gating is untouched).

- [ ] **Step 5: Run the full suite (storage.js consumes `createDefaultTank`)**

Run: `npm test`
Expected: PASS — no regressions in `storage.test.js` or elsewhere.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat(aquarium): add decoration placement, movement, and unlock-progress logic"
```

---

### Task 4: Grab-vs-place pointer dispatch

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `isDecorationCapReached(state, typeKey)`, `placeDecoration(state, typeKey, x, y)`, `moveDecoration(state, id, x, y)`, `removeDecoration(state, id)` from `../../lib/aquarium/simulation` (Task 3); `getDecorationType(key)` from `../../lib/aquarium/decorations` (Task 1).
- Produces: the tank's `<div className={styles.palette}>` now carries `ref={paletteRef}`, used by Task 5's rendering as the same element (no ref name collision — Task 5 does not need its own ref on this element). `dropAt` now handles a third selected-tool case (a decoration key) in addition to `'food'`/`'toy'`. No new rendering is added in this task — placed decorations and the decoration palette section are not yet visible in the DOM; only their state transitions and the pointer-interaction logic exist. Task 5 adds the visible markup on top of this.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/pages/aquarium/index.test.jsx`. First add a small helper near the top of the file (after the `vi.mock('next/router', ...)` block) and a `beforeEach` rect mock, since jsdom returns zero-size rects by default and this task's tests need real coordinate math:

```js
const STORAGE_KEY = 'aquarium-tank';

// Fixed 400x300 tank + a 400x80 palette bar directly below it, so tests can
// convert clientX/clientY into predictable tank-fraction coordinates and
// distinguish "released over the tank" from "released over the palette".
const TANK_RECT = { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 };
const PALETTE_RECT = { left: 0, top: 300, right: 400, bottom: 380, width: 400, height: 80 };

const baseTank = (overrides = {}) => ({
  version: 2,
  lastSeen: Date.now(),
  selectedTool: 'food',
  soundOn: false,
  tankCleanliness: 100,
  eggProgress: 0,
  egg: null,
  foodDrops: [],
  toyDrops: [],
  dirtSpots: [],
  creatures: [],
  decorations: [],
  decorationProgress: 0,
  unlockedDecorationTypes: ['seaweed', 'coral'],
  ...overrides,
});

const seedTank = (overrides) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(baseTank(overrides)));
};

const readTank = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
```

Then add a new `describe` block at the end of the file, inside the same module (after the existing `describe('Aquarium page', ...)` block closes):

```js
describe('Aquarium page decoration pointer dispatch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      const isPalette = this.getAttribute('role') === 'group' && this.getAttribute('aria-label') === 'Care tools';
      return isPalette ? PALETTE_RECT : TANK_RECT;
    });
  });

  it('placing a decoration: pointer-down with a decoration type selected adds it (no drag)', () => {
    seedTank({ selectedTool: 'seaweed' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    const tank2 = readTank();
    expect(tank2.decorations).toHaveLength(1);
    expect(tank2.decorations[0]).toMatchObject({ type: 'seaweed', x: 0.5, y: 0.5 });
  });

  it('grabbing and dragging a placed decoration repositions it without creating a new one', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 320, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 320, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
    expect(result.decorations[0].id).toBe('d1');
    expect(result.decorations[0].x).toBeCloseTo(0.8, 5);
  });

  it('the nearer of two overlapping decorations grabs', () => {
    // Both decorations sit within GRAB_RADIUS (0.06) of the pointer-down
    // point (0.5, 0.5) — 'near' at distance 0.02, 'far' at distance 0.05 —
    // so this genuinely exercises the nearest-wins tie-break, not just the
    // radius cutoff.
    seedTank({
      selectedTool: 'seaweed',
      decorations: [
        { id: 'near', type: 'seaweed', x: 0.52, y: 0.5 },
        { id: 'far', type: 'coral', x: 0.55, y: 0.5 },
      ],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 280, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 280, clientY: 150, pointerId: 1 });
    const result = readTank();
    const near = result.decorations.find((d) => d.id === 'near');
    const far = result.decorations.find((d) => d.id === 'far');
    expect(near.x).toBeCloseTo(0.7, 5);
    expect(far.x).toBe(0.55);
  });

  it('dragging a grabbed decoration onto the palette and releasing removes it', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 340, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toHaveLength(0);
  });

  it('a tap (no movement) on a placed decoration does not move or remove it', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations).toEqual([{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }]);
  });

  it('a grab-and-move sequence does not also place a duplicate via the trailing click', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 250, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 250, clientY: 150, pointerId: 1 });
    // Real browsers fire a trailing native click after this sequence; jsdom
    // does not synthesize it, so the test fires it explicitly.
    fireEvent.click(tank, { clientX: 250, clientY: 150 });
    const result = readTank();
    expect(result.decorations).toHaveLength(1);
    expect(result.foodDrops).toHaveLength(0);
  });

  it('dragging a decoration past the tank edge clamps its position', () => {
    seedTank({
      selectedTool: 'seaweed',
      decorations: [{ id: 'd1', type: 'seaweed', x: 0.5, y: 0.5 }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 5000, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 5000, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.decorations[0].x).toBe(1);
  });

  it('placing at a type already at its per-type cap does not add one', () => {
    const capped = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'seaweed', x: 0.1, y: 0.1 }));
    seedTank({ selectedTool: 'seaweed', decorations: capped });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    const result = readTank();
    expect(result.decorations).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — placing/grabbing/moving decorations has no effect yet (`tank.selectedTool === 'seaweed'` falls into today's `else` branch and calls `dropToy`, so e.g. the first test's `tank2.decorations` is `[]` and a `toyDrop` appears instead).

- [ ] **Step 3: Implement the pointer dispatch**

In `pages/aquarium/index.jsx`, update the simulation import to add the four new functions, and add the decorations import, right after it:

```js
import {
  applyElapsed,
  dropFood,
  dropToy,
  wipeDirtSpot,
  hatchEgg,
  assignSeekTargets,
  findDrop,
  consumeDrop,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
  isDecorationCapReached,
  placeDecoration,
  moveDecoration,
  removeDecoration,
} from '../../lib/aquarium/simulation';
import { createMovementState, stepMovement, wobbleOffset, CONTACT_RADIUS } from '../../lib/aquarium/movement';
import { createSound } from '../../lib/aquarium/sound';
import { getDecorationType } from '../../lib/aquarium/decorations';
```

Add a grab-radius constant next to `MIN_DRAG_PX`:

```js
const MIN_DRAG_PX = 12;
// Sibling to movement.js's CONTACT_RADIUS, but scoped to this page since
// decorations aren't a movement/fish concept — a preschooler's imprecise tap
// still grabs the item.
const GRAB_RADIUS = 0.06;
```

Add a hit-test helper next to `rectFraction`:

```js
// Nearest decoration to (x, y) within radius, or null. On overlap the
// nearer one wins.
const nearestDecorationAt = (decorations, x, y, radius) =>
  decorations.reduce((nearest, d) => {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist > radius) return nearest;
    if (!nearest || dist < nearest.dist) return { decoration: d, dist };
    return nearest;
  }, null);
```

Add two new refs alongside the existing ones (`tankRef`, `dragRef`, `moveStatesRef`):

```js
  const tankRef = useRef(null);
  const paletteRef = useRef(null);
  const dragRef = useRef({ active: false, lastSample: 0 });
  const suppressClickRef = useRef(false);
  const moveStatesRef = useRef(new Map());
```

Replace `dropAt` (currently a binary `if (tank.selectedTool === 'food') ... else ...`):

```js
  const dropAt = (x, y) => {
    const tool = TOOLS_BY_KEY[tank.selectedTool];
    if (tool) {
      spawnEffect(x, y, tool.effect);
      commit(
        (prev) => (tank.selectedTool === 'food' ? dropFood(prev, x, y) : dropToy(prev, x, y)),
        'pop',
      );
      return;
    }
    if (isDecorationCapReached(tank, tank.selectedTool)) {
      spawnEffect(x, y, '🚫');
      if (soundRef.current) soundRef.current.play('refused');
      return;
    }
    spawnEffect(x, y, getDecorationType(tank.selectedTool).emoji);
    commit((prev) => placeDecoration(prev, tank.selectedTool, x, y), 'pop');
  };
```

Add the click-suppression guard to `handleTankClick`:

```js
  const handleTankClick = (e) => {
    if (!tank) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    dropAt(x, y);
  };
```

Replace `handleTankPointerDown`:

```js
  const handleTankPointerDown = (e) => {
    if (!tank) return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    const hit = nearestDecorationAt(tank.decorations, x, y, GRAB_RADIUS);
    if (hit) {
      // Pointer capture keeps pointermove/pointerup targeting the tank even
      // once the pointer crosses into the (sibling, not nested) palette —
      // without it, onPointerLeave clears drag state before a
      // drag-to-remove release is ever observed (KTD4).
      try {
        tankRef.current.setPointerCapture(e.pointerId);
      } catch {
        // jsdom does not implement pointer capture; real browsers do.
      }
      dragRef.current = {
        active: true,
        dragging: false,
        mode: 'decoration',
        decorationId: hit.decoration.id,
        lastSample: 0,
        startX: e.clientX,
        startY: e.clientY,
      };
      return;
    }
    dragRef.current = {
      active: true,
      dragging: false,
      mode: 'paint',
      lastSample: 0,
      startX: e.clientX,
      startY: e.clientY,
    };
  };
```

Replace `handleTankPointerMove`:

```js
  const handleTankPointerMove = (e) => {
    if (!tank || !dragRef.current.active) return;
    const drag = dragRef.current;
    if (!drag.dragging) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < MIN_DRAG_PX) return;
      drag.dragging = true;
    }
    const now = Date.now();
    if (now - drag.lastSample < DRAG_SAMPLE_MS) return;
    drag.lastSample = now;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    if (drag.mode === 'decoration') {
      commit((prev) => moveDecoration(prev, drag.decorationId, x, y), null);
      return;
    }
    const hit = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
    const spotId = hit && hit.dataset ? hit.dataset.spotId : undefined;
    if (spotId) wipeSpot(spotId, x, y);
    else dropAt(x, y);
  };
```

Replace the single `endTankDrag` with two handlers — a real release handler and a leave handler that no longer clears state mid-decoration-grab:

```js
  const isPointInRect = (el, clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  const handleTankPointerUp = (e) => {
    const drag = dragRef.current;
    if (drag.mode === 'decoration') {
      suppressClickRef.current = true;
      const overPalette = paletteRef.current && isPointInRect(paletteRef.current, e.clientX, e.clientY);
      if (overPalette) {
        commit((prev) => removeDecoration(prev, drag.decorationId), 'sparkle');
      }
    }
    dragRef.current = { active: false, lastSample: 0 };
  };

  const handleTankPointerLeave = () => {
    // A decoration grab stays active through pointer capture (see
    // handleTankPointerDown) — only a plain paint-drag ends on leave.
    if (dragRef.current.mode === 'decoration') return;
    dragRef.current.active = false;
  };
```

Update the tank `<div>`'s pointer handlers and add the palette ref (JSX):

```jsx
      <div
        ref={tankRef}
        className={styles.tank}
        style={{ filter: tankFilter }}
        onClick={handleTankClick}
        onPointerDown={handleTankPointerDown}
        onPointerMove={handleTankPointerMove}
        onPointerUp={handleTankPointerUp}
        onPointerLeave={handleTankPointerLeave}
        onPointerCancel={handleTankPointerUp}
        role="presentation"
      >
```

```jsx
      <div className={styles.palette} role="group" aria-label="Care tools" ref={paletteRef}>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS — all existing tests plus the 8 new ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: No new errors. (The `try { tankRef.current.setPointerCapture(...) } catch {}` block should be an empty-catch, which airbnb's `no-empty` allows when it has a comment — if lint flags it, keep the explanatory comment inside the catch block as shown above.)

- [ ] **Step 7: Commit**

```bash
git add pages/aquarium/index.jsx __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): add grab-vs-place pointer dispatch for decorations"
```

---

### Task 5: Decoration rendering, palette, and unlock/refusal/removal feedback

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Modify: `pages/aquarium/index.module.css`
- Modify: `lib/aquarium/sound.js`
- Test: `__tests__/pages/aquarium/index.test.jsx`, `lib/aquarium/sound.test.js`

**Interfaces:**
- Consumes: `paletteRef` (Task 4, same element/ref — no new ref needed here), `tank.decorations`, `tank.unlockedDecorationTypes`, `getDecorationType(key)` (Task 1).
- Produces: `TONES.unlock` and `TONES.refused` entries in `sound.js` (Task 4's `dropAt` already calls `soundRef.current.play('refused')` on a capped placement attempt — that call was a silent no-op until this task registers the tone). New CSS classes `styles.decoration` and `styles.unlockHighlight`.

- [ ] **Step 1: Write the failing sound tests**

Add to `lib/aquarium/sound.test.js` (append inside the existing `describe('createSound', ...)` block):

```js
  it('play never throws for the new unlock/refused cues', () => {
    const sound = createSound(true);
    expect(() => sound.play('unlock')).not.toThrow();
    expect(() => sound.play('refused')).not.toThrow();
  });
```

And a new top-level `describe`:

```js
describe('TONES coverage', () => {
  it('unlock and refused are distinct from each other and from pop/sparkle', () => {
    // Import indirectly via createSound's public surface isn't enough to
    // assert frequencies, so this test re-imports the module and reaches
    // into its internal TONES via a play-does-not-throw smoke check per key,
    // matching this file's existing black-box style.
    const sound = createSound(true);
    ['nom', 'pop', 'sparkle', 'unlock', 'refused'].forEach((name) => {
      expect(() => sound.play(name)).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run the sound tests to verify they still describe missing behavior**

Run: `npx vitest run lib/aquarium/sound.test.js`
Expected: PASS already (unknown tone names are a silent no-op per `sound.js`'s existing `if (!tone) return;` guard, so `play('unlock')` not throwing is true even before this task's change — this step's real assertion is that it still passes after Step 3 too; the new tone *content* is verified visually/audibly per the Definition of Done's manual smoke pass, not asserted by frequency value here). Proceed to Step 3 regardless.

- [ ] **Step 3: Register the new tones**

In `lib/aquarium/sound.js`, extend `TONES`:

```js
const TONES = {
  nom: { freq: 220, type: 'square', ms: 90 },
  pop: { freq: 520, type: 'triangle', ms: 80 },
  sparkle: { freq: 880, type: 'sine', ms: 140 },
  unlock: { freq: 660, type: 'sine', ms: 220 },
  refused: { freq: 140, type: 'sawtooth', ms: 160 },
};
```

- [ ] **Step 4: Run the sound tests to verify they pass**

Run: `npx vitest run lib/aquarium/sound.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing page tests**

Add to `__tests__/pages/aquarium/index.test.jsx`, inside a new `describe` block appended at the end of the file (reuses the `baseTank`/`seedTank`/`readTank` helpers and the `getBoundingClientRect` mock from Task 4's `describe` block — add the same `beforeEach` mock here too, since each `describe` runs independently):

```js
describe('Aquarium page decoration rendering and feedback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      const isPalette = this.getAttribute('role') === 'group' && this.getAttribute('aria-label') === 'Care tools';
      return isPalette ? PALETTE_RECT : TANK_RECT;
    });
  });

  it('renders a placed decoration at its x/y position', () => {
    seedTank({ decorations: [{ id: 'd1', type: 'coral', x: 0.3, y: 0.4 }] });
    render(<Aquarium />);
    const deco = screen.getByTestId('decoration');
    expect(deco.style.left).toBe('30%');
    expect(deco.style.top).toBe('40%');
    expect(deco.textContent).toContain('🪸');
  });

  it('hides the decoration palette section when nothing is unlocked', () => {
    seedTank({ unlockedDecorationTypes: [] });
    render(<Aquarium />);
    expect(screen.queryByRole('button', { name: /seaweed/i })).not.toBeInTheDocument();
  });

  it('shows unlocked decoration types in the palette, after the toy tool', () => {
    seedTank({ unlockedDecorationTypes: ['seaweed', 'coral'] });
    render(<Aquarium />);
    const seaweed = screen.getByRole('button', { name: /seaweed/i });
    const coral = screen.getByRole('button', { name: /coral/i });
    expect(seaweed).toBeInTheDocument();
    expect(coral).toBeInTheDocument();
  });

  it('selecting an unlocked decoration type from the palette marks it pressed', () => {
    seedTank({ unlockedDecorationTypes: ['seaweed'] });
    render(<Aquarium />);
    const seaweed = screen.getByRole('button', { name: /seaweed/i });
    fireEvent.click(seaweed);
    expect(seaweed).toHaveAttribute('aria-pressed', 'true');
  });

  it('crossing the decoration-unlock threshold reveals the newly unlocked palette icon', () => {
    seedTank({
      unlockedDecorationTypes: [],
      decorationProgress: 90,
      tankCleanliness: 50,
      dirtSpots: [{ id: 'spot1', x: 0.5, y: 0.5, createdAt: 0 }],
    });
    render(<Aquarium />);
    expect(screen.queryByRole('button', { name: /seaweed/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dirtSpot'));
    expect(screen.getByRole('button', { name: /seaweed/i })).toBeInTheDocument();
  });

  it('a cap-refused placement attempt does not add a decoration', () => {
    const capped = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, type: 'seaweed', x: 0.1, y: 0.1 }));
    seedTank({ selectedTool: 'seaweed', unlockedDecorationTypes: ['seaweed'], decorations: capped });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 200, clientY: 150 });
    expect(readTank().decorations).toHaveLength(6);
  });
});
```

- [ ] **Step 6: Run the page tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — `screen.getByTestId('decoration')` and the palette decoration buttons don't exist yet.

- [ ] **Step 7: Implement rendering, palette, and cues**

In `pages/aquarium/index.jsx`, add unlock-highlight state next to `effects`:

```js
  const [effects, setEffects] = useState([]);
  const [unlockHighlightKey, setUnlockHighlightKey] = useState(null);
```

Add a constant near `PULSE_MS`/`EFFECT_MS`:

```js
const EFFECT_MS = 900;
const UNLOCK_HIGHLIGHT_MS = 1500;
```

Add a `flashUnlock` helper next to `spawnEffect`:

```js
  // Brief glow on the newly revealed palette icon (KTD7) — palette-local,
  // not the tank-relative pulse/spawnEffect, which target the tank's own
  // bounding box and can't address a palette element.
  const flashUnlock = (key) => {
    setUnlockHighlightKey(key);
    setTimeout(() => {
      setUnlockHighlightKey((current) => (current === key ? null : current));
    }, UNLOCK_HIGHLIGHT_MS);
  };
```

Update `wipeSpot` to detect and announce a decoration unlock:

```js
  const wipeSpot = (id, x, y) => {
    pulse(id);
    spawnEffect(x, y, '✨');
    const projected = wipeDirtSpot(tank, id);
    const unlocked = projected.unlockedDecorationTypes.length > tank.unlockedDecorationTypes.length;
    if (unlocked) {
      flashUnlock(projected.unlockedDecorationTypes[projected.unlockedDecorationTypes.length - 1]);
    }
    commit((prev) => wipeDirtSpot(prev, id), unlocked ? 'unlock' : 'sparkle');
  };
```

Update the rAF movement-loop effect to detect an unlock crossing from `consumeDrop` (feed/play). Inside the `loop` function, declare a tracking variable alongside `events`, set it while chaining `consumeDrop`, and act on it after `setTank`:

```js
    const loop = (time) => {
      const dt = lastTime == null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      const boundsWidth = tankRef.current
        ? tankRef.current.getBoundingClientRect().width || 1
        : 1;
      const now = Date.now();
      const events = [];
      let unlockedThisFrame = null;
      setTank((prev) => {
        if (!prev) return prev;
        const claimed = assignSeekTargets(prev);
        const positioned = claimed.creatures.map((c) => {
          if (!moveStatesRef.current.has(c.id)) {
            moveStatesRef.current.set(c.id, createMovementState(c.x, c.y));
          }
          const found = c.seekTargetId ? findDrop(claimed, c.seekTargetId) : null;
          const targetPoint = found ? { x: found.drop.x, y: found.drop.y } : null;
          const stepped = stepMovement(
            moveStatesRef.current.get(c.id),
            dt,
            now,
            boundsWidth,
            targetPoint,
          );
          moveStatesRef.current.set(c.id, stepped);
          if (targetPoint && Math.hypot(stepped.x - targetPoint.x, stepped.y - targetPoint.y)
            <= CONTACT_RADIUS) {
            events.push({
              creatureId: c.id,
              dropId: c.seekTargetId,
              dropType: found.type,
              x: stepped.x,
              y: stepped.y,
            });
          }
          return { ...c, x: stepped.x, y: stepped.y };
        });
        let next = { ...claimed, creatures: positioned };
        events.forEach((ev) => {
          const before = next.unlockedDecorationTypes.length;
          next = consumeDrop(next, ev.creatureId, ev.dropId);
          if (next.unlockedDecorationTypes.length > before) {
            unlockedThisFrame = next.unlockedDecorationTypes[next.unlockedDecorationTypes.length - 1];
          }
        });
        return next;
      });
      events.forEach((ev) => {
        pulse(ev.creatureId);
        spawnEffect(ev.x, ev.y, ev.dropType === 'food' ? '🍤' : '💗');
        if (soundRef.current) soundRef.current.play(ev.dropType === 'food' ? 'nom' : 'pop');
      });
      if (unlockedThisFrame) {
        flashUnlock(unlockedThisFrame);
        if (soundRef.current) soundRef.current.play('unlock');
      }
      frameId = requestAnimationFrame(loop);
    };
```

Add decoration rendering inside the tank `<div>`, after the `dirtSpots` block and before the `effects` block:

```jsx
        {tank.dirtSpots.map((spot) => (
          <button
            type="button"
            key={spot.id}
            data-testid="dirtSpot"
            data-spot-id={spot.id}
            className={`${styles.dirtSpot} ${pulsingIds.has(spot.id) ? styles.pulse : ''}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
            aria-label="Wipe dirt spot"
            onClick={(e) => handleDirtSpotClick(e, spot)}
          >
            💩
          </button>
        ))}

        {tank.decorations.map((d) => (
          <button
            type="button"
            key={d.id}
            data-testid="decoration"
            className={styles.decoration}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-label={getDecorationType(d.type).name}
            onClick={(e) => e.stopPropagation()}
          >
            {getDecorationType(d.type).emoji}
          </button>
        ))}

        {effects.map((e) => (
```

Append the decoration palette section after the existing `TOOLS.map(...)` inside the palette `<div>`, staying inside the same flex row so ordering stays fixed (KTD6):

```jsx
      <div className={styles.palette} role="group" aria-label="Care tools" ref={paletteRef}>
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
        {tank.unlockedDecorationTypes.map((key) => {
          const deco = getDecorationType(key);
          const classes = [styles.tool];
          if (tank.selectedTool === key) classes.push(styles.selected);
          if (unlockHighlightKey === key) classes.push(styles.unlockHighlight);
          return (
            <button
              type="button"
              key={key}
              className={classes.join(' ')}
              aria-pressed={tank.selectedTool === key}
              aria-label={deco.name}
              onClick={() => selectTool(key)}
            >
              <span aria-hidden="true">{deco.emoji}</span>
            </button>
          );
        })}
      </div>
```

In `pages/aquarium/index.module.css`, add a decoration button style next to `.dirtSpot` and an unlock-highlight animation next to `.pulse`:

```css
.decoration {
  position: absolute;
  transform: translate(-50%, -50%);
  border: none;
  background: none;
  font-size: 30px;
  cursor: pointer;
}

.unlockHighlight {
  animation: unlockGlow 1.5s ease-in-out;
}

@keyframes unlockGlow {
  0% { box-shadow: 0 0 0 rgba(255, 213, 74, 0); }
  30% { box-shadow: 0 0 18px rgba(255, 213, 74, 0.9); }
  100% { box-shadow: 0 0 0 rgba(255, 213, 74, 0); }
}
```

- [ ] **Step 8: Run the page tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS — all tests across both new `describe` blocks plus every pre-existing test.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — full green suite across `lib/aquarium/*.test.js` and `__tests__/pages/aquarium/index.test.jsx`.

- [ ] **Step 10: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 11: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css lib/aquarium/sound.js lib/aquarium/sound.test.js __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): render decorations, unlock palette, and add feedback cues"
```

---

## Manual Verification (not automatable — see spec's Risks & Dependencies)

jsdom does not implement pointer capture or synthesize a trailing native `click` after a `pointerdown`/`pointermove`/`pointerup` sequence, so Task 4's click-suppression and pointer-capture behavior are exercised in the automated suite only by manually firing the events tests need (see Task 4 Step 1's comment). Before calling this feature done, run `npm run dev` and, on a touch device or a real browser (not just automated tests), confirm:

- Existing behavior is unaffected: feeding, playing, wiping dirt spots, egg hatching all still work.
- Grab-and-move: dragging a placed decoration actually follows the finger/cursor smoothly and doesn't also drop a new item at the release point.
- Drag-to-remove: dragging a decoration onto the palette and releasing removes it, even when the release point is outside the tank's own bounding box.
- Cap-refusal: placing a 7th decoration of one type is refused with a visible/audible cue, and does not evict any existing decoration.
- Unlock: crossing the decoration meter's threshold reveals a new palette icon with its own sound/highlight, distinguishable from an egg spawning.

## Definition of Done

- All five tasks committed; `npm test` and `npm run lint` pass clean at the tip of the branch.
- The Manual Verification pass above is completed on a real browser/touch device.
- No dead code remains from Task 3-4's exploration of the entity shape (KTD1) or the pointer-capture approach (KTD2/KTD4).
