import { describe, test, expect } from 'vitest';
import { WARMUP_SCHEME, buildWarmupRamp } from './warmup';

describe('WARMUP_SCHEME', () => {
  test('is exported and has exactly 4 steps', () => {
    expect(WARMUP_SCHEME).toHaveLength(4);
  });

  test('has correct percentage values', () => {
    expect(WARMUP_SCHEME[0].percentage).toBe(40);
    expect(WARMUP_SCHEME[1].percentage).toBe(55);
    expect(WARMUP_SCHEME[2].percentage).toBe(70);
    expect(WARMUP_SCHEME[3].percentage).toBe(85);
  });

  test('has correct rep values', () => {
    expect(WARMUP_SCHEME[0].reps).toBe(5);
    expect(WARMUP_SCHEME[1].reps).toBe(5);
    expect(WARMUP_SCHEME[2].reps).toBe(3);
    expect(WARMUP_SCHEME[3].reps).toBe(2);
  });
});

describe('buildWarmupRamp', () => {
  test('returns exactly 4 steps', () => {
    const ramp = buildWarmupRamp(155);
    expect(ramp).toHaveLength(4);
  });

  test('preserves WARMUP_SCHEME order with correct percentage and reps', () => {
    const ramp = buildWarmupRamp(155);
    expect(ramp[0].percentage).toBe(40);
    expect(ramp[0].reps).toBe(5);
    expect(ramp[1].percentage).toBe(55);
    expect(ramp[1].reps).toBe(5);
    expect(ramp[2].percentage).toBe(70);
    expect(ramp[2].reps).toBe(3);
    expect(ramp[3].percentage).toBe(85);
    expect(ramp[3].reps).toBe(2);
  });

  test('calculates weight as workingWeight * percentage / 100', () => {
    const ramp = buildWarmupRamp(155);
    expect(ramp[0].weight).toBe(155 * 40 / 100); // 62
    expect(ramp[1].weight).toBe(155 * 55 / 100); // 85.25
    expect(ramp[2].weight).toBe(155 * 70 / 100); // 108.5
    expect(ramp[3].weight).toBe(155 * 85 / 100); // 131.75
  });

  test('handles decimal results without rounding', () => {
    const ramp = buildWarmupRamp(100);
    expect(ramp[0].weight).toBe(40); // 100 * 40 / 100
    expect(ramp[1].weight).toBe(55); // 100 * 55 / 100
    expect(ramp[2].weight).toBe(70); // 100 * 70 / 100
    expect(ramp[3].weight).toBe(85); // 100 * 85 / 100
  });

  test('works with fractional working weights', () => {
    const ramp = buildWarmupRamp(200.5);
    expect(ramp[0].weight).toBe(200.5 * 40 / 100);
    expect(ramp[1].weight).toBe(200.5 * 55 / 100);
    expect(ramp[2].weight).toBe(200.5 * 70 / 100);
    expect(ramp[3].weight).toBe(200.5 * 85 / 100);
  });

  test('example: 155 working weight produces correct ramp', () => {
    const ramp = buildWarmupRamp(155);
    expect(ramp).toEqual([
      { percentage: 40, reps: 5, weight: 62 },
      { percentage: 55, reps: 5, weight: 85.25 },
      { percentage: 70, reps: 3, weight: 108.5 },
      { percentage: 85, reps: 2, weight: 131.75 },
    ]);
  });
});
