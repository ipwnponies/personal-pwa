import { clamp } from '../random';
import { DETECTION_RADIUS } from './movement';
import { TANK_CAP } from './simulation';

// Reuses movement.js's existing detection radius rather than introducing a
// second magic number for "how close counts as in range".
export const FISHING_DETECTION_RADIUS = DETECTION_RADIUS;
// Cadence of bite rolls during an active cast. More ticks before any fish
// reaches the hook means more dynamism (a real race, not a foregone
// conclusion) — starting point, may need a calibration pass once playable.
export const BITE_TICK_MS = 400;
export const BITE_CHANCE_BASE = 0.15;
// Multiplier applied when a fish has moved closer to the bait since the
// previous tick, so distance and chance compound rather than each tick
// being an independent roll.
export const SNOWBALL_BOOST = 1.5;

// The randomized affinity source fishing substitutes for
// simulation.js's need-derived computeAffinity — same [0, 1] range, same
// ephemeral (never persisted) per-fish generation as movement.js's
// cruiseSpeed.
export const generateHiddenAttraction = (rng = Math.random) => rng();

export const computeBiteChance = (dist, radius, hiddenAttraction, gotCloser) => {
  const proximity = clamp(1 - dist / radius, 0, 1);
  const snowball = gotCloser ? SNOWBALL_BOOST : 1;
  return clamp(BITE_CHANCE_BASE * proximity * hiddenAttraction * snowball, 0, 1);
};

export const catchFish = (state, creatureId) => {
  const creature = state.creatures.find((c) => c.id === creatureId);
  if (!creature) return state;
  return {
    ...state,
    creatures: state.creatures.filter((c) => c.id !== creatureId),
    bucket: [...state.bucket, creature],
  };
};

// Bucketing a fish frees a slot, which can re-enable egg fill/hatching (both
// gated on TANK_CAP in simulation.js). Without this guard, returning the
// bucketed fish afterwards would push creatures past the cap — so a full tank
// refuses the return and the fish simply stays in the bucket.
export const returnFish = (state, creatureId) => {
  if (state.creatures.length >= TANK_CAP) return state;
  const creature = state.bucket.find((c) => c.id === creatureId);
  if (!creature) return state;
  return {
    ...state,
    bucket: state.bucket.filter((c) => c.id !== creatureId),
    creatures: [...state.creatures, creature],
  };
};

export const deleteFromBucket = (state, creatureId) => {
  if (!state.bucket.some((c) => c.id === creatureId)) return state;
  return { ...state, bucket: state.bucket.filter((c) => c.id !== creatureId) };
};
