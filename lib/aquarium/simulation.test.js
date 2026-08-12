import { describe, it, expect } from 'vitest';
import {
  NEED_FLOOR,
  NEED_MAX,
  TANK_CAP,
  MET_THRESHOLD,
  STAGE_DURATIONS_MS,
  FEED_AMOUNT,
  EGG_FILL_PER_ACTION,
  createDefaultTank,
  applyElapsed,
  feedCreature,
  playCreature,
  feedTank,
  cleanTank,
  hatchEgg,
  WANDER_MIN,
  WANDER_MAX,
  wanderCreatures,
  MAX_DROPS_PER_TYPE,
  dropFood,
  dropToy,
  findDrop,
  consumeDrop,
  assignSeekTargets,
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

describe('directed care', () => {
  it('feedCreature raises only the targeted creature and clamps at max', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures[0].hunger = 50;
    const { id } = tank.creatures[0];
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
    tank.creatures = tank.creatures.map((c, i) => ({
      ...c,
      x: 0.9,
      y: 0.9,
      hunger: 20,
      id: `c${i}`,
    }));
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

describe('wanderCreatures', () => {
  it('moves each creature to a new position', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const before = tank.creatures.map((c) => ({ x: c.x, y: c.y }));
    const next = wanderCreatures(tank, () => 0.9);
    next.creatures.forEach((c, i) => {
      expect(c.x).not.toBe(before[i].x);
      expect(c.y).not.toBe(before[i].y);
    });
  });

  it('keeps creatures within the wander bounds', () => {
    const tank = createDefaultTank(0, () => 0.5);
    tank.creatures = tank.creatures.map((c) => ({ ...c, x: WANDER_MIN, y: WANDER_MAX }));
    const next = wanderCreatures(tank, () => 0);
    next.creatures.forEach((c) => {
      expect(c.x).toBeGreaterThanOrEqual(WANDER_MIN);
      expect(c.y).toBeLessThanOrEqual(WANDER_MAX);
    });
  });

  it('does not mutate the input state', () => {
    const tank = createDefaultTank(0, () => 0.5);
    const before = tank.creatures[0].x;
    wanderCreatures(tank, () => 0.9);
    expect(tank.creatures[0].x).toBe(before);
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
});
