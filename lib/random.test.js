import { describe, it, expect } from 'vitest';
import { clamp, weightedRandomChoice, generateId, shuffle, buildDeck, drawCards } from './random';

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

  it('never selects a weight-0 item across rng sweep', () => {
    const items = [
      { label: 'A', weight: 1 },
      { label: 'Zero', weight: 0 },
      { label: 'B', weight: 1 },
    ];
    for (let r = 0.01; r < 1; r += 0.01) {
      expect(weightedRandomChoice(items, () => r).label).not.toBe('Zero');
    }
  });

  it('skips zero-weight item sitting exactly at a boundary', () => {
    const items = [
      { label: 'A', weight: 1 },
      { label: 'Zero', weight: 0 },
      { label: 'B', weight: 1 },
    ];
    expect(weightedRandomChoice(items, () => 0.5).label).toBe('A');
  });

  it('skips zero-weight item placed last', () => {
    const items = [
      { label: 'A', weight: 1 },
      { label: 'B', weight: 1 },
      { label: 'Zero', weight: 0 },
    ];
    expect(weightedRandomChoice(items, () => 0.999).label).toBe('B');
  });

  it('handles rng=0 when zero-weight item is first (filtered out)', () => {
    const items = [
      { label: 'Zero', weight: 0 },
      { label: 'A', weight: 1 },
    ];
    expect(weightedRandomChoice(items, () => 0).label).toBe('A');
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

describe('shuffle', () => {
  it('returns a permutation with all original elements', () => {
    const result = shuffle([1, 2, 3, 4], () => 0.5);
    expect(result).toHaveLength(4);
    expect(result.slice().sort()).toEqual([1, 2, 3, 4]);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input, () => 0);
    expect(input).toEqual([1, 2, 3]);
  });

  it('is deterministic for a given rng (rng always 0)', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it('is deterministic for a given rng (rng near 1 leaves order unchanged)', () => {
    expect(shuffle([1, 2, 3, 4], () => 0.999999)).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(shuffle([], () => 0.5)).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle(['only'], () => 0.5)).toEqual(['only']);
  });
});

describe('buildDeck', () => {
  it('returns 52 unique cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it('includes all four suits', () => {
    const deck = buildDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['♠', '♥', '♦', '♣']));
  });

  it('includes all thirteen ranks', () => {
    const deck = buildDeck();
    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks).toEqual(
      new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']),
    );
  });
});

describe('drawCards', () => {
  const deck = [
    { rank: 'A', suit: '♠' },
    { rank: '2', suit: '♠' },
    { rank: '3', suit: '♠' },
  ];

  it('draws n cards from the front and returns the remainder', () => {
    const { drawn, remaining } = drawCards(deck, 2);
    expect(drawn).toEqual([{ rank: 'A', suit: '♠' }, { rank: '2', suit: '♠' }]);
    expect(remaining).toEqual([{ rank: '3', suit: '♠' }]);
  });

  it('does not mutate the input deck', () => {
    drawCards(deck, 1);
    expect(deck).toHaveLength(3);
  });

  it('draws zero cards without error', () => {
    const { drawn, remaining } = drawCards(deck, 0);
    expect(drawn).toEqual([]);
    expect(remaining).toEqual(deck);
  });
});
