import { clamp, generateId } from '../random';
import { speciesKeys, DEFAULT_SPECIES } from './creatures';

// v2 added foodDrops/toyDrops/dirtSpots and creature.seekTargetId, and dropped
// the 'sponge' tool. A v1 save is structurally incompatible (it would crash on
// the missing arrays and the missing tool), so loadTank discards it wholesale.
export const SCHEMA_VERSION = 2;
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
  seekTargetId: null,
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
  foodDrops: [],
  toyDrops: [],
  dirtSpots: [],
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

export const FEED_AMOUNT = 40;
export const PLAY_AMOUNT = 35;
export const CLEAN_AMOUNT = 60;
export const EGG_FILL_PER_ACTION = 10;
export const FEED_RADIUS = 0.3;
export const TANK_ACTION_MAX_TARGETS = 3;

const raise = (value, amount) => clamp(value + amount, NEED_FLOOR, NEED_MAX);

// Care fills the egg meter; a full meter spawns an egg unless the tank is full.
const withEggProgress = (state) => {
  if (state.creatures.length >= TANK_CAP) return state;
  const filled = state.eggProgress + EGG_FILL_PER_ACTION;
  if (filled >= NEED_MAX && state.egg == null) {
    return { ...state, eggProgress: 0, egg: { readyAt: state.lastSeen } };
  }
  return { ...state, eggProgress: clamp(filled, 0, NEED_MAX) };
};

const mapCreature = (state, id, fn) => ({
  ...state,
  creatures: state.creatures.map((c) => (c.id === id ? fn(c) : c)),
});

const distance = (c, x, y) => Math.hypot(c.x - x, c.y - y);

// Targets for a tank-wide action: the nearest creatures within radius of the
// drop point, or the single nearest if none are close enough.
const targetIds = (creatures, x, y) => {
  const byDistance = [...creatures].sort((a, b) => distance(a, x, y) - distance(b, x, y));
  const within = byDistance.filter((c) => distance(c, x, y) <= FEED_RADIUS);
  const chosen = within.length > 0
    ? within.slice(0, TANK_ACTION_MAX_TARGETS)
    : byDistance.slice(0, 1);
  return new Set(chosen.map((c) => c.id));
};

export const feedCreature = (state, id) =>
  withEggProgress(mapCreature(state, id, (c) => ({ ...c, hunger: raise(c.hunger, FEED_AMOUNT) })));

export const playCreature = (state, id) =>
  withEggProgress(
    mapCreature(state, id, (c) => ({ ...c, happiness: raise(c.happiness, PLAY_AMOUNT) })),
  );

export const cleanTank = (state) =>
  withEggProgress({ ...state, tankCleanliness: raise(state.tankCleanliness, CLEAN_AMOUNT) });

export const feedTank = (state, x, y) => {
  const ids = targetIds(state.creatures, x, y);
  return withEggProgress({
    ...state,
    creatures: state.creatures.map((c) =>
      (ids.has(c.id) ? { ...c, hunger: raise(c.hunger, FEED_AMOUNT) } : c)),
  });
};

export const playTank = (state, x, y) => {
  const ids = targetIds(state.creatures, x, y);
  return withEggProgress({
    ...state,
    creatures: state.creatures.map((c) =>
      (ids.has(c.id) ? { ...c, happiness: raise(c.happiness, PLAY_AMOUNT) } : c)),
  });
};

export const hatchEgg = (state, now = Date.now(), rng = Math.random) => {
  if (state.egg == null || state.creatures.length >= TANK_CAP) {
    return { ...state, egg: null };
  }
  return {
    ...state,
    egg: null,
    creatures: [...state.creatures, makeCreature(now, rng)],
  };
};

export const MAX_DROPS_PER_TYPE = 6;

const addDrop = (drops, x, y, now) => {
  const next = [...drops, { id: generateId(), x, y, createdAt: now }];
  return next.length > MAX_DROPS_PER_TYPE ? next.slice(next.length - MAX_DROPS_PER_TYPE) : next;
};

export const dropFood = (state, x, y, now = state.lastSeen) => ({
  ...state,
  foodDrops: addDrop(state.foodDrops, x, y, now),
});

export const dropToy = (state, x, y, now = state.lastSeen) => ({
  ...state,
  toyDrops: addDrop(state.toyDrops, x, y, now),
});

export const findDrop = (state, dropId) => {
  const food = state.foodDrops.find((d) => d.id === dropId);
  if (food) return { type: 'food', drop: food };
  const toy = state.toyDrops.find((d) => d.id === dropId);
  if (toy) return { type: 'toy', drop: toy };
  return null;
};

export const consumeDrop = (state, creatureId, dropId) => {
  const found = findDrop(state, dropId);
  if (!found) return state;
  const { type } = found;
  const key = type === 'food' ? 'hunger' : 'happiness';
  const amount = type === 'food' ? FEED_AMOUNT : PLAY_AMOUNT;
  const withoutDrop = {
    ...state,
    foodDrops: type === 'food' ? state.foodDrops.filter((d) => d.id !== dropId) : state.foodDrops,
    toyDrops: type === 'toy' ? state.toyDrops.filter((d) => d.id !== dropId) : state.toyDrops,
  };
  return withEggProgress(
    mapCreature(withoutDrop, creatureId, (c) => ({
      ...c,
      [key]: raise(c[key], amount),
      seekTargetId: null,
    })),
  );
};

// Bounds a wandering creature stays within, so it never drifts under the toolbar or off-screen.
export const WANDER_MIN = 0.1;
export const WANDER_MAX = 0.9;
export const WANDER_STEP = 0.3;

// Nudges each creature toward a new nearby spot; paired with a CSS position
// transition in the page, this reads as continuous swimming around the tank.
export const wanderCreatures = (state, rng = Math.random) => ({
  ...state,
  creatures: state.creatures.map((c) => ({
    ...c,
    x: clamp(c.x + (rng() - 0.5) * WANDER_STEP, WANDER_MIN, WANDER_MAX),
    y: clamp(c.y + (rng() - 0.5) * WANDER_STEP, WANDER_MIN, WANDER_MAX),
  })),
});
