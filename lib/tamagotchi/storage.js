import { SCHEMA_VERSION } from './simulation';

export const STORAGE_KEY = 'tamagotchi-pet';

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Returns null when there is no usable save. The page distinguishes "no pet
// yet" from "still loading" and shows the species chooser, so a corrupt or
// version-mismatched save sends the player back to the chooser rather than
// silently handing them a pet they did not pick.
//
// Takes no arguments: every path that needed the current time was the one
// fabricating a pet, and an unused parameter is a lint error here.
export const loadPet = () => {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === SCHEMA_VERSION && typeof parsed.hunger === 'number') {
      // Additive-safe defaults for fields introduced after this save was
      // written — spread order lets an old-shaped save fall back to these
      // while a save that already has them keeps its own values.
      return {
        feedCount: 0,
        playCount: 0,
        sleepMinutes: 0,
        adultForm: null,
        sick: false,
        poopUncleanMinutes: 0,
        ...parsed,
      };
    }
  } catch {
    // fall through to null on corrupt data
  }
  return null;
};

export const savePet = (pet, now = Date.now()) => {
  const stamped = { ...pet, lastSeen: now };
  const store = storage();
  if (store) {
    store.setItem(STORAGE_KEY, JSON.stringify(stamped));
  }
  return stamped;
};

export const clearPet = () => {
  const store = storage();
  if (store) store.removeItem(STORAGE_KEY);
};
