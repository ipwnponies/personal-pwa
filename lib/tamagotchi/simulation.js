import { clamp } from '../random';
import { DEFAULT_PET } from './creatures';

// Scaffold schema. A structurally incompatible save (missing fields, wrong
// version) is discarded wholesale by loadTank, same as the aquarium.
export const SCHEMA_VERSION = 1;
export const NEED_FLOOR = 0;
export const NEED_MAX = 100;
export const MET_THRESHOLD = 60;

export const HUNGER_DECAY_PER_MIN = 4;
export const HAPPINESS_DECAY_PER_MIN = 3;
// Energy only drains while awake; sleeping reverses the sign (see applyElapsed).
export const ENERGY_DECAY_PER_MIN = 2;
export const ENERGY_RECOVERY_PER_MIN = 10;

export const FEED_AMOUNT = 25;
export const PLAY_AMOUNT = 25;
export const PLAY_ENERGY_COST = 10;

// A poop pile appears once enough unclean time accumulates, same shape as
// the aquarium's dirt-spot cadence — one clamped counter, stepped in whole
// units by applyElapsed rather than left as a raw float on state.
export const POOP_INTERVAL_MIN = 20;

// Growth requires hunger/happiness both above threshold for the stage
// duration, mirroring the aquarium's wellMetSince streak.
export const STAGE_DURATIONS_MS = { baby: 5 * 60e3, child: 15 * 60e3 };
const NEXT_STAGE = { baby: 'child', child: 'adult' };

// Clamp offline catch-up so an ancient save still resolves to a recoverable state.
export const MAX_ELAPSED_MS = 7 * 24 * 3600e3;

export const createDefaultPet = (now = Date.now()) => ({
  version: SCHEMA_VERSION,
  lastSeen: now,
  petType: DEFAULT_PET,
  bornAt: now,
  stage: 'baby',
  hunger: NEED_MAX,
  happiness: NEED_MAX,
  energy: NEED_MAX,
  asleep: false,
  wellMetSince: null,
  poopMinutes: 0,
  hasPoop: false,
  soundOn: true,
});

const raise = (value, amount) => clamp(value + amount, NEED_FLOOR, NEED_MAX);
const decay = (value, ratePerMin, minutes) => clamp(value - ratePerMin * minutes, NEED_FLOOR, NEED_MAX);

export const feedPet = (state, amount = FEED_AMOUNT) => ({
  ...state,
  hunger: raise(state.hunger, amount),
});

export const playWithPet = (state, amount = PLAY_AMOUNT) => ({
  ...state,
  happiness: raise(state.happiness, amount),
  energy: clamp(state.energy - PLAY_ENERGY_COST, NEED_FLOOR, NEED_MAX),
});

export const toggleSleep = (state) => ({ ...state, asleep: !state.asleep });

export const cleanPoop = (state) => (state.hasPoop ? { ...state, hasPoop: false } : state);

// prevNow anchors a fresh streak at the START of this interval, not its end —
// same reasoning as the aquarium's grow(): decay only lowers needs, so if
// both are still above threshold after decaying the whole interval, they were
// above threshold for the whole interval.
const grow = (pet, now, prevNow) => {
  const met = pet.hunger >= MET_THRESHOLD && pet.happiness >= MET_THRESHOLD;
  if (!met) return { ...pet, wellMetSince: null };
  const wellMetSince = pet.wellMetSince ?? prevNow;
  const duration = STAGE_DURATIONS_MS[pet.stage];
  if (duration != null && now - wellMetSince >= duration) {
    return { ...pet, stage: NEXT_STAGE[pet.stage], wellMetSince: now };
  }
  return { ...pet, wellMetSince };
};

export const applyElapsed = (state, elapsedMs, now = Date.now()) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const prevNow = state.lastSeen;

  const hunger = decay(state.hunger, HUNGER_DECAY_PER_MIN, minutes);
  const happiness = decay(state.happiness, HAPPINESS_DECAY_PER_MIN, minutes);
  const energy = state.asleep
    ? raise(state.energy, ENERGY_RECOVERY_PER_MIN * minutes)
    : decay(state.energy, ENERGY_DECAY_PER_MIN, minutes);

  const poopMinutes = state.poopMinutes + minutes;
  const poopSpawns = Math.floor(poopMinutes / POOP_INTERVAL_MIN);
  const hasPoop = state.hasPoop || poopSpawns > 0;

  const grown = grow({ ...state, hunger, happiness, energy }, now, prevNow);

  return {
    ...grown,
    poopMinutes: poopMinutes % POOP_INTERVAL_MIN,
    hasPoop,
    lastSeen: now,
  };
};
