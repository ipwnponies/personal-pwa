import { clamp, generateId } from '../random';
import { speciesKeys, DEFAULT_SPECIES } from './creatures';
import { DETECTION_RADIUS, BOUNDS_MIN, BOUNDS_MAX } from './movement';

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


export const FEED_AMOUNT = 40;
export const PLAY_AMOUNT = 35;
export const EGG_FILL_PER_ACTION = 10;

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

export const assignSeekTargets = (state) => {
  const dropById = new Map([
    ...state.foodDrops.map((d) => [d.id, { ...d, type: 'food' }]),
    ...state.toyDrops.map((d) => [d.id, { ...d, type: 'toy' }]),
  ]);

  const creatures = state.creatures.map((c) => {
    const current = c.seekTargetId ? dropById.get(c.seekTargetId) : null;
    const stillEligible =
      current
      && ((current.type === 'food' && c.hunger < MET_THRESHOLD)
        || (current.type === 'toy' && c.happiness < MET_THRESHOLD));
    return { ...c, seekTargetId: stillEligible ? c.seekTargetId : null };
  });

  const claimed = new Set(creatures.filter((c) => c.seekTargetId).map((c) => c.seekTargetId));
  const unclaimedDrops = [...dropById.values()].filter((d) => !claimed.has(d.id));

  const pairs = [];
  creatures.forEach((c) => {
    if (c.seekTargetId) return;
    const wantsFood = c.hunger < MET_THRESHOLD;
    const wantsToy = c.happiness < MET_THRESHOLD;
    if (!wantsFood && !wantsToy) return;
    const preferType = wantsFood && (!wantsToy || c.hunger <= c.happiness) ? 'food' : 'toy';
    // Candidates span BOTH wanted types: preferring the more urgent need must
    // not blind a creature to the only drop in range being the other type
    // (fresh tanks keep hunger and happiness exactly equal, so the tiebreak
    // would otherwise pin every creature to food forever).
    unclaimedDrops
      .filter((d) => (d.type === 'food' ? wantsFood : wantsToy))
      .forEach((d) => {
        const dist = distance(c, d.x, d.y);
        if (dist > DETECTION_RADIUS) return;
        pairs.push({
          creatureId: c.id,
          dropId: d.id,
          dist,
          matchesPreferred: d.type === preferType,
        });
      });
  });
  // Preferred-type matches rank ahead of the fallback type, nearest-first within each group.
  const rank = (p) => (p.matchesPreferred ? 0 : 1);
  pairs.sort((a, b) => rank(a) - rank(b) || a.dist - b.dist);

  const usedCreatures = new Set();
  const usedDrops = new Set();
  const assignments = new Map();
  pairs.forEach((p) => {
    if (usedCreatures.has(p.creatureId) || usedDrops.has(p.dropId)) return;
    usedCreatures.add(p.creatureId);
    usedDrops.add(p.dropId);
    assignments.set(p.creatureId, p.dropId);
  });

  return {
    ...state,
    creatures: creatures.map((c) => (
      assignments.has(c.id) ? { ...c, seekTargetId: assignments.get(c.id) } : c
    )),
  };
};

export const DIRT_SPOT_CAP = 6;
export const DIRT_SPOT_STEP = 10;
export const DIRT_SPOT_CLEAN_AMOUNT = 20;

export const spawnDirtSpot = (state, rng = Math.random) => {
  const spot = {
    id: generateId(),
    x: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
    y: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
    createdAt: state.lastSeen,
  };
  const next = [...state.dirtSpots, spot];
  const dirtSpots = next.length > DIRT_SPOT_CAP ? next.slice(next.length - DIRT_SPOT_CAP) : next;
  return { ...state, dirtSpots };
};

export const wipeDirtSpot = (state, id) => {
  if (!state.dirtSpots.some((s) => s.id === id)) return state;
  return withEggProgress({
    ...state,
    dirtSpots: state.dirtSpots.filter((s) => s.id !== id),
    tankCleanliness: raise(state.tankCleanliness, DIRT_SPOT_CLEAN_AMOUNT),
  });
};

// Number of DIRT_SPOT_STEP-point thresholds crossed going from prevClean down to nextClean.
const dirtSpotSteps = (prevClean, nextClean) => {
  const prevSteps = Math.floor((NEED_MAX - prevClean) / DIRT_SPOT_STEP);
  const nextSteps = Math.floor((NEED_MAX - nextClean) / DIRT_SPOT_STEP);
  return Math.max(0, nextSteps - prevSteps);
};

export const applyElapsed = (state, elapsedMs, now = Date.now(), rng = Math.random) => {
  const ms = clamp(elapsedMs, 0, MAX_ELAPSED_MS);
  const minutes = ms / 60000;
  const prevNow = state.lastSeen;
  const prevCleanliness = state.tankCleanliness;
  const tankCleanliness = decayNeed(prevCleanliness, CLEAN_DECAY_PER_MIN, minutes);
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

  let next = { ...state, tankCleanliness, creatures, lastSeen: now };
  const spotsToAdd = dirtSpotSteps(prevCleanliness, tankCleanliness);
  for (let i = 0; i < spotsToAdd; i += 1) {
    next = spawnDirtSpot(next, rng);
  }
  return next;
};

