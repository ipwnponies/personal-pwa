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
