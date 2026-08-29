# Aquarium Seek Affinity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make food/toy seeking reflect how badly a creature needs it — hungrier/unhappier creatures swim faster and are more likely to win a contested drop — via a derived `affinity` value, as groundwork for a later fishing feature that reuses the same mechanism.

**Architecture:** A new pure `computeAffinity(need)` function in `lib/aquarium/simulation.js` derives a 0–1 "how much do I want this" value from how far a need has fallen below `MET_THRESHOLD`. It feeds two independent, already-existing code paths: `stepMovement` (in `lib/aquarium/movement.js`) uses it to scale seek approach speed, and `assignSeekTargets` (in `lib/aquarium/simulation.js`) uses it, blended with proximity and a random term, to rank which creature wins a contested drop. No new persisted state.

**Tech Stack:** Vanilla JS, React 18, Vitest + React Testing Library (existing stack, no new dependencies).

**Spec:** `docs/superpowers/specs/2026-08-27-aquarium-seek-affinity-design.md`

## Global Constraints

- No new dependencies.
- No new persisted state on `tank` — affinity is always derived on demand from existing `hunger`/`happiness` fields (spec Non-Goals).
- No change to `MET_THRESHOLD` seek-eligibility gating — only speed and claim priority once already eligible (spec Non-Goals).
- No change to wander (non-seeking) movement, decay rates, or thresholds (spec Non-Goals).
- `AFFINITY_SPEED_FLOOR = 0.75`, `AFFINITY_WEIGHT = 0.4`, `PROXIMITY_WEIGHT = 0.4`, `RANDOM_WEIGHT = 0.2` (spec's proposed starting constants — exact values, not placeholders). `AFFINITY_SPEED_FLOOR` must satisfy `SEEK_SPEED_MULTIPLIER × AFFINITY_SPEED_FLOOR > 1` for the "still seeks briskly, not a crawl" behavior to hold — `0.6` doesn't work with `SEEK_SPEED_MULTIPLIER = 1.4` (0.84 < 1), so it was adjusted to `0.75` during implementation.
- Every new/changed export is a pure function — no new try/catch, matching existing module style (spec Error Handling).

---

## Task 1: `computeAffinity` in `lib/aquarium/simulation.js`

**Files:**
- Modify: `lib/aquarium/simulation.js` (add near `MET_THRESHOLD`, currently line 13)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Produces: `computeAffinity(need: number) => number` — exported. `need` is a raw `hunger` or `happiness` value (0–100 range, per existing `NEED_FLOOR`/`NEED_MAX` clamping elsewhere in this file). Returns a value in `[0, 1]`. Later tasks (2 and 3) both call this directly (same module) or import it (movement.js does not import it — see Task 2).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `lib/aquarium/simulation.test.js`. First add `computeAffinity` to the existing import list from `./simulation` (alongside `assignSeekTargets` etc.), then add:

> **Note (post-implementation correction):** the tests below reflect the
> original task text's un-normalized formula (`/ MET_THRESHOLD`). The final
> whole-branch review found this let real affinity cap at 0.75 instead of 1,
> since `hunger`/`happiness` never reach 0 in play — the shipped formula
> normalizes over `[NEED_FLOOR, MET_THRESHOLD]` instead (see this task's
> Step 3 below), and
> the actual shipped tests check `computeAffinity(NEED_FLOOR) === 1` and a
> midpoint of the reachable range, not `computeAffinity(0)` and
> `MET_THRESHOLD / 2`. Left as originally written for the historical record
> of what this task set out to do.

```js
describe('computeAffinity', () => {
  it('is 0 exactly at the seek-eligibility threshold', () => {
    expect(computeAffinity(MET_THRESHOLD)).toBe(0);
  });

  it('is 1 when the need is fully depleted', () => {
    expect(computeAffinity(0)).toBe(1);
  });

  it('scales linearly between the threshold and zero', () => {
    expect(computeAffinity(MET_THRESHOLD / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps to 0 for a need above the threshold', () => {
    expect(computeAffinity(NEED_MAX)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t computeAffinity`
Expected: FAIL — `computeAffinity is not a function` (or import error, since it doesn't exist yet).

- [ ] **Step 3: Implement `computeAffinity`**

In `lib/aquarium/simulation.js`, add directly below the `export const MET_THRESHOLD = 60;` line:

```js
// How strongly a creature wants a need met, derived from how far below
// MET_THRESHOLD the need has fallen. 0 at the threshold (barely wants it),
// 1 once need bottoms out at NEED_FLOOR (the deepest a need can actually
// reach), not literally 0. Feeds both seek approach speed (movement.js) and
// contested-claim scoring (assignSeekTargets below).
export const computeAffinity = (need) =>
  clamp((MET_THRESHOLD - need) / (MET_THRESHOLD - NEED_FLOOR), 0, 1);
```

`clamp` is already imported at the top of the file from `../random`. The
denominator normalizes over the reachable range `[NEED_FLOOR, MET_THRESHOLD]`
rather than `[0, MET_THRESHOLD]` — `hunger`/`happiness` never actually reach 0
in play (`decayNeed`/`raise` clamp to `NEED_FLOOR`), so dividing by
`MET_THRESHOLD` alone would cap real affinity at 0.75 instead of reaching 1
(this correction was made during the final whole-branch review; the original
task text below described the un-normalized formula).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js -t computeAffinity`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat(aquarium): add computeAffinity for need-proportional seek pull"
```

---

## Task 2: Affinity-scaled seek speed in `lib/aquarium/movement.js`

**Files:**
- Modify: `lib/aquarium/movement.js`
- Test: `lib/aquarium/movement.test.js`

**Interfaces:**
- Consumes: nothing new (affinity is passed in by the caller as a plain number — `movement.js` stays domain-agnostic and does not import `computeAffinity` from `simulation.js`, avoiding a `simulation.js` ⇄ `movement.js` circular import; `simulation.js` already imports `DETECTION_RADIUS`/`BOUNDS_MIN`/`BOUNDS_MAX` from `movement.js`, so the dependency only goes one way).
- Produces: `stepMovement(moveState, dt, now, boundsWidth, target, rng = Math.random, affinity = 1)` — **`affinity` is appended AFTER `rng`, not inserted before it.** This is deliberate: every existing call site (tests and the page) passes `rng` positionally as the 6th argument today. Appending `affinity` after it means every one of those existing calls keeps working unchanged, defaulting to `affinity = 1`, which (per the formula below) reproduces today's exact speed — no existing test needs to change. Inserting it earlier would silently shift `rng` into the `affinity` slot for every existing caller and break wander-target determinism in the existing wander tests.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('stepMovement seek', ...)` block in `lib/aquarium/movement.test.js` (after the existing `'seeks faster than cruise speed'` test):

```js
  it('seeks slower at low affinity than at high affinity, same distance', () => {
    // A single step can't show this: the acceleration cap
    // (ACCEL_PX_PER_SEC2 * dt) clips both to the same speed regardless of
    // affinity until enough steps pass to reach each one's own desired-speed
    // ceiling — same reason the existing 'seeks faster than cruise speed'
    // test loops 50 times instead of taking one step.
    const target = { x: 0.9, y: 0.5 };
    let lowAffinity = createMovementState(0.5, 0.5, () => 0.5);
    let highAffinity = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      const now = 1000 + i * 50;
      lowAffinity = stepMovement(lowAffinity, 0.05, now, 500, target, () => 0.5, 0);
      highAffinity = stepMovement(highAffinity, 0.05, now, 500, target, () => 0.5, 1);
    }
    expect(lowAffinity.speed).toBeLessThan(highAffinity.speed);
  });

  it('still seeks at the affinity floor speed, not a crawl, when affinity is 0', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, { x: 0.9, y: 0.9 }, () => 0.5, 0);
    }
    // Same "seeks faster than cruise speed" assertion the existing affinity=1
    // test makes — the floor keeps a barely-eligible creature swimming
    // briskly, not crawling at cruise speed or slower.
    expect(ms.speed).toBeGreaterThan(ms.cruiseSpeed);
  });

  it('defaults affinity to 1, matching pre-affinity full seek speed', () => {
    let withDefault = createMovementState(0.5, 0.5, () => 0.5);
    let explicit = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      const now = 1000 + i * 50;
      withDefault = stepMovement(withDefault, 0.05, now, 500, { x: 0.9, y: 0.9 }, () => 0.5);
      explicit = stepMovement(explicit, 0.05, now, 500, { x: 0.9, y: 0.9 }, () => 0.5, 1);
    }
    expect(withDefault.speed).toBeCloseTo(explicit.speed, 10);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/movement.test.js -t "affinity"`
Expected: FAIL on the first two new tests — `lowAffinity.speed` is not less than `highAffinity.speed` because affinity isn't wired in yet (both currently compute the same speed). The third test passes trivially already (nothing to break yet) but is included now so it fails alongside the others once Step 3 changes behavior for explicit-affinity calls if the formula is wrong; verify all three explicitly.

- [ ] **Step 3: Implement affinity-scaled seek speed**

In `lib/aquarium/movement.js`:

1. Add the new exported constant near the other seek-related constants (after `SEEK_SPEED_MULTIPLIER`):

```js
// Floor on how much affinity can shrink seek speed — a barely-eligible
// creature (affinity near 0) still swims briskly toward its target, not a
// crawl. Only a maximally-desperate creature (affinity 1) reaches full
// seek speed.
export const AFFINITY_SPEED_FLOOR = 0.75;
```
(`0.6` was the original proposal, but `SEEK_SPEED_MULTIPLIER(1.4) × 0.6 = 0.84 < 1`, which fails the "still seeks briskly, not a crawl" behavior above — the constant must satisfy `SEEK_SPEED_MULTIPLIER × AFFINITY_SPEED_FLOOR > 1`, so it was adjusted to `0.75`.)

2. Change the `stepMovement` signature (currently `export const stepMovement = (moveState, dt, now, boundsWidth, target, rng = Math.random) => {`) to:

```js
export const stepMovement = (moveState, dt, now, boundsWidth, target, rng = Math.random, affinity = 1) => {
```

3. In the `else` branch that currently reads:

```js
  } else {
    const distToTarget = Math.hypot(target.x - moveState.x, target.y - moveState.y);
    desiredSpeed = arriveSpeed(
      moveState.cruiseSpeed * SEEK_SPEED_MULTIPLIER,
      moveState.cruiseSpeed,
      distToTarget,
      boundsWidth,
    );
  }
```

replace it with:

```js
  } else {
    const distToTarget = Math.hypot(target.x - moveState.x, target.y - moveState.y);
    const seekSpeed = moveState.cruiseSpeed * SEEK_SPEED_MULTIPLIER
      * (AFFINITY_SPEED_FLOOR + affinity * (1 - AFFINITY_SPEED_FLOOR));
    desiredSpeed = arriveSpeed(seekSpeed, moveState.cruiseSpeed, distToTarget, boundsWidth);
  }
```

The existing `arriveSpeed` near-arrival easing curve is untouched — it now eases toward this affinity-scaled `seekSpeed` instead of the old flat one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/movement.test.js`
Expected: PASS — all new tests, and every pre-existing test in this file (none of their calls needed to change, per the Interfaces note above).

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/movement.js lib/aquarium/movement.test.js
git commit -m "feat(aquarium): scale seek approach speed by affinity"
```

---

## Task 3: Blended affinity+proximity+random contested-claim scoring in `assignSeekTargets`

**Files:**
- Modify: `lib/aquarium/simulation.js:228-290` (the `assignSeekTargets` function)
- Test: `lib/aquarium/simulation.test.js`

**Interfaces:**
- Consumes: `computeAffinity` from Task 1 (same module, no import needed).
- Produces: `assignSeekTargets(state, rng = Math.random)` — gains a second parameter, defaulting to `Math.random` so the page's existing no-arg call (`assignSeekTargets(prev)`) keeps working unchanged. Return shape (`{ ...state, creatures: [...] }`) is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('assignSeekTargets', ...)` block in `lib/aquarium/simulation.test.js` (after the existing `'a freshly-full creature becomes seek-eligible...'` test, before the closing `});`):

```js
  it('lets a much closer creature win despite lower affinity (proximity term)', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({ ...c, id: `c${i}` }));
    // c0: close (dist 0.01) but barely hungry (low affinity).
    tank.creatures[0].x = 0.51;
    tank.creatures[0].y = 0.5;
    tank.creatures[0].hunger = 55;
    // c1: farther (dist 0.3, still within DETECTION_RADIUS) but starving.
    tank.creatures[1].x = 0.8;
    tank.creatures[1].y = 0.5;
    tank.creatures[1].hunger = 10;
    tank = dropFood(tank, 0.5, 0.5, 1000);
    // Constant rng means the random term is identical for both candidates,
    // so it can't be what decides this case.
    const next = assignSeekTargets(tank, () => 0.5);
    expect(next.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);
    expect(next.creatures[1].seekTargetId).toBeNull();
  });

  it('lets a hungrier-but-farther creature win over a closer-but-less-hungry one (affinity term)', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({ ...c, id: `c${i}` }));
    // c0: farther (dist 0.2) but starving (high affinity).
    tank.creatures[0].x = 0.7;
    tank.creatures[0].y = 0.5;
    tank.creatures[0].hunger = 5;
    // c1: very close (dist 0.05) but barely hungry.
    tank.creatures[1].x = 0.55;
    tank.creatures[1].y = 0.5;
    tank.creatures[1].hunger = 58;
    tank = dropFood(tank, 0.5, 0.5, 1000);
    const next = assignSeekTargets(tank, () => 0.5);
    expect(next.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);
    expect(next.creatures[1].seekTargetId).toBeNull();
  });

  it('lets the random term flip a contested claim between equal-affinity, equal-distance creatures', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({
      ...c, id: `c${i}`, x: 0.5, y: 0.5, hunger: 20,
    }));
    tank = dropFood(tank, 0.5, 0.5, 1000);

    // rng is called once per (creature, drop) candidate pair, in creature
    // order — so the first call scores c0, the second scores c1.
    let calls = 0;
    const favorSecond = () => (calls++ === 0 ? 0.1 : 0.9);
    const first = assignSeekTargets(tank, favorSecond);
    expect(first.creatures[1].seekTargetId).toBe(tank.foodDrops[0].id);
    expect(first.creatures[0].seekTargetId).toBeNull();

    calls = 0;
    const favorFirst = () => (calls++ === 0 ? 0.9 : 0.1);
    const second = assignSeekTargets(tank, favorFirst);
    expect(second.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);
    expect(second.creatures[1].seekTargetId).toBeNull();
  });

  it('defaults rng to Math.random without throwing when called with one argument', () => {
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank = dropFood(tank, 0.5, 0.5, 1000);
    expect(() => assignSeekTargets(tank)).not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/aquarium/simulation.test.js -t "assignSeekTargets"`
Expected: The 4 new tests FAIL (ranking is still pure nearest-first, so the "closer" test may coincidentally pass but the affinity and random-flip tests will not — both currently ignore hunger/rng entirely for ranking). The pre-existing `assignSeekTargets` tests still PASS unchanged.

- [ ] **Step 3: Implement blended scoring**

In `lib/aquarium/simulation.js`, add the weight constants near `MET_THRESHOLD`/`computeAffinity`:

```js
// Contested-drop claim priority is a blend of these three, not a strict
// tiebreak chain — see assignSeekTargets. Starting weights; may need a
// short calibration pass once playable.
export const AFFINITY_WEIGHT = 0.4;
export const PROXIMITY_WEIGHT = 0.4;
export const RANDOM_WEIGHT = 0.2;
```

Then change `assignSeekTargets` (currently `export const assignSeekTargets = (state) => {`) to accept `rng`, and change the candidate scoring and sort. The full updated function:

```js
export const assignSeekTargets = (state, rng = Math.random) => {
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
    // Candidates span BOTH wanted types: preferring the more urgent need must
    // not blind a creature to the only drop in range being the other type
    // (fresh tanks keep hunger and happiness exactly equal, so the tiebreak
    // would otherwise pin every creature to food forever).
    unclaimedDrops
      .filter((d) => (d.type === 'food' ? wantsFood : wantsToy))
      .forEach((d) => {
        const dist = distance(c, d.x, d.y);
        if (dist > DETECTION_RADIUS) return;
        const need = d.type === 'food' ? c.hunger : c.happiness;
        const affinity = computeAffinity(need);
        const proximity = clamp(1 - dist / DETECTION_RADIUS, 0, 1);
        const score = AFFINITY_WEIGHT * affinity + PROXIMITY_WEIGHT * proximity + RANDOM_WEIGHT * rng();
        pairs.push({
          creatureId: c.id,
          dropId: d.id,
          score,
          matchesPreferred: d.type === preferType,
        });
      });
  });
  // Preferred-type matches rank ahead of the fallback type; within a tier,
  // highest blended score wins.
  const rank = (p) => (p.matchesPreferred ? 0 : 1);
  pairs.sort((a, b) => rank(a) - rank(b) || b.score - a.score);

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

(Only the body changed: `dist` field on each pair became `score`, the sort comparator's second key changed from `a.dist - b.dist` to `b.score - a.score`, and the function now threads `rng` through.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/aquarium/simulation.test.js`
Expected: PASS — all new tests, and every pre-existing test in this file.

- [ ] **Step 5: Commit**

```bash
git add lib/aquarium/simulation.js lib/aquarium/simulation.test.js
git commit -m "feat(aquarium): blend affinity, proximity, and randomness in claim scoring"
```

---

## Task 4: Wire affinity into the aquarium page's movement loop

**Files:**
- Modify: `pages/aquarium/index.jsx` (the `setTank` callback inside the movement-loop effect, currently around lines 191–218)

**Interfaces:**
- Consumes: `computeAffinity` from `lib/aquarium/simulation.js` (Task 1); `stepMovement`'s new trailing `affinity` parameter (Task 2); `assignSeekTargets`'s unchanged default `rng` (Task 3 — the page doesn't need to pass one, it already relies on the default exactly like it does today).
- Produces: no new exports — this is the integration point, not a library change.

- [ ] **Step 1: Add `computeAffinity` to the existing import from `simulation.js`**

Find the import block:

```js
import {
  ...
  assignSeekTargets,
  findDrop,
  consumeDrop,
  MET_THRESHOLD,
  ...
} from '../../lib/aquarium/simulation';
```

Add `computeAffinity` to that list (anywhere among the named imports).

- [ ] **Step 2: Compute and pass affinity in the movement loop**

Find the block (per current line numbers, ~194–207):

```js
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
```

Replace it with:

```js
        const positioned = claimed.creatures.map((c) => {
          if (!moveStatesRef.current.has(c.id)) {
            moveStatesRef.current.set(c.id, createMovementState(c.x, c.y));
          }
          const found = c.seekTargetId ? findDrop(claimed, c.seekTargetId) : null;
          const targetPoint = found ? { x: found.drop.x, y: found.drop.y } : null;
          // A creature not currently seeking never reaches stepMovement's
          // seek branch, so this value is unused wander-side — 1 just keeps
          // the call self-explanatory without a misleading "0".
          const affinity = found
            ? computeAffinity(found.type === 'food' ? c.hunger : c.happiness)
            : 1;
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
```

Nothing else in this block changes — `stepped`, the contact-radius check below it, and everything after are untouched.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — no test directly exercises this rAF-driven movement loop (per the existing repo convention noted in `.claude/rules/aquarium.md` that `jsdom` doesn't implement the pointer/drag primitives this page relies on), so this step is a regression check: every existing suite (including `__tests__/pages/aquarium/index.test.jsx`) still passes with the import and call-site change in place.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open `http://localhost:8080/aquarium`, drop food near a hungry creature (low hunger) and near a barely-hungry one (hunger just under 60) at the same distance. Expected: the hungrier creature visibly swims faster/more directly to its food than the barely-hungry one. This is the one behavior change no automated test in this plan directly observes end-to-end (the unit tests cover the math in isolation), so eyeball it before committing.

- [ ] **Step 5: Commit**

```bash
git add pages/aquarium/index.jsx
git commit -m "feat(aquarium): wire need-based affinity into the movement loop"
```

---

## Post-Implementation

Run `npm run lint` and `npm test` once more across the whole branch to confirm a clean state, then this groundwork is ready for the follow-up fishing-feature spec/plan mentioned in the design doc's Summary.
