import { describe, it, expect } from 'vitest';
import { clamp, weightedRandomChoice, generateId } from './random';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('returns min when value is below', () => {
    expect(clamp(-3, 1, 10)).toBe(1);
  });

  it('returns max when value is above', () => {
    expect(clamp(15, 1, 10)).toBe(10);
  });

  it('returns boundary values unchanged', () => {
    expect(clamp(1, 1, 10)).toBe(1);
    expect(clamp(10, 1, 10)).toBe(10);
  });
});

describe('weightedRandomChoice', () => {
  const items = [
    { label: 'A', weight: 1 },
    { label: 'B', weight: 2 },
    { label: 'C', weight: 1 },
  ];

  it('returns undefined for empty array', () => {
    expect(weightedRandomChoice([], () => 0)).toBeUndefined();
  });

  it('returns single item when only one choice', () => {
    const single = [{ label: 'only', weight: 5 }];
    const result = weightedRandomChoice(single, () => 0.5);
    expect(result.label).toBe('only');
  });

  it('selects first item when rng is 0', () => {
    const result = weightedRandomChoice(items, () => 0);
    expect(result.label).toBe('A');
  });

  it('selects last item when rng is near 1', () => {
    const result = weightedRandomChoice(items, () => 0.999);
    expect(result.label).toBe('C');
  });

  it('selects middle item for mid-range rng', () => {
    // Total weight = 4. A occupies [0,1), B occupies [1,3), C occupies [3,4)
    // rng=0.5 → r=2.0, which falls in B's range
    const result = weightedRandomChoice(items, () => 0.5);
    expect(result.label).toBe('B');
  });

  it('respects weight proportions', () => {
    // rng=0.24 → r=0.96, still in A's range [0,1)
    expect(weightedRandomChoice(items, () => 0.24).label).toBe('A');
    // rng=0.26 → r=1.04, enters B's range [1,3)
    expect(weightedRandomChoice(items, () => 0.26).label).toBe('B');
    // rng=0.74 → r=2.96, still in B's range
    expect(weightedRandomChoice(items, () => 0.74).label).toBe('B');
    // rng=0.76 → r=3.04, enters C's range [3,4)
    expect(weightedRandomChoice(items, () => 0.76).label).toBe('C');
  });

  it('handles exact boundary between items', () => {
    // rng=0.25 → r=1.0, exactly at A/B boundary. r-=1 → 0, findIndex returns A (r<=0)
    const result = weightedRandomChoice(items, () => 0.25);
    expect(result.label).toBe('A');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
