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
