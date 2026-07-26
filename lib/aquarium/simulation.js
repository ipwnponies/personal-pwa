import { clamp, generateId } from '../random';
import { speciesKeys, DEFAULT_SPECIES } from './creatures';

export const SCHEMA_VERSION = 1;
export const NEED_FLOOR = 15;
export const NEED_MAX = 100;
export const TANK_CAP = 8;
export const MET_THRESHOLD = 60;

export const HUNGER_DECAY_PER_MIN = 0.05;
export const HAPPINESS_DECAY_PER_MIN = 0.05;
export const CLEAN_DECAY_PER_MIN = 0.05;
// Extra happiness loss per minute while the tank is dirty (cleanliness below MET).
export const DIRTY_DRAG_PER_MIN = 0.06;

export const STAGE_DURATIONS_MS = { baby: 6 * 3600e3, child: 12 * 3600e3 };
// Clamp offline catch-up so an ancient save still resolves to a recoverable state.
export const MAX_ELAPSED_MS = 7 * 24 * 3600e3;

const NEXT_STAGE = { baby: 'child', child: 'adult' };

const randomSpecies = (rng) => {
  const keys = speciesKeys();
  return keys[Math.floor(rng() * keys.length)] || DEFAULT_SPECIES;
};

const makeCreature = (now, rng) => ({
  id: generateId(),
  species: randomSpecies(rng),
  bornAt: now,
  stage: 'baby',
  hunger: NEED_MAX,
  happiness: NEED_MAX,
  wellMetSince: null,
  x: 0.15 + rng() * 0.7,
  y: 0.15 + rng() * 0.7,
});

export const createDefaultTank = (now = Date.now(), rng = Math.random) => ({
  version: SCHEMA_VERSION,
  lastSeen: now,
  selectedTool: 'food',
  soundOn: true,
  tankCleanliness: NEED_MAX,
  eggProgress: 0,
  egg: null,
  creatures: [makeCreature(now, rng), makeCreature(now, rng)],
});

const decayNeed = (value, ratePerMin, minutes) =>
  clamp(value - ratePerMin * minutes, NEED_FLOOR, NEED_MAX);

// prevNow anchors a fresh streak at the START of this interval, not its end.
// Decay only ever lowers needs, so if a need is still above threshold after
// decaying for the interval, it was above threshold for the whole interval —
// the streak validly began at prevNow (or earlier, if already tracked).
const grow = (creature, now, prevNow) => {
  const met =
    creature.hunger >= MET_THRESHOLD
    && creature.happiness >= MET_THRESHOLD
    && creature.metEnv;
  if (!met) return { ...creature, wellMetSince: null, metEnv: undefined };
  const wellMetSince = creature.wellMetSince ?? prevNow;
  const duration = STAGE_DURATIONS_MS[creature.stage];
  if (duration != null && now - wellMetSince >= duration) {
    return {
      ...creature,
      stage: NEXT_STAGE[creature.stage],
      wellMetSince: now,
      metEnv: undefined,
    };
  }
  return { ...creature, wellMetSince, metEnv: undefined };
};

export const applyElapsed = (state, elapsedMs, now = Date.now()) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const prevNow = state.lastSeen;
  const tankCleanliness = decayNeed(state.tankCleanliness, CLEAN_DECAY_PER_MIN, minutes);
  const dirty = tankCleanliness < MET_THRESHOLD;

  const creatures = state.creatures.map((c) => {
    const hunger = decayNeed(c.hunger, HUNGER_DECAY_PER_MIN, minutes);
    const dragged = dirty
      ? clamp(c.happiness - DIRTY_DRAG_PER_MIN * minutes, NEED_FLOOR, NEED_MAX)
      : c.happiness;
    const happiness = decayNeed(dragged, HAPPINESS_DECAY_PER_MIN, minutes);
    // metEnv folds the shared tank condition into the per-creature growth check.
    return grow(
      { ...c, hunger, happiness, metEnv: tankCleanliness >= MET_THRESHOLD },
      now,
      prevNow,
    );
  });

  return { ...state, tankCleanliness, creatures, lastSeen: now };
};
