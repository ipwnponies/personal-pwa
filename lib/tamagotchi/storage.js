import { createDefaultPet, SCHEMA_VERSION } from './simulation';

export const STORAGE_KEY = 'tamagotchi-pet';

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadPet = (now = Date.now()) => {
  const store = storage();
  if (!store) return createDefaultPet(now);
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return createDefaultPet(now);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && typeof parsed.hunger === 'number') {
      return parsed;
    }
  } catch {
    // fall through to default on corrupt data
  }
  return createDefaultPet(now);
};

export const savePet = (pet, now = Date.now()) => {
  const stamped = { ...pet, lastSeen: now };
  const store = storage();
  if (store) {
    store.setItem(STORAGE_KEY, JSON.stringify(stamped));
  }
  return stamped;
};
