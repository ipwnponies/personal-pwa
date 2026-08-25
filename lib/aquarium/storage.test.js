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

  it('defaults decoration fields onto a pre-decorations save without touching existing fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      lastSeen: 1000,
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 77,
      eggProgress: 5,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [{ id: 'c1' }],
    }));
    const tank = loadTank(2000, () => 0.5);
    expect(tank.decorations).toEqual([]);
    expect(tank.decorationProgress).toBe(0);
    expect(tank.unlockedDecorationTypes).toEqual([]);
    expect(tank.tankCleanliness).toBe(77);
    expect(tank.eggProgress).toBe(5);
    expect(tank.creatures).toEqual([{ id: 'c1' }]);
  });

  it('round-trips existing decoration fields unchanged', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      lastSeen: 1000,
      selectedTool: 'food',
      soundOn: true,
      tankCleanliness: 100,
      eggProgress: 0,
      egg: null,
      foodDrops: [],
      toyDrops: [],
      dirtSpots: [],
      creatures: [],
      decorations: [{ id: 'd1', type: 'coral', x: 0.2, y: 0.3 }],
      decorationProgress: 45,
      unlockedDecorationTypes: ['seaweed', 'coral'],
    }));
    const tank = loadTank(2000, () => 0.5);
    expect(tank.decorations).toEqual([{ id: 'd1', type: 'coral', x: 0.2, y: 0.3 }]);
    expect(tank.decorationProgress).toBe(45);
    expect(tank.unlockedDecorationTypes).toEqual(['seaweed', 'coral']);
  });
});
