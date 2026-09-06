# Aquarium Fishing Mini-Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 🎣 Fishing tool to the aquarium — cast-drag gesture, a
distance/hidden-attraction bite race among the player's own fish, a
reel-in-to-catch mechanic, and a reversible catch bucket with hold-to-delete
discard.

**Architecture:** A new pure module `lib/aquarium/fishing.js` holds bite-chance
math and bucket state transitions. No changes to `lib/aquarium/movement.js`'s
movement logic — the bite race reuses `stepMovement`'s existing
`target`/`affinity` parameters with a bait position and a randomized
per-fish attraction value standing in for a food/toy target and
need-derived affinity. `lib/aquarium/simulation.js` and `storage.js` gain a
purely-additive `tank.bucket` field. All gesture/UI wiring lives in
`pages/aquarium/index.jsx`, following this codebase's existing
not-yet-split-into-components convention.

**Tech Stack:** React 18 (Next.js pages), Vitest + React Testing Library,
CSS Modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-aquarium-fishing-design.md`

## Global Constraints

- The cast-start zone must be inset from the tank's literal top edge (the OS
  reserves that strip for its own edge-swipe gesture, which the browser
  cannot intercept) — implemented as a `SURFACE_LINE_FRAC = 0.12` band.
- No changes to `lib/aquarium/movement.js`'s wander/seek/arrive logic — only
  export the already-existing `easeToward` helper.
- `tank.bucket` is purely additive: no `SCHEMA_VERSION` bump, just added to
  `loadTank`'s existing defaults spread, matching the `decorations`/
  `unlockedDecorationTypes` precedent.
- Sound cues reuse existing keys only (`pop`, `sparkle`) — no new audio
  assets.
- Single line, one hookable fish at a time — no concurrent casts.
- No new dependencies or dependency version changes.

---

## Task 1: Add the persisted `bucket` field

**Files:**
- Modify: `lib/aquarium/simulation.js` (`createDefaultTank`)
- Modify: `lib/aquarium/storage.js` (`loadTank`)
- Test: `lib/aquarium/simulation.test.js`
- Test: `lib/aquarium/storage.test.js`

**Interfaces:**
- Produces: `tank.bucket` — an array of creature objects (same shape as
  `tank.creatures` entries), present on every tank returned by
  `createDefaultTank`/`loadTank`.

- [ ] **Step 1: Write the failing tests**

In `lib/aquarium/simulation.test.js`, add:

```js
describe('createDefaultTank bucket field', () => {
  it('starts with an empty bucket', () => {
    const tank = createDefaultTank(1000, () => 0.5);
    expect(tank.bucket).toEqual([]);
  });
});
```

In `lib/aquarium/storage.test.js`, add (after the existing decoration-field
tests):

```js
it('defaults bucket onto a pre-fishing save without touching existing fields', () => {
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
    decorations: [],
    decorationProgress: 0,
    unlockedDecorationTypes: [],
  }));
  const tank = loadTank(2000, () => 0.5);
  expect(tank.bucket).toEqual([]);
  expect(tank.creatures).toEqual([{ id: 'c1' }]);
});

it('round-trips an existing bucket unchanged', () => {
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
    decorations: [],
    decorationProgress: 0,
    unlockedDecorationTypes: [],
    bucket: [{ id: 'b1', species: 'clownfish' }],
  }));
  const tank = loadTank(2000, () => 0.5);
  expect(tank.bucket).toEqual([{ id: 'b1', species: 'clownfish' }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js lib/aquarium/storage.test.js`
Expected: FAIL — `tank.bucket` is `undefined` in both new tests.

- [ ] **Step 3: Implement**

In `lib/aquarium/simulation.js`, add `bucket: []` to `createDefaultTank`'s
returned object (alongside the other array fields):

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
  bucket: [],
});
```

In `lib/aquarium/storage.js`, add `bucket: []` to `loadTank`'s
additive-safe defaults spread:

```js
      return {
        decorations: [],
        decorationProgress: 0,
        unlockedDecorationTypes: [],
        bucket: [],
        ...parsed,
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js lib/aquarium/storage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/storage.js lib/aquarium/simulation.test.js lib/aquarium/storage.test.js
git commit -m "feat(aquarium): add persisted bucket field for caught fish"
```

---

## Task 2: `lib/aquarium/fishing.js` — bite chance and bucket transitions

**Files:**
- Create: `lib/aquarium/fishing.js`
- Test: `lib/aquarium/fishing.test.js`

**Interfaces:**
- Consumes: `clamp` from `lib/random.js`; `DETECTION_RADIUS` from
  `lib/aquarium/movement.js`; `tank.creatures`/`tank.bucket` shape from
  Task 1.
- Produces:
  - `FISHING_DETECTION_RADIUS: number`
  - `BITE_TICK_MS: number`
  - `BITE_CHANCE_BASE: number`
  - `SNOWBALL_BOOST: number`
  - `generateHiddenAttraction(rng = Math.random): number`
  - `computeBiteChance(dist: number, radius: number, hiddenAttraction: number, gotCloser: boolean): number`
  - `catchFish(state, creatureId): state`
  - `returnFish(state, creatureId): state`
  - `deleteFromBucket(state, creatureId): state`

- [ ] **Step 1: Write the failing tests**

Create `lib/aquarium/fishing.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  FISHING_DETECTION_RADIUS,
  BITE_CHANCE_BASE,
  SNOWBALL_BOOST,
  generateHiddenAttraction,
  computeBiteChance,
  catchFish,
  returnFish,
  deleteFromBucket,
} from './fishing';
import { createDefaultTank } from './simulation';

describe('generateHiddenAttraction', () => {
  it('returns the rng output directly', () => {
    expect(generateHiddenAttraction(() => 0.42)).toBe(0.42);
  });

  it('defaults to Math.random without throwing', () => {
    expect(() => generateHiddenAttraction()).not.toThrow();
  });
});

describe('computeBiteChance', () => {
  it('is higher for a closer fish at the same attraction', () => {
    const near = computeBiteChance(0.05, FISHING_DETECTION_RADIUS, 1, false);
    const far = computeBiteChance(0.3, FISHING_DETECTION_RADIUS, 1, false);
    expect(near).toBeGreaterThan(far);
  });

  it('scales linearly with hidden attraction', () => {
    const low = computeBiteChance(0.1, FISHING_DETECTION_RADIUS, 0.2, false);
    const high = computeBiteChance(0.1, FISHING_DETECTION_RADIUS, 0.8, false);
    expect(high).toBeCloseTo(low * 4, 5);
  });

  it('applies the snowball boost only when the fish got closer', () => {
    const steady = computeBiteChance(0.1, FISHING_DETECTION_RADIUS, 0.5, false);
    const closing = computeBiteChance(0.1, FISHING_DETECTION_RADIUS, 0.5, true);
    expect(closing).toBeCloseTo(steady * SNOWBALL_BOOST, 5);
  });

  it('is 0 at or beyond the detection radius', () => {
    expect(computeBiteChance(FISHING_DETECTION_RADIUS, FISHING_DETECTION_RADIUS, 1, false)).toBe(0);
    expect(computeBiteChance(FISHING_DETECTION_RADIUS * 2, FISHING_DETECTION_RADIUS, 1, false)).toBe(0);
  });

  it('is always clamped to [0, 1] even with an inflated attraction value', () => {
    expect(computeBiteChance(0, FISHING_DETECTION_RADIUS, 100, true)).toBeLessThanOrEqual(1);
  });

  it('matches BITE_CHANCE_BASE at point-blank range, full attraction, no snowball', () => {
    expect(computeBiteChance(0, FISHING_DETECTION_RADIUS, 1, false)).toBeCloseTo(BITE_CHANCE_BASE, 5);
  });
});

describe('catchFish', () => {
  it('moves the creature from creatures to bucket', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const id = tank.creatures[0].id;
    const next = catchFish(tank, id);
    expect(next.creatures.some((c) => c.id === id)).toBe(false);
    expect(next.bucket.some((c) => c.id === id)).toBe(true);
  });

  it('is a no-op for an unknown creature id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = catchFish(tank, 'nope');
    expect(next).toEqual(tank);
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const before = tank.creatures.length;
    catchFish(tank, tank.creatures[0].id);
    expect(tank.creatures).toHaveLength(before);
  });
});

describe('returnFish', () => {
  it('moves the creature from bucket back to creatures', () => {
    let tank = createDefaultTank(0, () => 0.5);
    const id = tank.creatures[0].id;
    tank = catchFish(tank, id);
    const next = returnFish(tank, id);
    expect(next.bucket.some((c) => c.id === id)).toBe(false);
    expect(next.creatures.some((c) => c.id === id)).toBe(true);
  });

  it('is a no-op for an unknown creature id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = returnFish(tank, 'nope');
    expect(next).toEqual(tank);
  });
});

describe('deleteFromBucket', () => {
  it('removes the creature from the bucket permanently', () => {
    let tank = createDefaultTank(0, () => 0.5);
    const id = tank.creatures[0].id;
    tank = catchFish(tank, id);
    const next = deleteFromBucket(tank, id);
    expect(next.bucket).toHaveLength(0);
    expect(next.creatures.some((c) => c.id === id)).toBe(false);
  });

  it('is a no-op for an unknown creature id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = deleteFromBucket(tank, 'nope');
    expect(next).toEqual(tank);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/fishing.test.js`
Expected: FAIL — `./fishing` does not exist.

- [ ] **Step 3: Implement**

Create `lib/aquarium/fishing.js`:

```js
import { clamp } from '../random';
import { DETECTION_RADIUS } from './movement';

// Reuses movement.js's existing detection radius rather than introducing a
// second magic number for "how close counts as in range".
export const FISHING_DETECTION_RADIUS = DETECTION_RADIUS;
// Cadence of bite rolls during an active cast. More ticks before any fish
// reaches the hook means more dynamism (a real race, not a foregone
// conclusion) — starting point, may need a calibration pass once playable.
export const BITE_TICK_MS = 400;
export const BITE_CHANCE_BASE = 0.15;
// Multiplier applied when a fish has moved closer to the bait since the
// previous tick, so distance and chance compound rather than each tick
// being an independent roll.
export const SNOWBALL_BOOST = 1.5;

// The randomized affinity source fishing substitutes for
// simulation.js's need-derived computeAffinity — same [0, 1] range, same
// ephemeral (never persisted) per-fish generation as movement.js's
// cruiseSpeed.
export const generateHiddenAttraction = (rng = Math.random) => rng();

export const computeBiteChance = (dist, radius, hiddenAttraction, gotCloser) => {
  const proximity = clamp(1 - dist / radius, 0, 1);
  const snowball = gotCloser ? SNOWBALL_BOOST : 1;
  return clamp(BITE_CHANCE_BASE * proximity * hiddenAttraction * snowball, 0, 1);
};

export const catchFish = (state, creatureId) => {
  const creature = state.creatures.find((c) => c.id === creatureId);
  if (!creature) return state;
  return {
    ...state,
    creatures: state.creatures.filter((c) => c.id !== creatureId),
    bucket: [...state.bucket, creature],
  };
};

export const returnFish = (state, creatureId) => {
  const creature = state.bucket.find((c) => c.id === creatureId);
  if (!creature) return state;
  return {
    ...state,
    bucket: state.bucket.filter((c) => c.id !== creatureId),
    creatures: [...state.creatures, creature],
  };
};

export const deleteFromBucket = (state, creatureId) => {
  if (!state.bucket.some((c) => c.id === creatureId)) return state;
  return { ...state, bucket: state.bucket.filter((c) => c.id !== creatureId) };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/fishing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/fishing.js lib/aquarium/fishing.test.js
git commit -m "feat(aquarium): add fishing bite-chance and bucket-transition logic"
```

---

## Task 3: Export `easeToward` from `movement.js`

**Files:**
- Modify: `lib/aquarium/movement.js`
- Test: `lib/aquarium/movement.test.js`

**Interfaces:**
- Produces: `easeToward(current: number, target: number, maxDelta: number): number`
  — already implemented internally; this task only makes it public so the
  page can reuse it for the rod-tip line-lag animation instead of
  duplicating the easing math.

- [ ] **Step 1: Write the failing tests**

In `lib/aquarium/movement.test.js`, add `easeToward` to the import list and
add:

```js
describe('easeToward', () => {
  it('moves partway to the target when the gap exceeds maxDelta', () => {
    expect(easeToward(0, 1, 0.3)).toBeCloseTo(0.3, 5);
  });

  it('snaps to the target when within maxDelta', () => {
    expect(easeToward(0.9, 1, 0.3)).toBe(1);
  });

  it('eases downward the same way it eases upward', () => {
    expect(easeToward(1, 0, 0.3)).toBeCloseTo(0.7, 5);
  });

  it('is a no-op when already at the target', () => {
    expect(easeToward(0.5, 0.5, 0.3)).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: FAIL — `easeToward` is `undefined` (not exported).

- [ ] **Step 3: Implement**

In `lib/aquarium/movement.js`, change:

```js
const easeToward = (current, target, maxDelta) => {
```

to:

```js
export const easeToward = (current, target, maxDelta) => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/movement.js lib/aquarium/movement.test.js
git commit -m "feat(aquarium): export easeToward for reuse by fishing's line-lag animation"
```

---

## Task 4: Fishing tool button and pointer-mode branching skeleton

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: nothing new yet from `fishing.js` (wired in later tasks).
- Produces: a `FISHING_TOOL_KEY = 'fishing'` constant; a rendered 🎣 button
  with `aria-label="Fishing"`; `handleTankClick`, `handleTankPointerDown`,
  `handleTankPointerMove`, `handleTankPointerUp`, `handleTankPointerCancel`,
  and `handleTankPointerLeave` all early-return into fishing-specific
  handlers (added as no-op stubs in this task, filled in by Tasks 5–8) when
  `tank.selectedTool === FISHING_TOOL_KEY`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/pages/aquarium/index.test.jsx`, add:

```js
it('renders the fishing tool button', () => {
  render(<Aquarium />);
  expect(screen.getByRole('button', { name: /fishing/i })).toBeInTheDocument();
});

it('tapping the tank with fishing selected does not drop food or a toy', () => {
  render(<Aquarium />);
  fireEvent.click(screen.getByRole('button', { name: /fishing/i }));
  const tank = screen.getByRole('presentation');
  fireEvent.click(tank, { clientX: 50, clientY: 50 });
  expect(screen.queryAllByTestId('foodDrop')).toHaveLength(0);
  expect(screen.queryAllByTestId('toyDrop')).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — no "Fishing" button exists yet.

- [ ] **Step 3: Implement**

In `pages/aquarium/index.jsx`, add the constant near the other top-level
constants (below `GRAB_RADIUS`):

```js
const FISHING_TOOL_KEY = 'fishing';
const SURFACE_LINE_FRAC = 0.12;
```

Add a standalone fishing button in the palette JSX, right after the
`TOOLS.map(...)` block and before `decorationPalette`:

```jsx
<button
  type="button"
  className={`${styles.tool} ${tank.selectedTool === FISHING_TOOL_KEY ? styles.selected : ''}`}
  aria-pressed={tank.selectedTool === FISHING_TOOL_KEY}
  aria-label="Fishing"
  onClick={() => selectTool(FISHING_TOOL_KEY)}
>
  <span aria-hidden="true">🎣</span>
</button>
```

(Kept out of the `TOOLS` array deliberately — `TOOLS`/`TOOLS_BY_KEY` model
generic tap-to-drop tools via `dropAt`'s `tool.effect` field; fishing's
gesture contract is entirely different, so folding it into that array would
make `dropAt` treat it as a broken drop tool.)

Add fishing-handler stubs near the other handler definitions (just before
`handleTankClick`):

```js
const handleFishingPointerDown = () => {};
const handleFishingPointerMove = () => {};
const handleFishingPointerUp = () => {};
```

Guard each existing tank handler so fishing mode owns the tank exclusively.

`handleTankClick` becomes (new guard inserted right after the existing
`if (!tank) return;`, before the `suppressClickRef` check):

```js
const handleTankClick = (e) => {
  if (!tank) return;
  if (tank.selectedTool === FISHING_TOOL_KEY) return;
  if (suppressClickRef.current) {
    suppressClickRef.current = false;
    return;
  }
  const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
  dropAt(x, y);
};
```

`handleTankPointerDown` becomes (new guard inserted right after the
existing `if (!tank) return;`, before the `dragRef.current.active` check):

```js
const handleTankPointerDown = (e) => {
  if (!tank) return;
  if (tank.selectedTool === FISHING_TOOL_KEY) {
    handleFishingPointerDown(e);
    return;
  }
  if (dragRef.current.active) {
    // ...unchanged body below...
```

`handleTankPointerMove` becomes (the fishing check goes first, since
fishing tracks its own pointer via `fishingRef`, not `dragRef` — it must
run before the existing `isActiveGesturePointer` guard, which only knows
about `dragRef`):

```js
const handleTankPointerMove = (e) => {
  if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
    handleFishingPointerMove(e);
    return;
  }
  if (!tank || !isActiveGesturePointer(e)) return;
  // ...unchanged body below...
};
```

`handleTankPointerUp` becomes:

```js
const handleTankPointerUp = (e) => {
  if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
    handleFishingPointerUp(e);
    return;
  }
  // ...unchanged body below...
};
```

`handleTankPointerCancel` and `handleTankPointerLeave` route to the same
`handleFishingPointerUp` (a cancel/leave during a cast is a release with no
catch, same as a normal pointerup per the spec's "no punishment" rule):

```js
const handleTankPointerCancel = (e) => {
  if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
    handleFishingPointerUp(e);
    return;
  }
  // ...unchanged body below...
};

const handleTankPointerLeave = (e) => {
  if (tank && tank.selectedTool === FISHING_TOOL_KEY) {
    handleFishingPointerUp(e);
    return;
  }
  // ...unchanged body below...
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS (all existing tests too — the guards only change behavior
when `selectedTool === 'fishing'`, which no existing test selects)

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): add fishing tool button and pointer-mode branching"
```

---

## Task 5: Cast gesture — surface line, cast-start detection, bait tracking

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Modify: `pages/aquarium/index.module.css`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `SURFACE_LINE_FRAC`, `FISHING_TOOL_KEY` from Task 4;
  `rectFraction` (existing helper).
- Produces: `fishingRef` (a ref holding `{ phase, pointerId, startX, startY,
  baitX, baitY, rodTipX, rodTipY, hookedId, lastBiteTick }`, `phase` one of
  `'idle' | 'pending' | 'casting' | 'hooked'`); a rendered surface line;
  a rendered bait icon (`data-testid="bait"`) while a cast is active.
  Task 6 (line-lag) and Task 7 (bite race) read/extend this same ref.

- [ ] **Step 1: Write the failing tests**

In `__tests__/pages/aquarium/index.test.jsx`, add a new describe block
(after the existing top-level `describe('Aquarium page', ...)`), reusing
the `TANK_RECT` mock already defined in the file:

```js
describe('Aquarium page fishing gesture', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => TANK_RECT);
  });

  it('a pointer-down below the surface band does not start a cast', () => {
    seedTank({ selectedTool: 'fishing' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    // TANK_RECT height is 300; below the 12% band is y > 36.
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(screen.queryByTestId('bait')).not.toBeInTheDocument();
  });

  it('a downward drag starting within the surface band starts a cast and shows the bait', () => {
    seedTank({ selectedTool: 'fishing' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 100, pointerId: 1 });
    expect(screen.getByTestId('bait')).toBeInTheDocument();
  });

  it('an upward or sideways move from the surface band does not start a cast', () => {
    seedTank({ selectedTool: 'fishing' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(screen.queryByTestId('bait')).not.toBeInTheDocument();
  });

  it('releasing during a cast with no bite retracts the line', () => {
    seedTank({ selectedTool: 'fishing' });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 200, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(tank, { clientX: 200, clientY: 100, pointerId: 1 });
    expect(screen.queryByTestId('bait')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — no bait is ever rendered yet (stub handlers do nothing).

- [ ] **Step 3: Implement**

In `pages/aquarium/index.jsx`, add the ref near the other refs (after
`moveStatesRef`):

```js
const fishingRef = useRef({
  phase: 'idle', // 'idle' | 'pending' | 'casting' | 'hooked'
  pointerId: null,
  startX: 0,
  startY: 0,
  baitX: 0.5,
  baitY: SURFACE_LINE_FRAC,
  rodTipX: 0.5,
  rodTipY: SURFACE_LINE_FRAC,
  hookedId: null,
  lastBiteTick: 0,
});
```

Add a `resetFishing` helper near `selectTool`:

```js
const resetFishing = () => {
  fishingRef.current = {
    phase: 'idle',
    pointerId: null,
    startX: 0,
    startY: 0,
    baitX: 0.5,
    baitY: SURFACE_LINE_FRAC,
    rodTipX: 0.5,
    rodTipY: SURFACE_LINE_FRAC,
    hookedId: null,
    lastBiteTick: 0,
  };
};
```

Replace the three stub handlers with:

```js
const handleFishingPointerDown = (e) => {
  if (fishingRef.current.phase !== 'idle') return;
  const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
  if (y > SURFACE_LINE_FRAC) return;
  if (typeof tankRef.current.setPointerCapture === 'function') {
    tankRef.current.setPointerCapture(e.pointerId);
  }
  fishingRef.current = {
    ...fishingRef.current,
    phase: 'pending',
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    baitX: x,
    baitY: y,
    rodTipX: x,
    rodTipY: SURFACE_LINE_FRAC,
    hookedId: null,
    lastBiteTick: Date.now(),
  };
};

const handleFishingPointerMove = (e) => {
  const fishing = fishingRef.current;
  if (fishing.pointerId !== e.pointerId || fishing.phase === 'idle') return;
  if (fishing.phase === 'pending') {
    if (e.clientY - fishing.startY < MIN_DRAG_PX) return;
    fishing.phase = 'casting';
  }
  const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
  fishing.baitX = x;
  fishing.baitY = y;
};

const handleFishingPointerUp = (e) => {
  if (fishingRef.current.pointerId !== e.pointerId) return;
  resetFishing();
};
```

Render the surface line and bait inside the `.tank` div, right after the
opening `role="presentation"` div's existing children start (add just
before `{tank.creatures.map(...)}` so it doesn't interfere with z-order of
creatures/effects):

```jsx
{tank.selectedTool === FISHING_TOOL_KEY && (
  <div
    className={styles.surfaceLine}
    style={{ top: `${SURFACE_LINE_FRAC * 100}%` }}
    aria-hidden="true"
  />
)}
{(fishingRef.current.phase === 'casting' || fishingRef.current.phase === 'hooked') && (
  <span
    data-testid="bait"
    className={styles.bait}
    style={{
      left: `${fishingRef.current.baitX * 100}%`,
      top: `${fishingRef.current.baitY * 100}%`,
    }}
    aria-hidden="true"
  >
    🪱
  </span>
)}
```

(Deliberately `'casting' || 'hooked'`, not `!== 'idle'` — the bait must
stay hidden during `'pending'`, the brief window between pointer-down in
the surface band and the drag actually crossing `MIN_DRAG_PX` downward.
Showing it on pointer-down alone would make a tap-and-release inside the
band flash a bait sprite even though no cast happened.)

Add to `pages/aquarium/index.module.css`:

```css
.surfaceLine {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}

.bait {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 24px;
  pointer-events: none;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): add cast-drag gesture and bait rendering"
```

---

## Task 6: Rod-tip line-lag animation

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Modify: `pages/aquarium/index.module.css`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `easeToward` from `lib/aquarium/movement.js` (Task 3);
  `fishingRef` from Task 5; the existing per-frame `requestAnimationFrame`
  loop and its `dt`.
- Produces: `fishingRef.current.rodTipX`/`rodTipY` eased toward
  `baitX`/`baitY` every frame while a cast is active; a rendered line from
  rod-tip to bait (`data-testid="line"`).

- [ ] **Step 1: Write the failing test**

```js
it('renders a line from the rod tip toward the bait during a cast', () => {
  seedTank({ selectedTool: 'fishing' });
  render(<Aquarium />);
  const tank = screen.getByRole('presentation');
  fireEvent.pointerDown(tank, { clientX: 200, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(tank, { clientX: 200, clientY: 200, pointerId: 1 });
  expect(screen.getByTestId('line')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — no `line` test id rendered yet.

- [ ] **Step 3: Implement**

In `pages/aquarium/index.jsx`, import `easeToward` alongside the existing
`movement.js` imports:

```js
import { createMovementState, stepMovement, wobbleOffset, easeToward, CONTACT_RADIUS } from '../../lib/aquarium/movement';
```

Add the easing-rate constant near `SURFACE_LINE_FRAC`:

```js
const ROD_EASE_PER_SEC = 3;
```

Inside the existing per-frame `loop` function (the `useEffect` that runs
the movement `requestAnimationFrame` loop), add the rod-tip easing right
after `lastTime = time;` and before `setTank((prev) => { ... })`:

```js
const fishing = fishingRef.current;
if (fishing.phase !== 'idle') {
  fishing.rodTipX = easeToward(fishing.rodTipX, fishing.baitX, ROD_EASE_PER_SEC * dt);
  fishing.rodTipY = easeToward(fishing.rodTipY, fishing.baitY, ROD_EASE_PER_SEC * dt);
}
```

Also reset the rod tip to the bait's start position in
`handleFishingPointerDown` — it already sets `rodTipX`/`rodTipY` to the
cast-start point, so no change needed there.

Render the line next to the bait span from Task 5:

```jsx
{(fishingRef.current.phase === 'casting' || fishingRef.current.phase === 'hooked') && (
  <>
    <svg className={styles.line} data-testid="line" aria-hidden="true">
      <line
        x1={`${fishingRef.current.rodTipX * 100}%`}
        y1={`${fishingRef.current.rodTipY * 100}%`}
        x2={`${fishingRef.current.baitX * 100}%`}
        y2={`${fishingRef.current.baitY * 100}%`}
      />
    </svg>
    <span
      data-testid="bait"
      className={styles.bait}
      style={{
        left: `${fishingRef.current.baitX * 100}%`,
        top: `${fishingRef.current.baitY * 100}%`,
      }}
      aria-hidden="true"
    >
      🪱
    </span>
  </>
)}
```

(This replaces the standalone `bait` span added in Task 5 with the
`<>...</>` fragment above, adding the `svg`/`line` alongside it.)

Add to `pages/aquarium/index.module.css`:

```css
.line {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.line line {
  stroke: rgba(255, 255, 255, 0.7);
  stroke-width: 1.5;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): animate rod-tip line lag toward the bait"
```

---

## Task 7: Bite race — lure movement and per-tick bite rolls

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `FISHING_DETECTION_RADIUS`, `BITE_TICK_MS`,
  `generateHiddenAttraction`, `computeBiteChance` from `lib/aquarium/fishing.js`
  (Task 2); `fishingRef` from Task 5; the existing `stepMovement`,
  `assignSeekTargets`, `computeAffinity`, `findDrop`.
- Produces: `biteStatesRef` (a `Map<creatureId, { hiddenAttraction, prevDist }>`,
  ephemeral like `moveStatesRef`); fish within `FISHING_DETECTION_RADIUS` of
  an active-but-not-yet-hooked bait steer toward it instead of their normal
  wander/seek target; `fishingRef.current.phase` transitions
  `'casting' → 'hooked'` (with `hookedId` set) when a bite roll succeeds.

- [ ] **Step 1: Write the failing test**

`vitest.setup.js` has no `requestAnimationFrame` polyfill or fake-timer
setup, so the existing movement loop runs on jsdom's real, native `rAF`
(confirmed: no other test in this suite drives the movement loop — they
only exercise pointer handlers directly). Rather than fighting fake timers
against a real browser API, this test waits on the wall clock for real
frames to run, same approach as Task 8's tests below:

```js
it('a fish within range of the bait swims toward it instead of wandering', () => {
  seedTank({
    selectedTool: 'fishing',
    creatures: [{
      id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
      hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.1, y: 0.5,
    }],
  });
  render(<Aquarium />);
  const tank = screen.getByRole('presentation');
  // Cast near the fish's position (x=0.1 in a 400-wide TANK_RECT is clientX=40).
  fireEvent.pointerDown(tank, { clientX: 60, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(tank, { clientX: 60, clientY: 60, pointerId: 1 });
  const before = Number(screen.getByTestId('creature').style.left.replace('%', ''));
  return new Promise((resolve) => {
    setTimeout(() => {
      const after = Number(screen.getByTestId('creature').style.left.replace('%', ''));
      // The bait sits to the right of the fish's start (x=0.1 -> clientX=60 is
      // tank-fraction 0.15); the fish should have moved right, toward it.
      expect(after).toBeGreaterThan(before);
      resolve();
    }, 500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — the fish still wanders randomly, not reliably toward the
bait.

- [ ] **Step 3: Implement**

In `pages/aquarium/index.jsx`, import the new fishing helpers:

```js
import {
  FISHING_DETECTION_RADIUS,
  BITE_TICK_MS,
  generateHiddenAttraction,
  computeBiteChance,
} from '../../lib/aquarium/fishing';
```

Add the ref near `fishingRef`:

```js
const biteStatesRef = useRef(new Map());
```

Replace the body of the movement `useEffect`'s `setTank((prev) => { ... })`
callback with the fishing-aware version (this replaces the existing
`claimed`/`positioned`/`events` block — the `find Drop`/`consumeDrop`/
`unlockedThisFrame` handling below it is unchanged):

```js
setTank((prev) => {
  if (!prev) return prev;
  const claimed = assignSeekTargets(prev);
  const positioned = claimed.creatures.map((c) => {
    if (!moveStatesRef.current.has(c.id)) {
      moveStatesRef.current.set(c.id, createMovementState(c.x, c.y));
    }
    const isHooked = fishing.phase === 'hooked' && fishing.hookedId === c.id;
    const dist = fishing.phase !== 'idle'
      ? Math.hypot(c.x - fishing.baitX, c.y - fishing.baitY)
      : Infinity;
    const isLured = fishing.phase === 'casting' && dist <= FISHING_DETECTION_RADIUS;
    let targetPoint = null;
    let affinity = 1;
    let found = null;
    if (isHooked) {
      targetPoint = { x: fishing.baitX, y: fishing.baitY };
      affinity = 1;
    } else if (isLured) {
      if (!biteStatesRef.current.has(c.id)) {
        biteStatesRef.current.set(c.id, {
          hiddenAttraction: generateHiddenAttraction(Math.random),
          prevDist: dist,
        });
      }
      targetPoint = { x: fishing.baitX, y: fishing.baitY };
      affinity = biteStatesRef.current.get(c.id).hiddenAttraction;
    } else {
      found = c.seekTargetId ? findDrop(claimed, c.seekTargetId) : null;
      targetPoint = found ? { x: found.drop.x, y: found.drop.y } : null;
      affinity = found ? computeAffinity(found.type === 'food' ? c.hunger : c.happiness) : 1;
    }
    const stepped = stepMovement(
      moveStatesRef.current.get(c.id),
      dt,
      now,
      boundsWidth,
      targetPoint,
      Math.random,
      affinity,
    );
    moveStatesRef.current.set(c.id, stepped);
    if (found && Math.hypot(stepped.x - targetPoint.x, stepped.y - targetPoint.y) <= CONTACT_RADIUS) {
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

  if (fishing.phase === 'casting' && now - fishing.lastBiteTick >= BITE_TICK_MS) {
    fishing.lastBiteTick = now;
    const eligible = positioned
      .map((c) => ({ c, dist: Math.hypot(c.x - fishing.baitX, c.y - fishing.baitY) }))
      .filter(({ dist }) => dist <= FISHING_DETECTION_RADIUS)
      .sort((a, b) => a.dist - b.dist);
    eligible.some(({ c, dist }) => {
      const prior = biteStatesRef.current.get(c.id)
        || { hiddenAttraction: generateHiddenAttraction(Math.random), prevDist: dist };
      const gotCloser = dist < prior.prevDist;
      const chance = computeBiteChance(dist, FISHING_DETECTION_RADIUS, prior.hiddenAttraction, gotCloser);
      biteStatesRef.current.set(c.id, { hiddenAttraction: prior.hiddenAttraction, prevDist: dist });
      if (Math.random() < chance) {
        fishing.phase = 'hooked';
        fishing.hookedId = c.id;
        return true;
      }
      return false;
    });
  }

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
```

Add `const fishing = fishingRef.current;` right after `const events = [];`
(before the `setTank` call) so the closure above has it in scope — the
line-lag easing from Task 6 already reads the same `fishingRef.current`
each frame, so declare this once per frame and reuse it for both:

```js
const now = Date.now();
const events = [];
let unlockedThisFrame = null;
const fishing = fishingRef.current;
if (fishing.phase !== 'idle') {
  fishing.rodTipX = easeToward(fishing.rodTipX, fishing.baitX, ROD_EASE_PER_SEC * dt);
  fishing.rodTipY = easeToward(fishing.rodTipY, fishing.baitY, ROD_EASE_PER_SEC * dt);
}
setTank((prev) => {
  // ...as above...
});
```

(Remove the separate `const fishing = fishingRef.current;` that Task 6 may
have introduced inline if it duplicated this — there should be exactly one
per-frame `fishing` binding, declared once before the rod-tip easing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS

Hooking itself has no directly observable effect yet (that lands in
Task 8, where a successful hook followed by reeling in is verified via
`tank.bucket`) — so this task's test coverage is the lure-movement test
above; the bite roll's `Math.random() < chance` branch is exercised
end-to-end by Task 8's "hooked fish ... caught into the bucket" test, which
only passes if a bite roll actually succeeded during the run.

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): lure nearby fish toward the bait and roll per-tick bites"
```

---

## Task 8: Reel-in, catch landing, and release-to-free

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `catchFish` from `lib/aquarium/fishing.js` (Task 2);
  `fishingRef`/`resetFishing` from Task 5; `commit`, `pulse`, `spawnEffect`
  (existing helpers).
- Produces: dragging the bait back above `SURFACE_LINE_FRAC` while
  `phase === 'hooked'` calls `catchFish` and persists it via `commit`;
  releasing (`pointerup`/`pointercancel`/`pointerleave`) while hooked
  unhooks with no state change beyond resetting the fishing ref.

- [ ] **Step 1: Write the failing tests**

```js
it('a hooked fish that crosses back above the surface line is caught into the bucket', () => {
  const originalRandom = Math.random;
  // First call seeds hiddenAttraction (near-max, so proximity alone gives a
  // real chance); every call after that is the bite-roll comparison, forced
  // to 0 so the very first tick's roll succeeds (any chance > 0 beats it).
  // A single constant stub won't work here: hiddenAttraction and the roll
  // draw from the same rng, so the roll would always compare a value against
  // a chance proportional to that same value, which can never allow a hit.
  let callCount = 0;
  Math.random = () => {
    callCount += 1;
    return callCount === 1 ? 0.99 : 0;
  };
  try {
    seedTank({
      selectedTool: 'fishing',
      creatures: [{
        id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
        hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.15, y: 0.15,
      }],
    });
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.pointerDown(tank, { clientX: 60, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(tank, { clientX: 60, clientY: 60, pointerId: 1 });
    return new Promise((resolve) => {
      setTimeout(() => {
        // The bite-tick check runs every frame inside the movement loop, not
        // only on pointer moves — by 450ms of real time the fish (within
        // FISHING_DETECTION_RADIUS the whole time) has already been rolled
        // for and hooked. This move just drags the bait back up above the
        // surface band to land the catch.
        fireEvent.pointerMove(tank, { clientX: 60, clientY: 5, pointerId: 1 });
        const result = readTank();
        expect(result.bucket).toHaveLength(1);
        expect(result.bucket[0].id).toBe('c1');
        expect(result.creatures).toHaveLength(0);
        resolve();
      }, 450);
    });
  } finally {
    Math.random = originalRandom;
  }
});

it('releasing before crossing the surface line leaves the fish uncaught', () => {
  seedTank({ selectedTool: 'fishing' });
  render(<Aquarium />);
  const tank = screen.getByRole('presentation');
  fireEvent.pointerDown(tank, { clientX: 200, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(tank, { clientX: 200, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(tank, { clientX: 200, clientY: 100, pointerId: 1 });
  const result = readTank();
  expect(result.bucket).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — `tank.bucket` stays empty even after crossing back above
the surface line (no landing logic exists yet). The second test already
passes (nothing catches on a plain release) — that's fine, it documents
existing-and-preserved behavior going into this task.

- [ ] **Step 3: Implement**

Import `catchFish` alongside the other fishing imports:

```js
import {
  FISHING_DETECTION_RADIUS,
  BITE_TICK_MS,
  generateHiddenAttraction,
  computeBiteChance,
  catchFish,
} from '../../lib/aquarium/fishing';
```

Add a `landCatch` helper near `resetFishing`:

```js
const landCatch = (creatureId) => {
  const { baitX, baitY } = fishingRef.current;
  pulse(creatureId);
  spawnEffect(baitX, baitY, '🎣');
  biteStatesRef.current.delete(creatureId);
  resetFishing();
  commit((prev) => catchFish(prev, creatureId), 'sparkle');
};
```

Update `handleFishingPointerMove` to check for a landed catch after
updating the bait position:

```js
const handleFishingPointerMove = (e) => {
  const fishing = fishingRef.current;
  if (fishing.pointerId !== e.pointerId || fishing.phase === 'idle') return;
  if (fishing.phase === 'pending') {
    if (e.clientY - fishing.startY < MIN_DRAG_PX) return;
    fishing.phase = 'casting';
  }
  const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
  fishing.baitX = x;
  fishing.baitY = y;
  if (fishing.phase === 'hooked' && y <= SURFACE_LINE_FRAC) {
    landCatch(fishing.hookedId);
  }
};
```

`handleFishingPointerUp` already calls `resetFishing()` unconditionally,
which is exactly "unhook and reset, no state change" for a release at any
phase (including `'hooked'`) — no change needed there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): land a catch on reel-in, release-to-free otherwise"
```

---

## Task 9: Bucket tray — return to tank and hold-to-discard

**Files:**
- Modify: `pages/aquarium/index.jsx`
- Modify: `pages/aquarium/index.module.css`
- Test: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `returnFish`, `deleteFromBucket` from `lib/aquarium/fishing.js`
  (Task 2); `getSpecies` (existing); `isPointInRect` (existing helper).
- Produces: a bucket tray rendered beside the tool palette
  (`data-testid="bucketTray"`) showing bucketed fish
  (`data-testid="bucketFish"`) and a trash icon (`data-testid="trash"`);
  dragging a bucket fish onto the tank returns it; dragging onto the trash
  and holding ~500ms deletes it, with an escalating shake while held.

- [ ] **Step 1: Write the failing tests**

```js
describe('Aquarium page bucket', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      const testId = this.getAttribute('data-testid');
      if (testId === 'trash') return { left: 350, top: 380, right: 400, bottom: 430, width: 50, height: 50 };
      return TANK_RECT;
    });
  });

  it('renders bucketed fish and hides the tray when the bucket is empty', () => {
    seedTank({});
    render(<Aquarium />);
    expect(screen.queryByTestId('bucketTray')).not.toBeInTheDocument();
  });

  it('shows a bucketed fish in the tray', () => {
    seedTank({
      bucket: [{
        id: 'b1', species: 'clownfish', bornAt: 0, stage: 'baby',
        hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0, y: 0,
      }],
    });
    render(<Aquarium />);
    expect(screen.getAllByTestId('bucketFish')).toHaveLength(1);
  });

  it('dragging a bucketed fish onto the tank returns it to the tank', () => {
    seedTank({
      bucket: [{
        id: 'b1', species: 'clownfish', bornAt: 0, stage: 'baby',
        hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0, y: 0,
      }],
    });
    render(<Aquarium />);
    const fish = screen.getByTestId('bucketFish');
    fireEvent.pointerDown(fish, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(fish, { clientX: 200, clientY: 150, pointerId: 1 });
    const result = readTank();
    expect(result.bucket).toHaveLength(0);
    expect(result.creatures.some((c) => c.id === 'b1')).toBe(true);
  });

  it('holding a bucketed fish over the trash for 500ms deletes it', () => {
    vi.useFakeTimers();
    try {
      seedTank({
        bucket: [{
          id: 'b1', species: 'clownfish', bornAt: 0, stage: 'baby',
          hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0, y: 0,
        }],
      });
      render(<Aquarium />);
      const fish = screen.getByTestId('bucketFish');
      fireEvent.pointerDown(fish, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(fish, { clientX: 375, clientY: 405, pointerId: 1 });
      vi.advanceTimersByTime(500);
      const result = readTank();
      expect(result.bucket).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releasing before 500ms over the trash does not delete it', () => {
    vi.useFakeTimers();
    try {
      seedTank({
        bucket: [{
          id: 'b1', species: 'clownfish', bornAt: 0, stage: 'baby',
          hunger: 100, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0, y: 0,
        }],
      });
      render(<Aquarium />);
      const fish = screen.getByTestId('bucketFish');
      fireEvent.pointerDown(fish, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(fish, { clientX: 375, clientY: 405, pointerId: 1 });
      vi.advanceTimersByTime(300);
      fireEvent.pointerUp(fish, { clientX: 375, clientY: 405, pointerId: 1 });
      vi.advanceTimersByTime(500);
      const result = readTank();
      expect(result.bucket).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — no bucket tray exists yet.

- [ ] **Step 3: Implement**

Import the remaining fishing helpers:

```js
import {
  FISHING_DETECTION_RADIUS,
  BITE_TICK_MS,
  generateHiddenAttraction,
  computeBiteChance,
  catchFish,
  returnFish,
  deleteFromBucket,
} from '../../lib/aquarium/fishing';
```

Add the constant and new state/refs near the other top-level declarations:

```js
const DISCARD_HOLD_MS = 500;
```

```js
const bucketDragRef = useRef({ active: false, creatureId: null, pointerId: null });
const trashTimerRef = useRef(null);
const trashRef = useRef(null);
const [holdingTrashId, setHoldingTrashId] = useState(null);
```

Add the bucket-drag handlers near `handleHatch`:

```js
const handleBucketPointerDown = (e, creatureId) => {
  if (typeof e.target.setPointerCapture === 'function') {
    e.target.setPointerCapture(e.pointerId);
  }
  bucketDragRef.current = { active: true, creatureId, pointerId: e.pointerId };
};

const handleBucketPointerMove = (e) => {
  const drag = bucketDragRef.current;
  if (!drag.active || drag.pointerId !== e.pointerId) return;
  const overTrash = trashRef.current && isPointInRect(trashRef.current, e.clientX, e.clientY);
  if (overTrash && holdingTrashId !== drag.creatureId) {
    setHoldingTrashId(drag.creatureId);
    trashTimerRef.current = setTimeout(() => {
      commit((prev) => deleteFromBucket(prev, drag.creatureId), 'sparkle');
      setHoldingTrashId(null);
      bucketDragRef.current = { active: false, creatureId: null, pointerId: null };
    }, DISCARD_HOLD_MS);
  } else if (!overTrash && holdingTrashId === drag.creatureId) {
    clearTimeout(trashTimerRef.current);
    setHoldingTrashId(null);
  }
};

const handleBucketPointerUp = (e) => {
  const drag = bucketDragRef.current;
  if (!drag.active || drag.pointerId !== e.pointerId) return;
  clearTimeout(trashTimerRef.current);
  setHoldingTrashId(null);
  const overTank = tankRef.current && isPointInRect(tankRef.current, e.clientX, e.clientY);
  if (overTank) {
    commit((prev) => returnFish(prev, drag.creatureId), 'pop');
  }
  bucketDragRef.current = { active: false, creatureId: null, pointerId: null };
};

const handleBucketPointerCancel = () => {
  clearTimeout(trashTimerRef.current);
  setHoldingTrashId(null);
  bucketDragRef.current = { active: false, creatureId: null, pointerId: null };
};
```

`isPointInRect` is already defined in this file (used by the existing
decoration-drag delete logic) — reused here as-is.

Render the tray after the closing `</div>` of the `.tank` div, right before
the existing `.palette` div (so it sits between the tank and the tool
palette):

```jsx
{tank.bucket.length > 0 && (
  <div className={styles.bucketTray} data-testid="bucketTray" role="group" aria-label="Bucket">
    {tank.bucket.map((c) => {
      const species = getSpecies(c.species);
      return (
        <button
          type="button"
          key={c.id}
          data-testid="bucketFish"
          className={`${styles.bucketFish} ${holdingTrashId === c.id ? styles.trashHolding : ''}`}
          aria-label={`${species.name} in bucket`}
          onPointerDown={(e) => handleBucketPointerDown(e, c.id)}
          onPointerMove={handleBucketPointerMove}
          onPointerUp={handleBucketPointerUp}
          onPointerCancel={handleBucketPointerCancel}
        >
          <span aria-hidden="true">{species.emoji[c.stage]}</span>
        </button>
      );
    })}
    <div className={styles.trash} data-testid="trash" ref={trashRef} aria-label="Trash" role="img">
      🗑️
    </div>
  </div>
)}
```

Add to `pages/aquarium/index.module.css`:

```css
.bucketTray {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #04202f;
}

.bucketFish {
  width: 3.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  border-radius: 0.75rem;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  font-size: 1.6rem;
  cursor: pointer;
}

.trash {
  width: 3.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
}

.trashHolding {
  animation: trashHold 500ms ease-in forwards;
}

@keyframes trashHold {
  0% { transform: rotate(0deg) scale(1); }
  20% { transform: rotate(-3deg) scale(1.02); }
  40% { transform: rotate(3deg) scale(1.04); }
  60% { transform: rotate(-6deg) scale(1.06); }
  80% { transform: rotate(6deg) scale(1.08); }
  100% { transform: rotate(-8deg) scale(1.1); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css __tests__/pages/aquarium/index.test.jsx
git commit -m "feat(aquarium): add bucket tray with return-to-tank and hold-to-discard"
```

---

## Task 10: Full suite verification

**Files:**
- None (verification-only task).

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a passing full test run and lint, confirming no regressions
  across the aquarium feature or the rest of the app.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test in `lib/aquarium/*.test.js` and
`__tests__/pages/aquarium/index.test.jsx`, plus the rest of the app's
existing suite, passes with no regressions.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS — no new lint errors in `lib/aquarium/fishing.js`,
`lib/aquarium/fishing.test.js`, `pages/aquarium/index.jsx`, or the modified
test files. Fix any that appear (e.g. import ordering, unused variables)
before proceeding.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, open `/aquarium` in a browser (or device emulator with
touch enabled), and verify by hand:
- Selecting 🎣 shows the surface line; tapping the tank (no drag) does
  nothing.
- A downward drag from the surface band casts a line with visible lag.
- Waiting near a fish eventually hooks it (bite race visibly pulls it in).
- Dragging the bait back above the surface line while hooked lands the
  catch into the bucket tray.
- Releasing early (before crossing back above the line) lets the fish swim
  off freely.
- Dragging a bucketed fish back into the tank returns it.
- Dragging a bucketed fish onto the trash and holding shows escalating
  shake and deletes it after ~500ms; releasing early does not delete it.
- The cast-start band sits comfortably below the device's own top-edge
  gesture area (no accidental notification-shade/control-center pulls when
  starting a cast).

- [ ] **Step 4: Commit (only if smoke-test fixes were needed)**

```bash
git add -A
git commit -m "fix(aquarium): address issues found in fishing feature smoke test"
```

(Skip this step entirely if Steps 1–3 required no code changes.)
