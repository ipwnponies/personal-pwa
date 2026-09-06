// Pure round-generation and scoring math for the palette Play minigame. No
// DOM/React/timers here — those live in MinigameOverlay (pages/tamagotchi),
// which is covered by the page tests in
// __tests__/pages/tamagotchi/index.test.jsx; this file is what the unit
// tests below cover.
import { clamp } from '../random';
import { PLAY_AMOUNT } from './simulation';

export const ROUND_COUNT = 5;
export const HIT_WINDOW_MS = 400;
export const MIN_ROUND_SPACING_MS = 600;
// Random slack added on top of the minimum spacing, so rounds don't land
// on a perfectly predictable metronome.
const ROUND_JITTER_MS = 400;

export const generateRounds = (count, rng = Math.random) => {
  const rounds = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    cursor += MIN_ROUND_SPACING_MS + rng() * ROUND_JITTER_MS;
    rounds.push({ targetAt: cursor });
  }
  return rounds;
};

export const scoreTap = (round, tapOffsetMs) => {
  const dist = Math.abs(tapOffsetMs - round.targetAt);
  const hit = dist <= HIT_WINDOW_MS;
  const accuracy = clamp(1 - dist / HIT_WINDOW_MS, 0, 1);
  return { hit, accuracy };
};

export const MIN_PLAY_AMOUNT = 10;

// Caller's contract: results must be exactly ROUND_COUNT entries, one per
// round in order — a round the player never tapped is still present as
// { hit: false, accuracy: 0 }, never omitted. This function does not guard
// against a short/empty array; that guarantee lives in MinigameOverlay.
export const computePlayAmount = (results) => {
  const totalAccuracy = results.reduce((sum, result) => sum + result.accuracy, 0);
  const averageAccuracy = totalAccuracy / results.length;
  return MIN_PLAY_AMOUNT + (PLAY_AMOUNT - MIN_PLAY_AMOUNT) * averageAccuracy;
};
