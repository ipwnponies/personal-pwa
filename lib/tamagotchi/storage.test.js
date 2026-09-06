import { describe, it, expect, beforeEach } from 'vitest';
import { loadPet, savePet, STORAGE_KEY } from './storage';
import { createDefaultPet, SCHEMA_VERSION } from './simulation';

describe('loadPet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a fresh default pet when nothing is stored', () => {
    const pet = loadPet(1000);
    expect(pet.version).toBe(SCHEMA_VERSION);
    expect(pet.lastSeen).toBe(1000);
  });

  it('returns the stored pet when the schema matches', () => {
    const stored = { ...createDefaultPet(500), hunger: 42 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    expect(loadPet(1000).hunger).toBe(42);
  });

  it('discards a save with a mismatched version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createDefaultPet(0), version: 999 }));
    expect(loadPet(1000).version).toBe(SCHEMA_VERSION);
  });

  it('discards corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadPet(1000).version).toBe(SCHEMA_VERSION);
  });

  it('defaults fields missing from an older-shaped save', () => {
    const { feedCount, playCount, sleepMinutes, adultForm, sick, poopUncleanMinutes, ...oldShaped } =
      createDefaultPet(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldShaped));
    const loaded = loadPet(1000);
    expect(loaded.feedCount).toBe(0);
    expect(loaded.playCount).toBe(0);
    expect(loaded.sleepMinutes).toBe(0);
    expect(loaded.adultForm).toBeNull();
    expect(loaded.sick).toBe(false);
    expect(loaded.poopUncleanMinutes).toBe(0);
  });

  it('keeps a save that already has its own values for those fields', () => {
    const stored = { ...createDefaultPet(0), feedCount: 4, sick: true, adultForm: 'balanced' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const loaded = loadPet(1000);
    expect(loaded.feedCount).toBe(4);
    expect(loaded.sick).toBe(true);
    expect(loaded.adultForm).toBe('balanced');
  });
});

describe('savePet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the pet stamped with the given time', () => {
    const pet = createDefaultPet(0);
    savePet(pet, 5000);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).lastSeen).toBe(5000);
  });
});
