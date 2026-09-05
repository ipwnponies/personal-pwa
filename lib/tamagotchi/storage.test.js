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
