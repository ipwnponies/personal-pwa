import { describe, it, expect } from 'vitest';
import { generateRounds, MIN_ROUND_SPACING_MS } from './minigame';

describe('generateRounds', () => {
  it('returns exactly `count` rounds', () => {
    expect(generateRounds(5, () => 0)).toHaveLength(5);
  });

  it('produces strictly increasing targetAt values, each at least MIN_ROUND_SPACING_MS apart', () => {
    const rounds = generateRounds(5, () => 0.5);
    for (let i = 1; i < rounds.length; i += 1) {
      expect(rounds[i].targetAt - rounds[i - 1].targetAt).toBeGreaterThanOrEqual(MIN_ROUND_SPACING_MS);
    }
  });

  it('places the first round at least MIN_ROUND_SPACING_MS after 0', () => {
    const rounds = generateRounds(5, () => 0);
    expect(rounds[0].targetAt).toBeGreaterThanOrEqual(MIN_ROUND_SPACING_MS);
  });

  it('is deterministic for a fixed rng, spacing rounds exactly MIN_ROUND_SPACING_MS apart when rng returns 0', () => {
    const rounds = generateRounds(5, () => 0);
    expect(rounds.map((r) => r.targetAt)).toEqual([600, 1200, 1800, 2400, 3000]);
  });
});
