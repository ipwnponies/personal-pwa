import { describe, it, expect } from 'vitest';
import { strokeBounds, buildWalls, WALL_RADIUS } from './doodleWalls';

const stroke = (overrides) => ({
  id: 'w', kind: 'stroke', color: '#e63946', points: [{ x: 0, y: 0 }], ...overrides,
});

describe('strokeBounds', () => {
  it('spans every point, expanded by WALL_RADIUS on each side', () => {
    const bounds = strokeBounds(stroke({
      points: [{ x: 10, y: 50 }, { x: 90, y: 20 }, { x: 40, y: 70 }],
    }));
    expect(bounds).toEqual({
      minX: 10 - WALL_RADIUS,
      minY: 20 - WALL_RADIUS,
      maxX: 90 + WALL_RADIUS,
      maxY: 70 + WALL_RADIUS,
    });
  });

  it('gives a single-point stroke a box of one wall thickness around it', () => {
    const bounds = strokeBounds(stroke({ points: [{ x: 100, y: 100 }] }));
    expect(bounds).toEqual({
      minX: 96, minY: 96, maxX: 104, maxY: 104,
    });
  });
});

describe('buildWalls', () => {
  it('returns one wall per stroke carrying its id, points and bounds', () => {
    const a = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const b = stroke({ id: 'b', points: [{ x: 50, y: 50 }, { x: 60, y: 50 }] });
    const walls = buildWalls([a, b], new Map());
    expect(walls).toHaveLength(2);
    expect(walls[0].id).toBe('a');
    expect(walls[0].points).toBe(a.points);
    expect(walls[0].bounds).toEqual(strokeBounds(a));
  });

  it('reuses the cached wall when the stroke has not grown', () => {
    const cache = new Map();
    const s = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const first = buildWalls([s], cache)[0];
    const second = buildWalls([s], cache)[0];
    expect(second).toBe(first);
  });

  it('rebuilds a wall once the stroke gains a point mid-draw', () => {
    const cache = new Map();
    const s = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const first = buildWalls([s], cache)[0];
    const grown = { ...s, points: [...s.points, { x: 10, y: 80 }] };
    const second = buildWalls([grown], cache)[0];
    expect(second).not.toBe(first);
    expect(second.bounds.maxY).toBe(80 + WALL_RADIUS);
  });

  it('drops cache entries for strokes that no longer exist', () => {
    const cache = new Map();
    const a = stroke({ id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    const b = stroke({ id: 'b', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    buildWalls([a, b], cache);
    expect(cache.size).toBe(2);
    buildWalls([a], cache);
    expect(cache.size).toBe(1);
    expect(cache.has('b')).toBe(false);
  });
});
