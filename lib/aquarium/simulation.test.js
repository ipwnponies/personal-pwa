import { describe, it, expect } from 'vitest';
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
  it('advances a creature kept fed/played-with across the stage duration', () => {
    // Decay is fast enough now that growth requires active care: simulate
    // periodic feeding (topping needs back to full) more often than they can
    // decay past MET_THRESHOLD, sustained across the whole stage duration.
    let tank = createDefaultTank(0, () => 0.5);
    const dur = STAGE_DURATIONS_MS.baby;
    const stepMs = MIN;
    let elapsed = 0;
    while (elapsed < dur + MIN) {
      elapsed += stepMs;
      tank = applyElapsed(tank, stepMs, elapsed);
      tank = {
        ...tank,
        creatures: tank.creatures.map((c) => ({ ...c, hunger: NEED_MAX, happiness: NEED_MAX })),
      };
    }
    expect(tank.creatures[0].stage).toBe('child');
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
    const next = applyElapsed(
      tank,
      STAGE_DURATIONS_MS.child + MIN,
      STAGE_DURATIONS_MS.child + MIN,
    );
    expect(next.creatures[0].stage).toBe('adult');
  });
});

describe('constants', () => {
  it('exposes the tank cap and met threshold', () => {
    expect(TANK_CAP).toBe(8);
    expect(MET_THRESHOLD).toBe(60);
  });
});

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
    tank.creatures = tank.creatures.map((c) => ({
      ...c,
      hunger: NEED_MAX,
      happiness: NEED_MAX,
      x: 0.5,
      y: 0.5,
    }));
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
    // Case 1: hunger more urgent (20 < 40)
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 20;
    tank.creatures[0].happiness = 40;
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank = dropToy(tank, 0.5, 0.5, 1000);
    tank = dropFood(tank, 0.5, 0.5, 1000);
    let next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBe(tank.foodDrops[0].id);

    // Case 2: happiness more urgent (20 < 40)
    tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 40;
    tank.creatures[0].happiness = 20;
    tank.creatures[0].x = 0.5;
    tank.creatures[0].y = 0.5;
    tank = dropToy(tank, 0.5, 0.5, 1000);
    tank = dropFood(tank, 0.5, 0.5, 1000);
    next = assignSeekTargets(tank);
    expect(next.creatures[0].seekTargetId).toBe(tank.toyDrops[0].id);
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
    const tank = createDefaultTank(0, () => 0.5);
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

  it('a freshly-full creature becomes seek-eligible within a few minutes of real play', () => {
    // Regression: at the old 0.05/min decay rate a full creature took 13+
    // hours to cross MET_THRESHOLD, so a dropped food/toy never got claimed
    // within any normal session.
    let tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c, i) => ({ ...c, x: 0.5, y: 0.5, id: `c${i}` }));
    tank = applyElapsed(tank, 5 * MIN, 5 * MIN);
    tank = dropFood(tank, 0.5, 0.5, 5 * MIN);
    const next = assignSeekTargets(tank);
    expect(next.creatures.some((c) => c.seekTargetId === tank.foodDrops[0].id)).toBe(true);
  });
});

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
    const { id } = tank.decorations[0];
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
    const { id } = tank.decorations[0];
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
    const tank = createDefaultTank(0, () => 0.5);
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
