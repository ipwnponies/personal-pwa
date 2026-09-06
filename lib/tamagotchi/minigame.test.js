import { describe, it, expect } from 'vitest';
import { generateRounds, MIN_ROUND_SPACING_MS, scoreTap, HIT_WINDOW_MS, computePlayAmount, MIN_PLAY_AMOUNT } from './minigame';
import { PLAY_AMOUNT } from './simulation';

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

describe('scoreTap', () => {
  it('scores a perfectly-timed tap as a full-accuracy hit', () => {
    const round = { targetAt: 1000 };
    expect(scoreTap(round, 1000)).toEqual({ hit: true, accuracy: 1 });
  });

  it('scores a tap partway into the window with linear falloff', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS / 2);
    expect(result.hit).toBe(true);
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it('scores a tap exactly at the window edge as a hit with zero accuracy', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS);
    expect(result.hit).toBe(true);
    expect(result.accuracy).toBe(0);
  });

  it('scores a tap outside the window as a miss with zero (not negative) accuracy', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS * 2);
    expect(result.hit).toBe(false);
    expect(result.accuracy).toBe(0);
  });

  it('scores symmetrically for an early tap', () => {
    const round = { targetAt: 1000 };
    expect(scoreTap(round, 1000 - HIT_WINDOW_MS / 2).accuracy).toBeCloseTo(0.5);
  });
});

describe('computePlayAmount', () => {
  const perfectResults = Array.from({ length: 5 }, () => ({ hit: true, accuracy: 1 }));
  const missedResults = Array.from({ length: 5 }, () => ({ hit: false, accuracy: 0 }));

  it('returns the full PLAY_AMOUNT for a perfect session', () => {
    expect(computePlayAmount(perfectResults)).toBe(PLAY_AMOUNT);
  });

  it('returns MIN_PLAY_AMOUNT for an all-miss session', () => {
    expect(computePlayAmount(missedResults)).toBe(MIN_PLAY_AMOUNT);
  });

  it('interpolates linearly for a mixed-accuracy session', () => {
    const mixed = [
      { hit: true, accuracy: 1 },
      { hit: true, accuracy: 1 },
      { hit: false, accuracy: 0 },
      { hit: false, accuracy: 0 },
      { hit: true, accuracy: 0.5 },
    ];
    // average accuracy = (1 + 1 + 0 + 0 + 0.5) / 5 = 0.5
    expect(computePlayAmount(mixed)).toBeCloseTo(MIN_PLAY_AMOUNT + (PLAY_AMOUNT - MIN_PLAY_AMOUNT) * 0.5);
  });
});
