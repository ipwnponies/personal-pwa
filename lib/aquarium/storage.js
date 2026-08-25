import { createDefaultTank, SCHEMA_VERSION } from './simulation';

export const STORAGE_KEY = 'aquarium-tank';

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadTank = (now = Date.now(), rng = Math.random) => {
  const store = storage();
  if (!store) return createDefaultTank(now, rng);
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return createDefaultTank(now, rng);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && Array.isArray(parsed.creatures)) {
      // Additive-safe defaults for fields introduced after this save was written
      // (KTD10) — spread order lets an old-shaped save fall back to these
      // while a save that already has them keeps its own values.
      return {
        decorations: [],
        decorationProgress: 0,
        unlockedDecorationTypes: [],
        ...parsed,
      };
    }
  } catch {
    // fall through to default on corrupt data
  }
  return createDefaultTank(now, rng);
};

export const saveTank = (tank, now = Date.now()) => {
  const stamped = { ...tank, lastSeen: now };
  const store = storage();
  if (store) {
    store.setItem(STORAGE_KEY, JSON.stringify(stamped));
  }
  return stamped;
};
