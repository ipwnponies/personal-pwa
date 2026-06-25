import { describe, test, expect } from 'vitest';
import {
  REPETITION_MIN,
  REPETITION_MAX,
  REPETITION_RANGE,
  epleyRatio,
  calculateOneRmEpley,
  calculateWeightFromOneRm,
  formatWeight,
  buildPercentageTable,
  buildRepMaxTable,
} from './epley';

describe('epleyRatio', () => {
  test('returns 1 for 1 rep (1RM)', () => {
    expect(epleyRatio(1)).toBe(1);
  });

  test('returns correct ratio for multiple reps', () => {
    expect(epleyRatio(10)).toBeCloseTo(1.3, 5);
  });

  test('throws for 0 reps', () => {
    expect(() => epleyRatio(0)).toThrow();
  });

  test('throws for negative reps', () => {
    expect(() => epleyRatio(-1)).toThrow();
  });
});

describe('calculateOneRmEpley', () => {
  test('1 rep returns same weight as 1RM', () => {
    expect(calculateOneRmEpley(100, 1)).toBe(100);
  });

  test('more reps yields higher estimated 1RM', () => {
    expect(calculateOneRmEpley(100, 5)).toBeGreaterThan(100);
  });

  test('known calculation: 100 lbs x 10 reps', () => {
    expect(calculateOneRmEpley(100, 10)).toBeCloseTo(130, 0);
  });
});

describe('calculateWeightFromOneRm', () => {
  test('1 rep returns full 1RM', () => {
    expect(calculateWeightFromOneRm(100, 1)).toBe(100);
  });

  test('more reps yields lower weight', () => {
    expect(calculateWeightFromOneRm(100, 10)).toBeLessThan(100);
  });

  test('round-trips with calculateOneRmEpley', () => {
    const weight = 200;
    const reps = 8;
    const oneRm = calculateOneRmEpley(weight, reps);
    const recovered = calculateWeightFromOneRm(oneRm, reps);
    expect(recovered).toBeCloseTo(weight, 10);
  });
});

describe('formatWeight', () => {
  test('formats finite number to integer string', () => {
    expect(formatWeight(123.456)).toBe('123');
  });

  test('rounds to nearest integer', () => {
    expect(formatWeight(99.5)).toBe('100');
  });

  test('returns dash for non-finite values', () => {
    expect(formatWeight(Infinity)).toBe('-');
    expect(formatWeight(NaN)).toBe('-');
  });
});

describe('buildPercentageTable', () => {
  test('returns entries from 100% down to 50%', () => {
    const table = buildPercentageTable(100);
    expect(table[0].percentage).toBe(100);
    expect(table[table.length - 1].percentage).toBe(50);
  });

  test('entries are in 5% decrements', () => {
    const table = buildPercentageTable(100);
    expect(table).toHaveLength(11);
    expect(table.map(e => e.percentage)).toEqual([100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50]);
  });

  test('weights are correct percentages of 1RM', () => {
    const table = buildPercentageTable(200);
    expect(table[0].weight).toBe(200);
    expect(table.find(e => e.percentage === 50).weight).toBe(100);
  });
});

describe('buildRepMaxTable', () => {
  test('returns entries for all reps from min to max', () => {
    const table = buildRepMaxTable(100);
    expect(table).toHaveLength(REPETITION_RANGE);
    expect(table[0].repCount).toBe(REPETITION_MIN);
    expect(table[table.length - 1].repCount).toBe(REPETITION_MAX);
  });

  test('1 rep max equals the estimated 1RM', () => {
    const table = buildRepMaxTable(100);
    expect(table[0].weight).toBeCloseTo(100, 5);
  });

  test('higher rep counts have lower weights', () => {
    const table = buildRepMaxTable(100);
    expect(table[0].weight).toBeGreaterThan(table[table.length - 1].weight);
  });
});
