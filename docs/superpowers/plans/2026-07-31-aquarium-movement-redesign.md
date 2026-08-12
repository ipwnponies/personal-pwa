# Aquarium Movement & Care Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSS-transition teleport movement and tank-wide instant care actions with a continuous steering simulation, physical drop/wipe interactions, larger fish, and a want-bubble status display, per the approved spec.

**Architecture:** New pure module `lib/aquarium/movement.js` does per-fish kinematics (heading/speed easing, wander, seek, edge steering) with no DOM access. `lib/aquarium/simulation.js` gains drop/dirt-spot CRUD and cross-fish claiming logic, still pure. `pages/aquarium/index.jsx` runs a `requestAnimationFrame` loop that calls `movement.js` per fish per frame and periodically (every 2s, unchanged) snapshots position into the existing decay/save tick.

**Tech Stack:** Next.js (pages router), React 18, JavaScript only, CSS Modules, Vitest + React Testing Library.

## Global Constraints

- No dependency changes. No changes to `package.json`/lockfile.
- JavaScript only — no TypeScript.
- Follow this repo's ESLint config exactly: `.eslintrc.yml` extends `plugin:react/recommended`, `airbnb`, `prettier`; plugins: `[react]` only. Do **not** reference `eslint-plugin-react-hooks` rules (e.g. `react-hooks/exhaustive-deps`) in disable comments — that plugin is not installed here and referencing it is itself a lint error.
- Airbnb's `no-nested-ternary` applies — avoid nested ternaries (see the `edgeSteer` helper design below, which exists specifically to avoid one).
- Pure game-logic modules (`lib/aquarium/movement.js`, `lib/aquarium/simulation.js`) take no DOM/React/`requestAnimationFrame` dependencies and accept injectable `now`/`rng` where behavior depends on time or randomness, so tests are deterministic.
- Cruise fish speed: **15–45 px/s** (`CRUISE_SPEED_MIN`/`CRUISE_SPEED_MAX` in `movement.js`).
- Turn rate cap: **~90°/sec** (`TURN_RATE_RAD_PER_SEC = Math.PI / 2`).
- Fish `sizePx` per stage (all species, uniform): baby **60px**, child **84px**, adult **108px**.
- Tool palette has exactly two tools: 🍤 Food, 🎾 Toy. No Sponge tool — cleaning is always available via direct tap/drag on a dirt spot.
- Growth/decay math in `simulation.js` (`HUNGER_DECAY_PER_MIN`, `HAPPINESS_DECAY_PER_MIN`, `CLEAN_DECAY_PER_MIN`, `DIRTY_DRAG_PER_MIN`, `STAGE_DURATIONS_MS`, the `grow()` streak logic) is unchanged by this plan.
- Egg progress advances at **consumption/wipe time**, not at drop time.
- Before declaring the feature complete, verify interactively in a real browser via Playwright (not just unit tests) — this codebase has twice shipped UI that passed unit tests but was invisible/broken in practice.

---

## File Structure

- `lib/aquarium/movement.js` (new) — pure per-fish kinematics: `createMovementState`, `stepMovement`, `wobbleOffset`, plus movement-tuning constants (`CRUISE_SPEED_MIN/MAX`, `SEEK_SPEED_MULTIPLIER`, `TURN_RATE_RAD_PER_SEC`, `ACCEL_PX_PER_SEC2`, `WOBBLE_AMPLITUDE_FRAC`, `WOBBLE_FREQUENCY_HZ`, `EDGE_MARGIN`, `BOUNDS_MIN`, `BOUNDS_MAX`, `WANDER_INTERVAL_MIN_MS`, `WANDER_INTERVAL_MAX_MS`, `DETECTION_RADIUS`, `CONTACT_RADIUS`). No DOM, no `requestAnimationFrame`.
- `lib/aquarium/movement.test.js` (new) — tests for the above.
- `lib/aquarium/simulation.js` (modified) — data model gains `foodDrops`/`toyDrops`/`dirtSpots` arrays and per-creature `seekTargetId`; gains `dropFood`, `dropToy`, `findDrop`, `consumeDrop`, `assignSeekTargets`, `spawnDirtSpot`, `wipeDirtSpot`; loses `feedTank`, `playTank`, `cleanTank`, `feedCreature`, `playCreature`, `wanderCreatures`, `WANDER_MIN/MAX/STEP`, `FEED_RADIUS`, `TANK_ACTION_MAX_TARGETS`, `CLEAN_AMOUNT`, `targetIds`. `applyElapsed` gains an `rng` parameter (default `Math.random`) and spawns dirt spots as cleanliness crosses each 10-point step down.
- `lib/aquarium/simulation.test.js` (modified) — old tank-wide/wander describe blocks removed, new ones added for drops/claiming/dirt-spots.
- `lib/aquarium/creatures.js` (modified) — `sizePx` doubled per stage, uniformly across species.
- `lib/aquarium/creatures.test.js` (modified) — locks in the new sizes.
- `pages/aquarium/index.jsx` (modified) — two-tool palette; tap/drag anywhere on the tank (including on a fish) drops food/toy; tap/drag on a dirt spot wipes it; long-press retired; new `requestAnimationFrame` loop drives movement and consumption; want-bubble rendering.
- `pages/aquarium/index.module.css` (modified) — remove `.creature` position transition and `swim`/`pulse`(kept)/`moodDot` styles as needed, add `.wantBubble`, `.foodDrop`, `.toyDrop`, `.dirtSpot`.
- `__tests__/pages/aquarium/index.test.jsx` (modified) — two-tool palette assertions, drop/wipe click behavior, want-bubble/drop-marker rendering.

**Design decision — where per-fish movement state lives:** `heading`, `speed`, `cruiseSpeed`, `wobblePhase`, `wanderTarget`, `wanderTargetExpiresAt` are true ephemeral per-frame state and live in a `useRef(new Map())` in the page component, never written to `tank` state or `localStorage`. `seekTargetId`, by contrast, is stored on the creature object inside `tank.creatures` (and thus persisted with the existing 2s save tick) because it must be visible to `assignSeekTargets`, a pure cross-creature function in `simulation.js` that cannot reach into a React ref. This is a deliberate, minor divergence from the spec's data-model listing (which shows `seekTargetId` as in-memory-only) — persisting it is harmless (stale claims are revalidated every call to `assignSeekTargets`) and keeps claiming logic pure and testable.

**Design decision — px/s speed without full aspect-correction:** `movement.js` positions are fractional (`0..1`, matching the existing `x`/`y` convention). Converting the requested "15–45 px/s" into fractional motion needs a pixel reference; `stepMovement` takes a single `boundsWidth` (the tank element's rendered pixel width) and divides displacement by it for both axes. This is a deliberate simplification (YAGNI) over full per-axis width/height aspect correction — matches the existing codebase's convention of treating `x`/`y` as a plain fractional space (e.g. the old `FEED_RADIUS` distance check).

**Design decision — wobble is fractional, not px-based:** unlike cruise speed (an explicit user ask, calibrated in real px/s), wobble amplitude is a cosmetic detail with no explicit unit requirement, so `WOBBLE_AMPLITUDE_FRAC` is a plain fraction of tank size. This avoids threading `boundsWidth` (and a `getBoundingClientRect()` read) into the render path on every frame for every fish.

---

### Task 1: movement.js — wander kinematics (turn cap, speed cap, wander pick/repick, edge steering)

**Files:**
- Create: `lib/aquarium/movement.js`
- Test: `lib/aquarium/movement.test.js`

**Interfaces:**
- Consumes: `clamp` from `../random`.
- Produces: `CRUISE_SPEED_MIN`, `CRUISE_SPEED_MAX`, `TURN_RATE_RAD_PER_SEC`, `ACCEL_PX_PER_SEC2`, `EDGE_MARGIN`, `BOUNDS_MIN`, `BOUNDS_MAX`, `WANDER_INTERVAL_MIN_MS`, `WANDER_INTERVAL_MAX_MS` (constants); `createMovementState(x, y, rng = Math.random)`; `stepMovement(moveState, dt, now, boundsWidth, target, rng = Math.random)` — `target` is accepted but ignored in this task (wander-only; seek behavior added in Task 2).

- [ ] **Step 1: Write the failing tests**

```js
// lib/aquarium/movement.test.js
import { describe, it, expect } from 'vitest';
import {
  CRUISE_SPEED_MIN,
  CRUISE_SPEED_MAX,
  TURN_RATE_RAD_PER_SEC,
  ACCEL_PX_PER_SEC2,
  BOUNDS_MIN,
  BOUNDS_MAX,
  WANDER_INTERVAL_MIN_MS,
  WANDER_INTERVAL_MAX_MS,
  createMovementState,
  stepMovement,
} from './movement';

describe('createMovementState', () => {
  it('assigns a cruise speed within the documented range', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    expect(ms.cruiseSpeed).toBeGreaterThanOrEqual(CRUISE_SPEED_MIN);
    expect(ms.cruiseSpeed).toBeLessThanOrEqual(CRUISE_SPEED_MAX);
  });

  it('starts with a unit-length heading', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.25);
    expect(Math.hypot(ms.heading.x, ms.heading.y)).toBeCloseTo(1, 5);
  });

  it('starts at the given position with zero speed', () => {
    const ms = createMovementState(0.2, 0.8, () => 0.5);
    expect(ms.x).toBe(0.2);
    expect(ms.y).toBe(0.8);
    expect(ms.speed).toBe(0);
  });
});

describe('stepMovement wander', () => {
  it('picks a wander target on the first step', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.016, 1000, 500, null, () => 0.5);
    expect(next.wanderTarget).not.toBeNull();
    expect(next.wanderTargetExpiresAt).toBeGreaterThan(1000);
  });

  it('keeps the same wander target until it expires', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const first = stepMovement(ms, 0.016, 1000, 500, null, () => 0.5);
    const second = stepMovement(first, 0.016, 1016, 500, null, () => 0.9);
    expect(second.wanderTarget).toEqual(first.wanderTarget);
  });

  it('re-picks a wander target once it expires', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.1);
    const first = stepMovement(ms, 0.016, 1000, 500, null, () => 0.1);
    const later = stepMovement(
      first,
      0.016,
      first.wanderTargetExpiresAt + 1,
      500,
      null,
      () => 0.9,
    );
    expect(later.wanderTarget).not.toEqual(first.wanderTarget);
  });

  it('never overshoots the turn-rate cap in one step', () => {
    // Heading starts pointing +x (angle 0); force a wander target that
    // requires a near-180-degree turn, then take a small dt step.
    const ms = { ...createMovementState(0.5, 0.5, () => 0), heading: { x: 1, y: 0 } };
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.999);
    const currentAngle = Math.atan2(ms.heading.x === 1 ? 0 : 0, 1); // 0
    const nextAngle = Math.atan2(next.heading.y, next.heading.x);
    const maxTurn = TURN_RATE_RAD_PER_SEC * 0.05;
    let diff = nextAngle - currentAngle;
    diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    expect(Math.abs(diff)).toBeLessThanOrEqual(maxTurn + 1e-9);
  });

  it('never exceeds the acceleration cap in one step', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.5);
    expect(next.speed).toBeLessThanOrEqual(ACCEL_PX_PER_SEC2 * 0.05 + 1e-9);
  });

  it('moves toward its wander target over several steps', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.99); // wander target near BOUNDS_MAX
    for (let i = 0; i < 200; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, null, () => 0.99);
    }
    expect(ms.x).toBeGreaterThan(0.5);
    expect(ms.y).toBeGreaterThan(0.5);
  });

  it('keeps position within [0, 1]', () => {
    let ms = { ...createMovementState(0.01, 0.01, () => 0), heading: { x: -1, y: -1 } };
    for (let i = 0; i < 500; i += 1) {
      ms = stepMovement(ms, 0.1, 1000 + i * 100, 500, null, () => 0);
    }
    expect(ms.x).toBeGreaterThanOrEqual(0);
    expect(ms.y).toBeGreaterThanOrEqual(0);
  });

  it('steers away from the edge when very close to it', () => {
    const ms = { ...createMovementState(0.02, 0.5, () => 0.5), heading: { x: -1, y: 0 } };
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.5);
    // Heading was pointing further into the edge (x: -1); after one step it
    // must have turned toward increasing x.
    expect(next.heading.x).toBeGreaterThan(ms.heading.x);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: FAIL — `Cannot find module './movement'` (file doesn't exist yet).

- [ ] **Step 3: Implement `movement.js`**

```js
// lib/aquarium/movement.js
import { clamp } from '../random';

export const CRUISE_SPEED_MIN = 15;
export const CRUISE_SPEED_MAX = 45;
export const SEEK_SPEED_MULTIPLIER = 1.4;
export const TURN_RATE_RAD_PER_SEC = Math.PI / 2;
export const ACCEL_PX_PER_SEC2 = 60;
export const WOBBLE_AMPLITUDE_FRAC = 0.015;
export const WOBBLE_FREQUENCY_HZ = 0.5;
export const EDGE_MARGIN = 0.12;
export const BOUNDS_MIN = 0.06;
export const BOUNDS_MAX = 0.94;
export const WANDER_INTERVAL_MIN_MS = 2000;
export const WANDER_INTERVAL_MAX_MS = 4000;
export const DETECTION_RADIUS = 0.35;
export const CONTACT_RADIUS = 0.05;

const TWO_PI = Math.PI * 2;

const randomUnitVector = (rng) => {
  const angle = rng() * TWO_PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

// Wraps an angle difference into (-PI, PI] so a turn never goes "the long way around".
const wrapAngle = (angle) => (((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI;

const turnToward = (current, desired, maxAngle) => {
  const currentAngle = Math.atan2(current.y, current.x);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const diff = clamp(wrapAngle(desiredAngle - currentAngle), -maxAngle, maxAngle);
  const angle = currentAngle + diff;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const easeToward = (current, target, maxDelta) => {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
};

const unitVectorTo = (fromX, fromY, toX, toY) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  // Already at the target point; an arbitrary direction avoids a NaN heading.
  if (len === 0) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
};

// Distance-to-edge on one axis: positive "dir" means steer toward increasing
// value (near the low edge), negative means steer toward decreasing value.
const edgeSteer = (pos) => {
  if (pos < EDGE_MARGIN) return { dir: 1, dist: pos };
  if (pos > 1 - EDGE_MARGIN) return { dir: -1, dist: 1 - pos };
  return { dir: 0, dist: EDGE_MARGIN };
};

const applyEdgeSteering = (x, y, desired) => {
  const ex = edgeSteer(x);
  const ey = edgeSteer(y);
  if (ex.dir === 0 && ey.dir === 0) return desired;
  const closestDist = Math.min(
    ex.dir !== 0 ? ex.dist : EDGE_MARGIN,
    ey.dir !== 0 ? ey.dist : EDGE_MARGIN,
  );
  const blend = clamp((EDGE_MARGIN - closestDist) / EDGE_MARGIN, 0, 1);
  const blendedX = desired.x * (1 - blend) + ex.dir * blend;
  const blendedY = desired.y * (1 - blend) + ey.dir * blend;
  const len = Math.hypot(blendedX, blendedY);
  if (len === 0) return desired;
  return { x: blendedX / len, y: blendedY / len };
};

export const createMovementState = (x, y, rng = Math.random) => ({
  x,
  y,
  heading: randomUnitVector(rng),
  speed: 0,
  cruiseSpeed: CRUISE_SPEED_MIN + rng() * (CRUISE_SPEED_MAX - CRUISE_SPEED_MIN),
  wobblePhase: rng() * TWO_PI,
  wanderTarget: null,
  wanderTargetExpiresAt: 0,
});

// target: { x, y } | null — a claimed drop's position, or null for idle wander.
export const stepMovement = (moveState, dt, now, boundsWidth, target, rng = Math.random) => {
  let { wanderTarget, wanderTargetExpiresAt } = moveState;
  let desiredPoint = target;
  let desiredSpeed = moveState.cruiseSpeed;

  if (!target) {
    if (!wanderTarget || now >= wanderTargetExpiresAt) {
      wanderTarget = {
        x: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
        y: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
      };
      wanderTargetExpiresAt =
        now + WANDER_INTERVAL_MIN_MS + rng() * (WANDER_INTERVAL_MAX_MS - WANDER_INTERVAL_MIN_MS);
    }
    desiredPoint = wanderTarget;
  } else {
    desiredSpeed = moveState.cruiseSpeed * SEEK_SPEED_MULTIPLIER;
  }

  const rawDesiredHeading = unitVectorTo(moveState.x, moveState.y, desiredPoint.x, desiredPoint.y);
  const desiredHeading = applyEdgeSteering(moveState.x, moveState.y, rawDesiredHeading);

  const heading = turnToward(moveState.heading, desiredHeading, TURN_RATE_RAD_PER_SEC * dt);
  const speed = easeToward(moveState.speed, desiredSpeed, ACCEL_PX_PER_SEC2 * dt);

  const stepFrac = (speed * dt) / boundsWidth;
  const x = clamp(moveState.x + heading.x * stepFrac, 0, 1);
  const y = clamp(moveState.y + heading.y * stepFrac, 0, 1);

  return {
    ...moveState,
    x,
    y,
    heading,
    speed,
    wanderTarget,
    wanderTargetExpiresAt,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/movement.js lib/aquarium/movement.test.js
git commit -m "feat: add wander kinematics for aquarium movement engine"
```

---

### Task 2: movement.js — seek override and wobble

**Files:**
- Modify: `lib/aquarium/movement.js` (extend `stepMovement`'s already-present `target` handling — no behavior change needed there, it already prefers `target` over wander; this task adds tests proving it, plus a new `wobbleOffset` export)
- Test: `lib/aquarium/movement.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `wobbleOffset(heading, wobblePhase, now)` → `{ x, y }` fractional offset. `WOBBLE_AMPLITUDE_FRAC`, `WOBBLE_FREQUENCY_HZ` (already exported from Task 1).

- [ ] **Step 1: Write the failing tests**

Append to `lib/aquarium/movement.test.js`:

```js
import { wobbleOffset, WOBBLE_AMPLITUDE_FRAC, DETECTION_RADIUS } from './movement';

describe('stepMovement seek', () => {
  it('overrides wander and heads toward the target instead', () => {
    const ms = { ...createMovementState(0.5, 0.5, () => 0.01), heading: { x: 0, y: -1 } };
    // Wander (no target) would have picked a target near (0.06, 0.06) given rng()=0.01.
    const target = { x: 0.9, y: 0.5 };
    const next = stepMovement(ms, 0.05, 1000, 500, target, () => 0.01);
    // Heading should have turned toward +x (toward the target), not stayed at -y.
    expect(next.heading.x).toBeGreaterThan(ms.heading.x);
  });

  it('does not touch wanderTarget while seeking', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.05, 1000, 500, { x: 0.9, y: 0.9 }, () => 0.5);
    expect(next.wanderTarget).toBeNull();
  });

  it('seeks faster than cruise speed', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, { x: 0.9, y: 0.9 }, () => 0.5);
    }
    expect(ms.speed).toBeGreaterThan(ms.cruiseSpeed);
  });
});

describe('DETECTION_RADIUS', () => {
  it('is a positive fraction of the tank', () => {
    expect(DETECTION_RADIUS).toBeGreaterThan(0);
    expect(DETECTION_RADIUS).toBeLessThan(1);
  });
});

describe('wobbleOffset', () => {
  it('is a pure function of its inputs', () => {
    const heading = { x: 1, y: 0 };
    const a = wobbleOffset(heading, 0.3, 1000);
    const b = wobbleOffset(heading, 0.3, 1000);
    expect(a).toEqual(b);
  });

  it('stays within the configured amplitude', () => {
    const heading = { x: 1, y: 0 };
    for (let t = 0; t < 5000; t += 137) {
      const offset = wobbleOffset(heading, 0.7, t);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(WOBBLE_AMPLITUDE_FRAC + 1e-9);
    }
  });

  it('is perpendicular to the heading', () => {
    const heading = { x: 1, y: 0 };
    const offset = wobbleOffset(heading, Math.PI / 2, 500);
    // Dot product of a perpendicular offset with the heading is ~0.
    expect(Math.abs(offset.x * heading.x + offset.y * heading.y)).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: FAIL — `wobbleOffset is not exported` / seek tests may already pass since Task 1's `stepMovement` already honors `target`, but `wobbleOffset` import fails the whole file.

- [ ] **Step 3: Implement `wobbleOffset`**

Add to `lib/aquarium/movement.js`, after `applyEdgeSteering`:

```js
export const wobbleOffset = (heading, wobblePhase, now) => {
  const s = Math.sin(wobblePhase + TWO_PI * WOBBLE_FREQUENCY_HZ * (now / 1000));
  const amplitude = WOBBLE_AMPLITUDE_FRAC * s;
  // Perpendicular to heading, so the wobble reads as a tail-wag, not a stutter-step.
  return { x: -heading.y * amplitude, y: heading.x * amplitude };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: PASS (all tests green, including Task 1's).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/movement.js lib/aquarium/movement.test.js
git commit -m "feat: add seek override and wobble to movement engine"
```

---

### Task 3: simulation.js — data model additions (drops, dirt spots, seekTargetId)

**Files:**
- Modify: `lib/aquarium/simulation.js:27-48` (`makeCreature`, `createDefaultTank`)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createDefaultTank(...)` now returns a tank with `foodDrops: []`, `toyDrops: []`, `dirtSpots: []`; each creature has `seekTargetId: null`.

- [ ] **Step 1: Write the failing test**

Append to `lib/aquarium/simulation.test.js` (near the `createDefaultTank` describe block):

```js
describe('createDefaultTank drop/dirt-spot fields', () => {
  it('starts with empty drop and dirt-spot arrays', () => {
    const tank = createDefaultTank(1000, () => 0.5);
    expect(tank.foodDrops).toEqual([]);
    expect(tank.toyDrops).toEqual([]);
    expect(tank.dirtSpots).toEqual([]);
  });

  it('starts each creature with no seek target', () => {
    const tank = createDefaultTank(1000, () => 0.5);
    tank.creatures.forEach((c) => expect(c.seekTargetId).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "drop and dirt-spot"`
Expected: FAIL — `tank.foodDrops` is `undefined`.

- [ ] **Step 3: Implement the data model additions**

In `lib/aquarium/simulation.js`, modify `makeCreature` (currently lines 27-37) and `createDefaultTank` (currently lines 39-48):

```js
const makeCreature = (now, rng) => ({
  id: generateId(),
  species: randomSpecies(rng),
  bornAt: now,
  stage: 'baby',
  hunger: NEED_MAX,
  happiness: NEED_MAX,
  wellMetSince: null,
  seekTargetId: null,
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
  foodDrops: [],
  toyDrops: [],
  dirtSpots: [],
  creatures: [makeCreature(now, rng), makeCreature(now, rng)],
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS (all tests in the file, including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add drop and dirt-spot fields to tank data model"
```

---

### Task 4: simulation.js — dropFood / dropToy with cap and eviction

**Files:**
- Modify: `lib/aquarium/simulation.js` (add after the existing `hatchEgg` function)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `generateId` (already imported from `../random`).
- Produces: `MAX_DROPS_PER_TYPE = 6`; `dropFood(state, x, y, now = state.lastSeen)`; `dropToy(state, x, y, now = state.lastSeen)`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/aquarium/simulation.test.js`:

```js
import { MAX_DROPS_PER_TYPE, dropFood, dropToy } from './simulation'; // add to existing import block instead of a new import line

describe('dropFood / dropToy', () => {
  it('adds a food drop at the given point', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = dropFood(tank, 0.3, 0.4, 1000);
    expect(next.foodDrops).toHaveLength(1);
    expect(next.foodDrops[0]).toMatchObject({ x: 0.3, y: 0.4, createdAt: 1000 });
    expect(next.foodDrops[0].id).toBeTruthy();
  });

  it('adds a toy drop independently of food drops', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const withFood = dropFood(tank, 0.1, 0.1, 1000);
    const next = dropToy(withFood, 0.6, 0.6, 2000);
    expect(next.foodDrops).toHaveLength(1);
    expect(next.toyDrops).toHaveLength(1);
  });

  it('evicts the oldest drop once the cap is exceeded', () => {
    let tank = createDefaultTank(0, () => 0.5);
    for (let i = 0; i < MAX_DROPS_PER_TYPE + 2; i += 1) {
      tank = dropFood(tank, 0.1, 0.1, i);
    }
    expect(tank.foodDrops).toHaveLength(MAX_DROPS_PER_TYPE);
    expect(tank.foodDrops[0].createdAt).toBe(2);
    expect(tank.foodDrops[tank.foodDrops.length - 1].createdAt).toBe(MAX_DROPS_PER_TYPE + 1);
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    dropFood(tank, 0.1, 0.1, 1000);
    expect(tank.foodDrops).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "dropFood"`
Expected: FAIL — `dropFood is not exported`.

- [ ] **Step 3: Implement `dropFood`/`dropToy`**

Add to `lib/aquarium/simulation.js`, after `hatchEgg`:

```js
export const MAX_DROPS_PER_TYPE = 6;

const addDrop = (drops, x, y, now) => {
  const next = [...drops, { id: generateId(), x, y, createdAt: now }];
  return next.length > MAX_DROPS_PER_TYPE ? next.slice(next.length - MAX_DROPS_PER_TYPE) : next;
};

export const dropFood = (state, x, y, now = state.lastSeen) => ({
  ...state,
  foodDrops: addDrop(state.foodDrops, x, y, now),
});

export const dropToy = (state, x, y, now = state.lastSeen) => ({
  ...state,
  toyDrops: addDrop(state.toyDrops, x, y, now),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add dropFood/dropToy with capped eviction"
```

---

### Task 5: simulation.js — findDrop and consumeDrop

**Files:**
- Modify: `lib/aquarium/simulation.js` (add after `dropFood`/`dropToy`)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `mapCreature`, `raise`, `withEggProgress`, `FEED_AMOUNT`, `PLAY_AMOUNT` (all already defined in the file).
- Produces: `findDrop(state, dropId)` → `{ type: 'food' | 'toy', drop } | null`; `consumeDrop(state, creatureId, dropId)`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/aquarium/simulation.test.js`:

```js
import { findDrop, consumeDrop } from './simulation'; // add to existing import block

describe('findDrop', () => {
  it('finds a food drop by id', () => {
    const tank = dropFood(createDefaultTank(0, () => 0.5), 0.2, 0.2, 1000);
    const found = findDrop(tank, tank.foodDrops[0].id);
    expect(found.type).toBe('food');
    expect(found.drop).toBe(tank.foodDrops[0]);
  });

  it('finds a toy drop by id', () => {
    const tank = dropToy(createDefaultTank(0, () => 0.5), 0.2, 0.2, 1000);
    const found = findDrop(tank, tank.toyDrops[0].id);
    expect(found.type).toBe('toy');
  });

  it('returns null for an unknown id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    expect(findDrop(tank, 'does-not-exist')).toBeNull();
  });
});

describe('consumeDrop', () => {
  it('raises hunger and removes the food drop', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank = dropFood(tank, 0.2, 0.2, 1000);
    const dropId = tank.foodDrops[0].id;
    const next = consumeDrop(tank, tank.creatures[0].id, dropId);
    expect(next.creatures[0].hunger).toBeGreaterThan(20);
    expect(next.foodDrops).toHaveLength(0);
  });

  it('raises happiness and removes the toy drop', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].happiness = 20;
    tank = dropToy(tank, 0.2, 0.2, 1000);
    const dropId = tank.toyDrops[0].id;
    const next = consumeDrop(tank, tank.creatures[0].id, dropId);
    expect(next.creatures[0].happiness).toBeGreaterThan(20);
    expect(next.toyDrops).toHaveLength(0);
  });

  it('clears the consuming creature seekTargetId', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = dropFood(tank, 0.2, 0.2, 1000);
    const dropId = tank.foodDrops[0].id;
    tank.creatures[0].seekTargetId = dropId;
    const next = consumeDrop(tank, tank.creatures[0].id, dropId);
    expect(next.creatures[0].seekTargetId).toBeNull();
  });

  it('advances egg progress on consumption', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = dropFood(tank, 0.2, 0.2, 1000);
    const next = consumeDrop(tank, tank.creatures[0].id, tank.foodDrops[0].id);
    expect(next.eggProgress).toBe(EGG_FILL_PER_ACTION);
  });

  it('is a no-op for an unknown drop id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = consumeDrop(tank, tank.creatures[0].id, 'nope');
    expect(next).toEqual(tank);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "consumeDrop"`
Expected: FAIL — `consumeDrop is not exported`.

- [ ] **Step 3: Implement `findDrop`/`consumeDrop`**

Add to `lib/aquarium/simulation.js`, after `dropToy`:

```js
export const findDrop = (state, dropId) => {
  const food = state.foodDrops.find((d) => d.id === dropId);
  if (food) return { type: 'food', drop: food };
  const toy = state.toyDrops.find((d) => d.id === dropId);
  if (toy) return { type: 'toy', drop: toy };
  return null;
};

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
  return withEggProgress(
    mapCreature(withoutDrop, creatureId, (c) => ({
      ...c,
      [key]: raise(c[key], amount),
      seekTargetId: null,
    })),
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add findDrop/consumeDrop for care-completion events"
```

---

### Task 6: simulation.js — assignSeekTargets claiming logic

**Files:**
- Modify: `lib/aquarium/simulation.js` (add after `consumeDrop`; add `DETECTION_RADIUS` import from `./movement`)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `DETECTION_RADIUS` from `./movement`; `distance` (already defined in the file); `MET_THRESHOLD` (already defined).
- Produces: `assignSeekTargets(state)`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/aquarium/simulation.test.js`:

```js
import { assignSeekTargets } from './simulation'; // add to existing import block

describe('assignSeekTargets', () => {
  it('claims the nearest food drop for a hungry creature within range', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({ ...c, x: 0.5, y: 0.5, id: `c${i}` }));
    tank.creatures[0].hunger = 20;
    tank.creatures[1].hunger = 90;
    tank = dropFood(tank, 0.55, 0.5, 1000);
    const next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);
    expect(next.creatures[1].seekTargetId).toBeNull();
  });

  it('does not claim a drop outside the detection radius', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].x = 0.05;
    tank.creatures[0].y = 0.05;
    tank = dropFood(tank, 0.95, 0.95, 1000);
    const next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBeNull();
  });

  it('a satisfied creature never claims a drop', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures.forEach((c) => {
      c.hunger = NEED_MAX;
      c.happiness = NEED_MAX;
      c.x = 0.5;
      c.y = 0.5;
    });
    tank = dropFood(tank, 0.5, 0.5, 1000);
    const next = assignSeekTargets(tank);
    next.creatures.forEach((c) => expect(c.seekTargetId).toBeNull());
  });

  it('does not double-claim the same drop for two eligible creatures', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({
      ...c, x: 0.5, y: 0.5, hunger: 20, id: `c${i}`,
    }));
    tank = dropFood(tank, 0.5, 0.5, 1000);
    const next = assignSeekTargets(tank);
    const claimants = next.creatures.filter((c) => c.seekTargetId === tank.foodDrops[0].id);
    expect(claimants).toHaveLength(1);
  });

  it('prefers the more urgent need when both hunger and happiness are low', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].happiness = 90;
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank = dropToy(tank, 0.5, 0.5, 1000);
    tank = dropFood(tank, 0.5, 0.5, 1000);
    const next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);
  });

  it('clears a claim once the creature is no longer eligible', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = dropFood(tank, 0.5, 0.5, 1000);
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank.creatures[0].seekTargetId = tank.foodDrops[0].id;
    tank.creatures[0].hunger = NEED_MAX;
    const next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBeNull();
  });

  it('clears a claim once its drop no longer exists', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].seekTargetId = 'stale-id';
    const next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBeNull();
  });

  it('does not mutate the input state', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank = dropFood(tank, 0.5, 0.5, 1000);
    const before = tank.creatures[0].seekTargetId;
    assignSeekTargets(tank);
    expect(tank.creatures[0].seekTargetId).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "assignSeekTargets"`
Expected: FAIL — `assignSeekTargets is not exported`.

- [ ] **Step 3: Implement `assignSeekTargets`**

Add `import { DETECTION_RADIUS } from './movement';` to the top of `lib/aquarium/simulation.js` (alongside the existing `import { clamp, generateId } from '../random';` and `import { speciesKeys, DEFAULT_SPECIES } from './creatures';`).

Add to `lib/aquarium/simulation.js`, after `consumeDrop`:

```js
export const assignSeekTargets = (state) => {
  const dropById = new Map([
    ...state.foodDrops.map((d) => [d.id, { ...d, type: 'food' }]),
    ...state.toyDrops.map((d) => [d.id, { ...d, type: 'toy' }]),
  ]);

  const creatures = state.creatures.map((c) => {
    const current = c.seekTargetId ? dropById.get(c.seekTargetId) : null;
    const stillEligible =
      current
      && ((current.type === 'food' && c.hunger < MET_THRESHOLD)
        || (current.type === 'toy' && c.happiness < MET_THRESHOLD));
    return { ...c, seekTargetId: stillEligible ? c.seekTargetId : null };
  });

  const claimed = new Set(creatures.filter((c) => c.seekTargetId).map((c) => c.seekTargetId));
  const unclaimedDrops = [...dropById.values()].filter((d) => !claimed.has(d.id));

  const pairs = [];
  creatures.forEach((c) => {
    if (c.seekTargetId) return;
    const wantsFood = c.hunger < MET_THRESHOLD;
    const wantsToy = c.happiness < MET_THRESHOLD;
    if (!wantsFood && !wantsToy) return;
    const preferType = wantsFood && (!wantsToy || c.hunger <= c.happiness) ? 'food' : 'toy';
    unclaimedDrops
      .filter((d) => d.type === preferType && distance(c, d.x, d.y) <= DETECTION_RADIUS)
      .forEach((d) => pairs.push({ creatureId: c.id, dropId: d.id, dist: distance(c, d.x, d.y) }));
  });
  pairs.sort((a, b) => a.dist - b.dist);

  const usedCreatures = new Set();
  const usedDrops = new Set();
  const assignments = new Map();
  pairs.forEach((p) => {
    if (usedCreatures.has(p.creatureId) || usedDrops.has(p.dropId)) return;
    usedCreatures.add(p.creatureId);
    usedDrops.add(p.dropId);
    assignments.set(p.creatureId, p.dropId);
  });

  return {
    ...state,
    creatures: creatures.map((c) => (
      assignments.has(c.id) ? { ...c, seekTargetId: assignments.get(c.id) } : c
    )),
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: add nearest-fish-to-nearest-drop seek claiming"
```

---

### Task 7: simulation.js — dirt spots and applyElapsed wiring

**Files:**
- Modify: `lib/aquarium/simulation.js:76-98` (`applyElapsed`); add new exports after `assignSeekTargets`
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `BOUNDS_MIN`, `BOUNDS_MAX` from `./movement` (add to the existing import from that module).
- Produces: `DIRT_SPOT_CAP = 6`; `DIRT_SPOT_STEP = 10`; `DIRT_SPOT_CLEAN_AMOUNT = 20`; `spawnDirtSpot(state, rng = Math.random)`; `wipeDirtSpot(state, id)`; `applyElapsed(state, elapsedMs, now = Date.now(), rng = Math.random)` (new 4th param, backward compatible).

- [ ] **Step 1: Write the failing tests**

Append to `lib/aquarium/simulation.test.js`:

```js
import { DIRT_SPOT_CAP, spawnDirtSpot, wipeDirtSpot } from './simulation'; // add to existing import block

describe('spawnDirtSpot', () => {
  it('adds a spot within tank bounds', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = spawnDirtSpot(tank, () => 0.5);
    expect(next.dirtSpots).toHaveLength(1);
    expect(next.dirtSpots[0].x).toBeGreaterThanOrEqual(0);
    expect(next.dirtSpots[0].x).toBeLessThanOrEqual(1);
  });

  it('evicts the oldest spot once the cap is exceeded', () => {
    let tank = createDefaultTank(0, () => 0.5);
    for (let i = 0; i < DIRT_SPOT_CAP + 2; i += 1) {
      tank = { ...tank, lastSeen: i };
      tank = spawnDirtSpot(tank, () => 0.5);
    }
    expect(tank.dirtSpots).toHaveLength(DIRT_SPOT_CAP);
    expect(tank.dirtSpots[0].createdAt).toBe(2);
  });
});

describe('wipeDirtSpot', () => {
  it('removes the spot and raises cleanliness', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.tankCleanliness = 50;
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.dirtSpots).toHaveLength(0);
    expect(next.tankCleanliness).toBeGreaterThan(50);
  });

  it('advances egg progress on wipe', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.eggProgress).toBe(EGG_FILL_PER_ACTION);
  });

  it('is a no-op for an unknown spot id', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = wipeDirtSpot(tank, 'nope');
    expect(next).toEqual(tank);
  });
});

describe('applyElapsed dirt spots', () => {
  it('spawns a dirt spot as cleanliness crosses a 10-point step', () => {
    const tank = createDefaultTank(0, () => 0.5);
    // CLEAN_DECAY_PER_MIN is 0.05/min; 200 minutes decays cleanliness by 10.
    const next = applyElapsed(tank, 200 * MIN, 200 * MIN, () => 0.5);
    expect(next.dirtSpots.length).toBeGreaterThanOrEqual(1);
  });

  it('does not spawn a spot when cleanliness has not crossed a step', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const next = applyElapsed(tank, MIN, MIN, () => 0.5);
    expect(next.dirtSpots).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "spawnDirtSpot"`
Expected: FAIL — `spawnDirtSpot is not exported`.

- [ ] **Step 3: Implement dirt spots and wire into `applyElapsed`**

Change the `movement` import line added in Task 6 to:

```js
import { DETECTION_RADIUS, BOUNDS_MIN, BOUNDS_MAX } from './movement';
```

Add to `lib/aquarium/simulation.js`, after `assignSeekTargets`:

```js
export const DIRT_SPOT_CAP = 6;
export const DIRT_SPOT_STEP = 10;
export const DIRT_SPOT_CLEAN_AMOUNT = 20;

export const spawnDirtSpot = (state, rng = Math.random) => {
  const spot = {
    id: generateId(),
    x: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
    y: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
    createdAt: state.lastSeen,
  };
  const next = [...state.dirtSpots, spot];
  const dirtSpots = next.length > DIRT_SPOT_CAP ? next.slice(next.length - DIRT_SPOT_CAP) : next;
  return { ...state, dirtSpots };
};

export const wipeDirtSpot = (state, id) => {
  if (!state.dirtSpots.some((s) => s.id === id)) return state;
  return withEggProgress({
    ...state,
    dirtSpots: state.dirtSpots.filter((s) => s.id !== id),
    tankCleanliness: raise(state.tankCleanliness, DIRT_SPOT_CLEAN_AMOUNT),
  });
};

// Number of DIRT_SPOT_STEP-point thresholds crossed going from prevClean down to nextClean.
const dirtSpotSteps = (prevClean, nextClean) => {
  const prevSteps = Math.floor((NEED_MAX - prevClean) / DIRT_SPOT_STEP);
  const nextSteps = Math.floor((NEED_MAX - nextClean) / DIRT_SPOT_STEP);
  return Math.max(0, nextSteps - prevSteps);
};
```

Replace `applyElapsed` (currently lines 76-98) with:

```js
export const applyElapsed = (state, elapsedMs, now = Date.now(), rng = Math.random) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const prevNow = state.lastSeen;
  const prevCleanliness = state.tankCleanliness;
  const tankCleanliness = decayNeed(prevCleanliness, CLEAN_DECAY_PER_MIN, minutes);
  const dirty = tankCleanliness < MET_THRESHOLD;

  const creatures = state.creatures.map((c) => {
    const hunger = decayNeed(c.hunger, HUNGER_DECAY_PER_MIN, minutes);
    const dragged = dirty
      ? clamp(c.happiness - DIRTY_DRAG_PER_MIN * minutes, NEED_FLOOR, NEED_MAX)
      : c.happiness;
    const happiness = decayNeed(dragged, HAPPINESS_DECAY_PER_MIN, minutes);
    // metEnv folds the shared tank condition into the per-creature growth check.
    return grow(
      { ...c, hunger, happiness, metEnv: tankCleanliness >= MET_THRESHOLD },
      now,
      prevNow,
    );
  });

  let next = { ...state, tankCleanliness, creatures, lastSeen: now };
  const spotsToAdd = dirtSpotSteps(prevCleanliness, tankCleanliness);
  for (let i = 0; i < spotsToAdd; i += 1) {
    next = spawnDirtSpot(next, rng);
  }
  return next;
};
```

Note: `spawnDirtSpot` and `dirtSpotSteps` must be defined **before** `applyElapsed` in the file (function declarations via `const` are not hoisted) — place the dirt-spot block from this step immediately after `assignSeekTargets` and before `applyElapsed`'s definition; since `applyElapsed` currently sits earlier in the file (lines 76-98) than `assignSeekTargets` (added at the end in Task 6), this task also **moves** `applyElapsed`'s definition to after the new dirt-spot helpers. Keep `decayNeed` and `grow` (both used by `applyElapsed`) where they already are, above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS (full file, including all pre-existing `applyElapsed` tests — the new 4th `rng` parameter is optional so old 3-arg call sites are unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat: spawn dirt spots as tank cleanliness decays"
```

---

### Task 8: simulation.js — remove superseded tank-wide/wander API

**Files:**
- Modify: `lib/aquarium/simulation.js` (remove `feedTank`, `playTank`, `cleanTank`, `feedCreature`, `playCreature`, `wanderCreatures`, `WANDER_MIN`, `WANDER_MAX`, `WANDER_STEP`, `FEED_RADIUS`, `TANK_ACTION_MAX_TARGETS`, `CLEAN_AMOUNT`, `targetIds`)
- Modify: `lib/aquarium/simulation.test.js` (remove the `directed care`, `tank-wide care`, and `wanderCreatures` describe blocks and their imports)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a pure removal task. After this task, `lib/aquarium/simulation.js`'s full export surface is: `SCHEMA_VERSION`, `NEED_FLOOR`, `NEED_MAX`, `TANK_CAP`, `MET_THRESHOLD`, `HUNGER_DECAY_PER_MIN`, `HAPPINESS_DECAY_PER_MIN`, `CLEAN_DECAY_PER_MIN`, `DIRTY_DRAG_PER_MIN`, `STAGE_DURATIONS_MS`, `MAX_ELAPSED_MS`, `createDefaultTank`, `applyElapsed`, `FEED_AMOUNT`, `PLAY_AMOUNT`, `EGG_FILL_PER_ACTION`, `hatchEgg`, `MAX_DROPS_PER_TYPE`, `dropFood`, `dropToy`, `findDrop`, `consumeDrop`, `assignSeekTargets`, `DIRT_SPOT_CAP`, `DIRT_SPOT_STEP`, `DIRT_SPOT_CLEAN_AMOUNT`, `spawnDirtSpot`, `wipeDirtSpot`.

- [ ] **Step 1: Delete the superseded exports from `lib/aquarium/simulation.js`**

Remove: `export const FEED_RADIUS = 0.3;`, `export const TANK_ACTION_MAX_TARGETS = 3;`, `export const CLEAN_AMOUNT = 60;`, the `targetIds` helper, `feedCreature`, `playCreature`, `cleanTank`, `feedTank`, `playTank`, the `WANDER_MIN`/`WANDER_MAX`/`WANDER_STEP` constants, and `wanderCreatures`. Keep `raise`, `mapCreature`, `distance`, `withEggProgress` (still used by the new drop/dirt-spot functions), `FEED_AMOUNT`, `PLAY_AMOUNT`, `EGG_FILL_PER_ACTION`, `hatchEgg`.

- [ ] **Step 2: Remove the now-invalid tests from `lib/aquarium/simulation.test.js`**

Delete the `describe('directed care', ...)`, `describe('tank-wide care', ...)`, and `describe('wanderCreatures', ...)` blocks. Remove `feedCreature`, `playCreature`, `feedTank`, `cleanTank`, `WANDER_MIN`, `WANDER_MAX`, `wanderCreatures`, `FEED_AMOUNT` (keep `FEED_AMOUNT` — it's still used by the `consumeDrop` tests added in Task 5) from the top-level import block. Keep the `egg progress` describe block but change its `cleanTank` calls to use `wipeDirtSpot` on a spawned spot instead (cleanliness-raising is now spot-based, not a standalone tank-wide action):

```js
describe('egg progress', () => {
  it('accumulates egg progress on each care action', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.eggProgress).toBe(EGG_FILL_PER_ACTION);
  });

  it('spawns an egg when progress fills and creatures are under cap', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.eggProgress = NEED_MAX - EGG_FILL_PER_ACTION;
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.egg).not.toBeNull();
    expect(next.eggProgress).toBe(0);
  });

  it('stops filling at tank cap', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = Array.from({ length: TANK_CAP }, (_, i) => ({
      ...tank.creatures[0],
      id: `c${i}`,
    }));
    tank.eggProgress = 50;
    tank = spawnDirtSpot(tank, () => 0.5);
    const next = wipeDirtSpot(tank, tank.dirtSpots[0].id);
    expect(next.eggProgress).toBe(50);
    expect(next.egg).toBeNull();
  });
});
```

(These three tests already exist in the file from the original spec; this step replaces their bodies in place rather than adding new ones.)

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS — no reference to a removed export remains anywhere in the test file.

- [ ] **Step 4: Run lint on the touched files**

Run: `npx eslint lib/aquarium/simulation.js lib/aquarium/simulation.test.js`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "refactor: remove superseded tank-wide care and wander API"
```

---

### Task 9: creatures.js — larger fish for touch-table use

**Files:**
- Modify: `lib/aquarium/creatures.js:3-25` (`SPECIES.*.sizePx`)
- Test: `lib/aquarium/creatures.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports — `getSpecies(key).sizePx` now returns `{ baby: 60, child: 84, adult: 108 }` for every species.

- [ ] **Step 1: Write the failing test**

Append to `lib/aquarium/creatures.test.js`:

```js
describe('sizePx', () => {
  it('is doubled for touch-table use, uniformly across species', () => {
    speciesKeys().forEach((key) => {
      expect(SPECIES[key].sizePx).toEqual({ baby: 60, child: 84, adult: 108 });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aquarium/creatures.test.js -t "sizePx"`
Expected: FAIL — current `sizePx` values are `{28,40,56}`/`{28,42,60}`.

- [ ] **Step 3: Update `sizePx` for every species**

In `lib/aquarium/creatures.js`, set `sizePx: { baby: 60, child: 84, adult: 108 }` on all three species entries (`clownfish`, `tropicalfish`, `blowfish`), replacing their current (differing) values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/creatures.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/creatures.js lib/aquarium/creatures.test.js
git commit -m "feat: double fish size for touch-table display"
```

---

### Task 10: page.jsx — two-tool palette, drop-to-feed/play, tap/drag-to-wipe

**Files:**
- Modify: `pages/aquarium/index.jsx` (full interaction-handling rewrite; RAF movement loop deferred to Task 11)
- Modify: `__tests__/pages/aquarium/index.test.jsx`

**Interfaces:**
- Consumes: `dropFood`, `dropToy`, `wipeDirtSpot` from `../../lib/aquarium/simulation` (`feedTank`/`playTank`/`cleanTank`/`feedCreature`/`playCreature`/`wanderCreatures`/`hatchEgg` imports updated — the removed ones no longer exist per Task 8).
- Produces: page renders `data-testid="foodDrop"` / `data-testid="toyDrop"` / `data-testid="dirtSpot"` elements; tool palette has exactly two buttons (`Food`, `Toy`).

- [ ] **Step 1: Write the failing tests**

Replace `__tests__/pages/aquarium/index.test.jsx` with:

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Aquarium from '../../../pages/aquarium/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Aquarium page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the two-tool palette', () => {
    render(<Aquarium />);
    expect(screen.getByRole('button', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sponge/i })).not.toBeInTheDocument();
  });

  it('renders starter creatures', () => {
    render(<Aquarium />);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });

  it('selecting a tool marks it pressed', () => {
    render(<Aquarium />);
    const toy = screen.getByRole('button', { name: /toy/i });
    fireEvent.click(toy);
    expect(toy).toHaveAttribute('aria-pressed', 'true');
  });

  it('mute toggle flips its label', () => {
    render(<Aquarium />);
    const mute = screen.getByRole('button', { name: /sound/i });
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('tapping the tank with food selected drops food', () => {
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });

  it('tapping the tank with toy selected drops a toy', () => {
    render(<Aquarium />);
    fireEvent.click(screen.getByRole('button', { name: /toy/i }));
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('toyDrop').length).toBeGreaterThan(0);
  });

  it('tapping a creature also drops at that point (no per-creature action left)', () => {
    render(<Aquarium />);
    const first = screen.getAllByTestId('creature')[0];
    fireEvent.click(first, { clientX: 20, clientY: 20 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: FAIL — page still imports removed simulation exports and renders three tools.

- [ ] **Step 3: Rewrite `pages/aquarium/index.jsx`**

```jsx
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import styles from './index.module.css';
import { pwaMetaTags } from '../../components/layout';
import { getSpecies } from '../../lib/aquarium/creatures';
import { loadTank, saveTank } from '../../lib/aquarium/storage';
import { clamp, generateId } from '../../lib/random';
import {
  applyElapsed,
  dropFood,
  dropToy,
  wipeDirtSpot,
  hatchEgg,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
} from '../../lib/aquarium/simulation';
import { createSound } from '../../lib/aquarium/sound';

const TICK_MS = 2000;
const DRAG_SAMPLE_MS = 120;
const PULSE_MS = 650;
const EFFECT_MS = 900;
// Touch jitter on a stationary tap can still fire a pointermove; require real
// movement before treating a press as a drag, so a tap never double-acts.
const MIN_DRAG_PX = 12;

const TOOLS = [
  { key: 'food', label: 'Food', emoji: '🍤', effect: '🍤' },
  { key: 'toy', label: 'Toy', emoji: '🎾', effect: '💗' },
];
const TOOLS_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t]));

const WANT_BUBBLE_THRESHOLD = 0.7;
const needUrgency = (value) => {
  const metFraction = clamp((value - NEED_FLOOR) / (NEED_MAX - NEED_FLOOR), 0, 1);
  if (metFraction >= WANT_BUBBLE_THRESHOLD) return 0;
  return 1 - metFraction / WANT_BUBBLE_THRESHOLD;
};
const wantBubble = (creature) => {
  const hungerUrgency = needUrgency(creature.hunger);
  const happinessUrgency = needUrgency(creature.happiness);
  const urgency = Math.max(hungerUrgency, happinessUrgency);
  if (urgency <= 0) return null;
  return { emoji: hungerUrgency >= happinessUrgency ? '🍤' : '🎾', visible: urgency };
};

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
  const [pulsingIds, setPulsingIds] = useState(() => new Set());
  const [effects, setEffects] = useState([]);
  const soundRef = useRef(null);
  const tankRef = useRef(null);
  const dragRef = useRef({ active: false, lastSample: 0 });

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
    // Deliberately depends on presence, not identity: the interval only needs
    // to start once tank first loads, and setTank/applyElapsed/saveTank are
    // stable across renders.
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

  // Brief bounce/flash on the exact creature/spot a directed action touched.
  const pulse = (id) => {
    setPulsingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setPulsingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, PULSE_MS);
  };

  // Ripple at the tap/drag point, since which creature will eventually reach
  // a drop isn't known at drop time.
  const spawnEffect = (x, y, emoji) => {
    const effectId = generateId();
    setEffects((prev) => [...prev, { id: effectId, x, y, emoji }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== effectId));
    }, EFFECT_MS);
  };

  const dropAt = (x, y) => {
    spawnEffect(x, y, TOOLS_BY_KEY[tank.selectedTool].effect);
    if (tank.selectedTool === 'food') commit((prev) => dropFood(prev, x, y));
    else commit((prev) => dropToy(prev, x, y));
  };

  const wipeSpot = (id, x, y) => {
    pulse(id);
    spawnEffect(x, y, '✨');
    commit((prev) => wipeDirtSpot(prev, id), 'sparkle');
  };

  // Any tap inside the tank drops the selected tool's item at that point —
  // including a tap that lands on a fish, per the "guaranteed feed this one"
  // interaction. Dirt spots stop this from bubbling up (see their own
  // onClick) so tapping a spot always wipes it instead of dropping.
  const handleTankClick = (e) => {
    if (!tank) return;
    const { x, y } = rectFraction(tankRef.current, e.clientX, e.clientY);
    dropAt(x, y);
  };

  const handleDirtSpotClick = (e, spot) => {
    e.stopPropagation();
    wipeSpot(spot.id, spot.x, spot.y);
  };

  // Drag repeatedly acts along the pointer path, sampled to avoid flooding
  // state updates; a real browser gets drag-wipe-across-spots via
  // elementFromPoint since jsdom doesn't implement it meaningfully.
  const handleTankPointerDown = (e) => {
    if (e.target !== tankRef.current) return;
    dragRef.current = {
      active: true,
      dragging: false,
      lastSample: 0,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

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
    const hit = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
    const spotId = hit && hit.dataset ? hit.dataset.spotId : undefined;
    if (spotId) wipeSpot(spotId, x, y);
    else dropAt(x, y);
  };

  const endTankDrag = () => {
    dragRef.current.active = false;
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

  const dirtiness = clamp((NEED_MAX - tank.tankCleanliness) / (NEED_MAX - NEED_FLOOR), 0, 1);
  const tankFilter = `sepia(${(0.55 * dirtiness).toFixed(2)}) `
    + `saturate(${(1 + 0.5 * dirtiness).toFixed(2)}) `
    + `brightness(${(1 - 0.15 * dirtiness).toFixed(2)})`;

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
        className={styles.tank}
        style={{ filter: tankFilter }}
        onClick={handleTankClick}
        onPointerDown={handleTankPointerDown}
        onPointerMove={handleTankPointerMove}
        onPointerUp={endTankDrag}
        onPointerLeave={endTankDrag}
        onPointerCancel={endTankDrag}
        role="presentation"
      >
        {tank.creatures.map((c) => {
          const species = getSpecies(c.species);
          const size = species.sizePx[c.stage];
          const classes = [styles.creature];
          if (c.hunger < MET_THRESHOLD) classes.push(styles.hungry);
          if (c.happiness < MET_THRESHOLD) classes.push(styles.sad);
          if (pulsingIds.has(c.id)) classes.push(styles.pulse);
          const bubble = wantBubble(c);
          return (
            <div
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
            >
              {species.emoji[c.stage]}
              {bubble && (
                <span
                  className={styles.wantBubble}
                  style={{ opacity: bubble.visible, transform: `scale(${0.6 + 0.4 * bubble.visible})` }}
                  aria-hidden="true"
                >
                  {bubble.emoji}
                </span>
              )}
            </div>
          );
        })}

        {tank.foodDrops.map((d) => (
          <span
            key={d.id}
            data-testid="foodDrop"
            className={styles.foodDrop}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-hidden="true"
          >
            🍤
          </span>
        ))}

        {tank.toyDrops.map((d) => (
          <span
            key={d.id}
            data-testid="toyDrop"
            className={styles.toyDrop}
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            aria-hidden="true"
          >
            🎾
          </span>
        ))}

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

        {effects.map((e) => (
          <span
            key={e.id}
            className={styles.effect}
            style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
            aria-hidden="true"
          >
            {e.emoji}
          </span>
        ))}

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

Note: creatures are rendered as a plain `<div>` (not a `<button>`) in this task, since they no longer have any click/press handler of their own — a click on a creature is meant to bubble up to the tank's `onClick` and be treated as a drop point. Task 11 adds the RAF-driven `left`/`top` positioning on top of this (this task's `c.x`/`c.y` values still come from `tank.creatures`, unchanged since the last save tick — movement isn't wired in yet).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx __tests__/pages/aquarium/index.test.jsx
git commit -m "feat: replace tool-directed care with drop/wipe interactions"
```

---

### Task 11: page.jsx — RAF movement loop, want-bubble/drop CSS

**Files:**
- Modify: `pages/aquarium/index.jsx` (add the `requestAnimationFrame` loop; wire `moveStatesRef`; apply `wobbleOffset` at render)
- Modify: `pages/aquarium/index.module.css` (remove `.creature` position transition and `swim` keyframe; remove `.moodDot`; add `.wantBubble`, `.foodDrop`, `.toyDrop`, `.dirtSpot`)
- Modify: `__tests__/pages/aquarium/index.test.jsx` (add want-bubble rendering test)

**Interfaces:**
- Consumes: `assignSeekTargets`, `findDrop`, `consumeDrop` from `../../lib/aquarium/simulation`; `createMovementState`, `stepMovement`, `wobbleOffset`, `CONTACT_RADIUS` from `../../lib/aquarium/movement`.
- Produces: creature `left`/`top` now update every animation frame; a fish that reaches its claimed drop triggers `consumeDrop` and the existing pulse/ripple/sound feedback.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/pages/aquarium/index.test.jsx`:

```jsx
it('shows a want bubble on a creature with a low need', () => {
  localStorage.setItem(
    'aquarium-tank',
    JSON.stringify({
      version: 1,
      lastSeen: Date.now(),
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 100,
      eggProgress: 0,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [{
        id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
        hunger: 20, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.5, y: 0.5,
      }],
    }),
  );
  render(<Aquarium />);
  expect(screen.getByText('🍤', { selector: `.${'wantBubble'}` })).toBeTruthy();
});
```

Since CSS Modules hash class names in some configurations, replace the brittle selector above with a more robust query. Use this version instead:

```jsx
it('shows a want bubble on a creature with a low need', () => {
  localStorage.setItem(
    'aquarium-tank',
    JSON.stringify({
      version: 1,
      lastSeen: Date.now(),
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 100,
      eggProgress: 0,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [{
        id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
        hunger: 20, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.5, y: 0.5,
      }],
    }),
  );
  render(<Aquarium />);
  const creature = screen.getByTestId('creature');
  expect(creature.textContent).toContain('🍤');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx -t "want bubble"`
Expected: FAIL if the want-bubble emoji happens not to render for this fixture (it should already pass after Task 10 since `wantBubble` logic is already wired into the JSX — this test's real purpose in this task is to lock in current behavior before the RAF loop starts mutating `c.x`/`c.y`, guarding against a regression). If it already passes, proceed directly to Step 3 (RAF loop) and re-run this test at Step 4 to confirm it still passes.

- [ ] **Step 3: Add the `requestAnimationFrame` movement loop**

In `pages/aquarium/index.jsx`, update the import from `../../lib/aquarium/simulation` to also bring in `assignSeekTargets`, `findDrop`, `consumeDrop`:

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
} from '../../lib/aquarium/simulation';
```

Add a new import line for the movement module:

```js
import { createMovementState, stepMovement, wobbleOffset, CONTACT_RADIUS } from '../../lib/aquarium/movement';
```

Add `const moveStatesRef = useRef(new Map());` alongside the other refs in the component.

Add this effect after the decay/save tick effect:

```jsx
// requestAnimationFrame movement loop: steers each fish toward its claimed
// drop (or idle wander), consuming a drop on contact. Position updates every
// frame in React state; only the existing 2s tick (above) writes to storage.
useEffect(() => {
  if (!tank) return undefined;
  let frameId;
  let lastTime = null;
  const loop = (time) => {
    const dt = lastTime == null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    const boundsWidth = tankRef.current
      ? tankRef.current.getBoundingClientRect().width || 1
      : 1;
    const now = Date.now();
    const events = [];
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
        next = consumeDrop(next, ev.creatureId, ev.dropId);
      });
      return next;
    });
    events.forEach((ev) => {
      pulse(ev.creatureId);
      spawnEffect(ev.x, ev.y, ev.dropType === 'food' ? '🍤' : '💗');
      if (soundRef.current) soundRef.current.play(ev.dropType === 'food' ? 'nom' : 'pop');
    });
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(frameId);
  // Deliberately depends on presence, not identity, same as the decay tick.
}, [tank !== null]);
```

Update the creature's inline `style` in the JSX to layer the cosmetic wobble on top of its true position, and update the `data-testid="creature"` element to read wobble from `moveStatesRef`:

```jsx
{tank.creatures.map((c) => {
  const species = getSpecies(c.species);
  const size = species.sizePx[c.stage];
  const classes = [styles.creature];
  if (c.hunger < MET_THRESHOLD) classes.push(styles.hungry);
  if (c.happiness < MET_THRESHOLD) classes.push(styles.sad);
  if (pulsingIds.has(c.id)) classes.push(styles.pulse);
  const bubble = wantBubble(c);
  const moveState = moveStatesRef.current.get(c.id);
  const wobble = moveState
    ? wobbleOffset(moveState.heading, moveState.wobblePhase, Date.now())
    : { x: 0, y: 0 };
  return (
    <div
      key={c.id}
      data-testid="creature"
      className={classes.join(' ')}
      style={{
        left: `${(c.x + wobble.x) * 100}%`,
        top: `${(c.y + wobble.y) * 100}%`,
        fontSize: `${size}px`,
        filter: `hue-rotate(${species.hueDeg}deg)`,
      }}
      aria-label={species.name}
    >
      {species.emoji[c.stage]}
      {bubble && (
        <span
          className={styles.wantBubble}
          style={{ opacity: bubble.visible, transform: `scale(${0.6 + 0.4 * bubble.visible})` }}
          aria-hidden="true"
        >
          {bubble.emoji}
        </span>
      )}
    </div>
  );
})}
```

- [ ] **Step 4: Update CSS**

In `pages/aquarium/index.module.css`:

Remove the `transition: left 1s ease-in-out, top 1s ease-in-out;` line and the `animation: swim 6s ease-in-out infinite alternate;` line from `.creature` (position now updates every frame directly from the RAF loop; a CSS transition would lag behind and fight it). `.creature` becomes:

```css
.creature {
  position: absolute;
  transform: translate(-50%, -50%);
  border: none;
  background: none;
  padding: 0.5rem;
  line-height: 1;
}
```

Remove the `@keyframes swim { ... }` block entirely (no longer referenced).

Replace `.moodDot` with `.wantBubble`:

```css
.wantBubble {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 20px;
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
```

Add drop and dirt-spot styles after `.egg`:

```css
.foodDrop,
.toyDrop {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 28px;
  pointer-events: none;
}

.dirtSpot {
  position: absolute;
  transform: translate(-50%, -50%);
  border: none;
  background: none;
  font-size: 30px;
  cursor: pointer;
  filter: opacity(0.75);
}
```

- [ ] **Step 5: Run the full test file**

Run: `npx vitest run __tests__/pages/aquarium/index.test.jsx`
Expected: PASS (all tests, including the want-bubble test from Step 1).

- [ ] **Step 6: Commit**

```bash
git add pages/aquarium/index.jsx pages/aquarium/index.module.css __tests__/pages/aquarium/index.test.jsx
git commit -m "feat: drive fish movement from a requestAnimationFrame loop"
```

---

### Task 12: Full verification — suite, lint, build, and live browser check

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS (no failures anywhere in the repo, including files untouched by this plan).

- [ ] **Step 2: Run lint**

Run: `npx eslint .`
Expected: no errors. If any appear, fix them in the relevant file from this plan (do not disable rules; do not reference `react-hooks/*` rules — this repo has no such plugin installed) and re-run.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Live-browser verification with Playwright**

Start the dev server (`npm run dev` in the background, or `npm run build && npm run start`), then drive the aquarium page with Playwright (reusing this session's established pattern: `page.addInitScript()` to seed `localStorage` before `page.goto()` rather than reload-after-seed, and `{ force: true, timeout: 5000 }` on clicks against continuously animating elements). Verify, with screenshots at each step:

1. Fish are visibly larger than before (baby ~60px, not ~28px) and comfortably tappable.
2. Fish visibly move along curved, varying-speed paths — not a linear slide between two points and not a fixed in-place wobble.
3. Selecting Food and tapping the tank drops a 🍤 marker; a hungry fish visibly swims toward it, and on contact the marker disappears with a pulse/ripple and the want-bubble over that fish updates.
4. Selecting Toy behaves the same way with 🎾/💗.
5. A dirt spot (seed a tank with low `tankCleanliness` via `addInitScript` to guarantee at least one spot exists) is tappable directly, with no tool selected, and wiping it removes the spot and reduces the tank's murky tint.
6. A satisfied fish (all needs high) ignores nearby drops and continues idle wandering.

Expected: all six behaviors visibly confirmed in screenshots, not inferred from state alone.

- [ ] **Step 5: Report and push**

Summarize the verification results to the user. If everything passes, push the branch:

```bash
git push -u origin claude/pet-aquarium-game-mobgv1
```

No commit is made in this task (verification only) unless Step 2 or Step 3 required fixes, in which case those fixes were already committed within their own step per the standard commit pattern (`fix: <what was fixed>`).

---

## Self-Review Notes

- **Spec coverage:** Movement engine (Tasks 1-2), interaction model drop/claim/consume/dirt-spot (Tasks 4-8), data model (Task 3), status display (Tasks 10-11), sizing (Task 9), testing strategy (every task), out-of-scope items (drop expiry, multi-fish-per-drop, per-fish cleanliness, numeric/bar display) are all correctly absent from every task above — confirmed no task implements them.
- **Placeholder scan:** every step has literal, runnable code; no "TBD"/"similar to Task N" left in any step.
- **Type/signature consistency checked across tasks:** `stepMovement(moveState, dt, now, boundsWidth, target, rng)` — same order in Tasks 1, 2, and 11. `createMovementState(x, y, rng)` — same in Tasks 1 and 11. `consumeDrop(state, creatureId, dropId)` — same in Tasks 5, 6 (implicitly, via `assignSeekTargets` producing the `seekTargetId` it consumes), and 11. `findDrop(state, dropId)` return shape `{ type, drop } | null` — same in Tasks 5 and 11. `wobbleOffset(heading, wobblePhase, now)` — same in Tasks 2 and 11. `applyElapsed(state, elapsedMs, now, rng)` — same in Task 7 and unchanged call sites in `pages/aquarium/index.jsx` (Task 10/11, which still call it 3-arg, valid via the default parameter).
