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
// The pet-tap pat, distinct from PLAY_AMOUNT (the minigame's ceiling) so the
// minigame is the only way to reach full happiness gain from a single action.
export const PET_TAP_AMOUNT = 10;

// Evolution-branch tuning (see docs/superpowers/specs/2026-09-05-tamagotchi-game-design.md).
// Starting values, not load-bearing precision — tune during playtesting.
export const EFFICIENT_THRESHOLD = 6;
export const DOMINANCE_THRESHOLD = 0.5;
// Converts accumulated sleep minutes into units comparable to a single feed/play
// action, so the three care-tally fractions are on the same scale.
export const SLEEP_MINUTES_PER_TALLY_UNIT = 5;

// Sickness tuning. Starting value, not load-bearing precision.
export const SICKNESS_THRESHOLD_MIN = 15;

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
  // Evolution tally (see game-design spec) — feed/play actions taken, plus
  // cumulative minutes spent asleep (not a toggle count, so it can't be
  // gamed by spam-tapping the sleep button).
  feedCount: 0,
  playCount: 0,
  sleepMinutes: 0,
  adultForm: null,
  // Sickness (see game-design spec).
  sick: false,
  poopUncleanMinutes: 0,
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

export const cleanPoop = (state) =>
  state.hasPoop ? { ...state, hasPoop: false, poopUncleanMinutes: 0 } : state;

export const giveMedicine = (state) => ({ ...state, sick: false });

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
  let happiness = decay(state.happiness, HAPPINESS_DECAY_PER_MIN, minutes);
  const energy = state.asleep
    ? raise(state.energy, ENERGY_RECOVERY_PER_MIN * minutes)
    : decay(state.energy, ENERGY_DECAY_PER_MIN, minutes);

  const poopMinutes = state.poopMinutes + minutes;
  const poopSpawns = Math.floor(poopMinutes / POOP_INTERVAL_MIN);
  const hasPoop = state.hasPoop || poopSpawns > 0;

  // state.hasPoop here is the INCOMING flag (before this call), not the
  // newly computed hasPoop above. If poop was already sitting there, the
  // whole elapsed gap counts toward uncleanliness. If it spawns fresh
  // partway through a long offline gap, only the minutes since that spawn
  // count — poopMinutes % POOP_INTERVAL_MIN, the same remainder used for
  // the next poopMinutes below.
  const minutesSinceFreshPoop = poopSpawns > 0 ? poopMinutes % POOP_INTERVAL_MIN : 0;
  const poopUncleanMinutes = state.hasPoop
    ? state.poopUncleanMinutes + minutes
    : minutesSinceFreshPoop;
  const sick = state.sick || poopUncleanMinutes > SICKNESS_THRESHOLD_MIN;

  // decay() clamps at NEED_FLOOR, so decaying twice at the same rate lands
  // on exactly the same result as decaying once at double the rate (both
  // hit the floor at the same point) — this doubles this tick's happiness
  // loss without redeclaring the happiness computed above.
  if (sick) happiness = decay(happiness, HAPPINESS_DECAY_PER_MIN, minutes);

  // Skip grow() entirely while sick, rather than gating its met-check —
  // gating the met-check would reset wellMetSince on the failure path that
  // already exists there, punishing a pet that gets sick near the end of a
  // stage by costing the full streak again.
  //
  // wellMetSince is an absolute timestamp, so leaving it alone while
  // wall-clock time advances would BANK the sick interval: on recovery the
  // next grow() would see now - wellMetSince already past the stage
  // duration and grow instantly. Shifting the anchor forward by this tick's
  // elapsed ms keeps the pre-illness progress while contributing nothing
  // toward the stage clock — frozen, not deferred.
  const grown = sick
    ? { ...state, wellMetSince: state.wellMetSince == null ? null : state.wellMetSince + ms }
    : grow({ ...state, hunger, happiness, energy }, now, prevNow);

  return {
    ...grown,
    hunger,
    happiness,
    energy,
    sick,
    poopUncleanMinutes,
    poopMinutes: poopMinutes % POOP_INTERVAL_MIN,
    hasPoop,
    lastSeen: now,
  };
};
