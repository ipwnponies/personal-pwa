import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEY, loadTank, saveTank } from './storage';
import { SCHEMA_VERSION } from './simulation';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a default tank when nothing is stored', () => {
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
    expect(tank.creatures.length).toBeGreaterThan(0);
  });

  it('round-trips a saved tank', () => {
    const tank = loadTank(1000, () => 0.5);
    tank.tankCleanliness = 42;
    saveTank(tank, 2000);
    const reloaded = loadTank(3000, () => 0.5);
    expect(reloaded.tankCleanliness).toBe(42);
    expect(reloaded.lastSeen).toBe(2000);
  });

  it('returns a default tank when stored JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
  });

  it('returns a default tank on version mismatch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, creatures: [] }));
    const tank = loadTank(1000, () => 0.5);
    expect(tank.version).toBe(SCHEMA_VERSION);
    expect(tank.creatures.length).toBeGreaterThan(0);
  });

  it('saveTank stamps lastSeen and returns the tank', () => {
    const tank = loadTank(1000, () => 0.5);
    const saved = saveTank(tank, 5555);
    expect(saved.lastSeen).toBe(5555);
  });
});
