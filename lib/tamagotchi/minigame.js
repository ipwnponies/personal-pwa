// Pure round-generation and scoring math for the palette Play minigame. No
// DOM/React/timers here — those live in MinigameOverlay (pages/tamagotchi),
// which is covered by the page tests in
// __tests__/pages/tamagotchi/index.test.jsx; this file is what the unit
// tests below cover.
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
