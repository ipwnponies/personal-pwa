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
import { createDefaultTank, TANK_CAP } from './simulation';

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
    const { id } = tank.creatures[0];
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
    const { id } = tank.creatures[0];
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

  it('refuses to return a fish into a tank already at TANK_CAP', () => {
    // Bucketing frees a slot, so egg fill/hatching can refill the tank while
    // a fish waits in the bucket — returning it then must not push creatures
    // to TANK_CAP + 1.
    const tank = createDefaultTank(0, () => 0.5);
    const full = {
      ...tank,
      creatures: Array.from({ length: TANK_CAP }, (_, i) => ({ ...tank.creatures[0], id: `c${i}` })),
      bucket: [{ ...tank.creatures[0], id: 'b1' }],
    };
    const next = returnFish(full, 'b1');
    expect(next.creatures).toHaveLength(TANK_CAP);
    expect(next.creatures.some((c) => c.id === 'b1')).toBe(false);
    expect(next.bucket).toHaveLength(1);
    expect(next.bucket[0].id).toBe('b1');
  });
});

describe('deleteFromBucket', () => {
  it('removes the creature from the bucket permanently', () => {
    let tank = createDefaultTank(0, () => 0.5);
    const { id } = tank.creatures[0];
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
