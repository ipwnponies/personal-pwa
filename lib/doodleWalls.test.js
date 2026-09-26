import { describe, it, expect } from 'vitest';
import {
  strokeBounds, buildWalls, WALL_RADIUS, resolveWallCollisions, DEFAULT_WALL_RESTITUTION, MAX_WALL_PUSH_PER_FRAME,
  clampIntoBounds, createStuckState, trackStuck, STUCK_DISPLACEMENT_PER_S, DEFAULT_STUCK_AFTER_S,
} from './doodleWalls';

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

const shape = (overrides) => ({
  id: 's', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
  rotation: 0, size: 40, note: 440, vx: 0, vy: 0, ...overrides,
});

// A horizontal line across y = 100, from x = 0 to x = 200.
const lineWall = () => buildWalls(
  [stroke({ id: 'w', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] })],
  new Map(),
);

describe('resolveWallCollisions', () => {
  it('leaves a shape clear of every wall untouched', () => {
    const s = shape({ x: 100, y: 10 });
    const { shapes, events, contacts } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
    expect(contacts.size).toBe(0);
  });

  it('reflects a shape driven head-on into a wall and separates it', () => {
    // r = 20, WALL_RADIUS = 4, so contact starts at 24px from the line.
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].y).toBeCloseTo(76); // pushed 4px out along the normal
    expect(shapes[0].x).toBeCloseTo(100); // no sideways drift
    expect(shapes[0].vy).toBeCloseTo(-50 * DEFAULT_WALL_RESTITUTION);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'wallBounce', x: 100, y: 100, color: '#e63946', normal: { x: 0, y: -1 },
    });
  });

  it('ignores a shape passing by outside the wall thickness', () => {
    const s = shape({ x: 100, y: 130, vx: 60 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('registers contact but emits no event for a shape already moving away', () => {
    const s = shape({ x: 100, y: 80, vy: -10 });
    const { shapes, events, contacts } = resolveWallCollisions([s], lineWall());
    expect(events).toEqual([]);            // the velAlongNormal gate
    expect(contacts.has('s')).toBe(true);  // but it is touching the wall
    expect(shapes[0].y).toBeCloseTo(76);   // and still gets pushed out
  });

  it('caps position correction at MAX_WALL_PUSH_PER_FRAME for a deep overlap', () => {
    // A line drawn straight through a resting shape: 19px of overlap.
    const s = shape({ x: 100, y: 95 });
    const { shapes } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].y).toBeCloseTo(95 - MAX_WALL_PUSH_PER_FRAME);
  });

  it('rejects a wall by its bounding box before testing any segment', () => {
    // Hand-built wall whose bounds deliberately exclude the shape while its
    // points would overlap it — proves broad phase runs and short-circuits.
    const liar = {
      id: 'w',
      points: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      bounds: {
        minX: 900, minY: 900, maxX: 1000, maxY: 1000,
      },
    };
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes, events } = resolveWallCollisions([s], [liar]);
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('skips a grabbed shape entirely, so the finger passes through walls', () => {
    const s = shape({ x: 100, y: 95, vy: 50 });
    const { shapes, events, contacts } = resolveWallCollisions(
      [s], lineWall(), new Set(['s']),
    );
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
    expect(contacts.size).toBe(0);
  });

  it('skips a shape with active wall immunity', () => {
    const s = shape({ x: 100, y: 95, vy: 50, wallImmunityRemaining: 0.5 });
    const { shapes, events } = resolveWallCollisions([s], lineWall());
    expect(shapes[0]).toEqual(s);
    expect(events).toEqual([]);
  });

  it('still reports contact for an immune shape, so immunity can be refreshed', () => {
    // Detection runs for an immune shape; only the correction is skipped. The
    // caller needs the contact to keep a shape immune until it actually clears
    // a wall, rather than expiring on a fixed clock while still pinned.
    const s = shape({ x: 100, y: 95, vy: 50, wallImmunityRemaining: 0.5 });
    const { shapes, events, contacts } = resolveWallCollisions([s], lineWall());
    expect(contacts.has('s')).toBe(true);
    expect(shapes[0]).toEqual(s); // position and velocity untouched
    expect(events).toEqual([]);
  });

  it('honours a custom restitution', () => {
    const s = shape({ x: 100, y: 80, vy: 50 });
    const { shapes } = resolveWallCollisions([s], lineWall(), null, 0.5);
    expect(shapes[0].vy).toBeCloseTo(-25);
  });

  it('resolves against a dot stroke (two identical points) without NaN', () => {
    const dot = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 100 }, { x: 100, y: 100 }] })],
      new Map(),
    );
    const s = shape({ x: 100, y: 110, vy: -30 });
    const { shapes, events } = resolveWallCollisions([s], dot);
    expect(Number.isFinite(shapes[0].x)).toBe(true);
    expect(Number.isFinite(shapes[0].y)).toBe(true);
    expect(shapes[0].y).toBeCloseTo(114);
    expect(shapes[0].vy).toBeCloseTo(30 * DEFAULT_WALL_RESTITUTION);
    expect(events).toHaveLength(1);
  });

  it('pushes a shape centered exactly on a segment out along its perpendicular', () => {
    const s = shape({ x: 100, y: 100 });
    const { shapes } = resolveWallCollisions([s], lineWall());
    expect(shapes[0].x).toBeCloseTo(100);
    expect(Math.abs(shapes[0].y - 100)).toBeCloseTo(MAX_WALL_PUSH_PER_FRAME);
  });

  it('pushes a shape centered exactly on a dot along a deterministic axis', () => {
    const dot = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 100 }, { x: 100, y: 100 }] })],
      new Map(),
    );
    const s = shape({ id: 's', x: 100, y: 100 });
    const first = resolveWallCollisions([s], dot).shapes[0];
    const second = resolveWallCollisions([s], dot).shapes[0];
    expect(first.x).toBeCloseTo(104); // 's' < 'w' -> +x axis
    expect(second.x).toBe(first.x);   // and it never varies
  });

  it('reflects off both segments of a corner approached from inside', () => {
    // An L: down the left edge, then right along the bottom. The shape sits
    // inside the pocket the corner forms (x > 100, y < 100) and drives
    // diagonally into the corner, so each segment gets a true perpendicular
    // contact in sequence rather than both clamping to the shared endpoint.
    const corner = buildWalls(
      [stroke({ id: 'w', points: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }] })],
      new Map(),
    );
    const s = shape({ x: 110, y: 90, vx: -40, vy: 40 });
    const { shapes } = resolveWallCollisions([s], corner);
    expect(shapes[0].vx).toBeGreaterThan(0); // bounced off the vertical segment
    expect(shapes[0].vy).toBeLessThan(0); // and off the horizontal one
  });
});

describe('clampIntoBounds', () => {
  it('returns the shape untouched when it is fully inside', () => {
    const s = shape({ x: 500, y: 500 });
    const result = clampIntoBounds(s, { width: 1000, height: 1000 });
    expect(result.clamped).toBe(false);
    expect(result.shape).toBe(s);
  });

  it('pulls a shape pushed past an edge back in and reports the clamp', () => {
    const s = shape({ x: -5, y: 500, vx: -40 });
    const result = clampIntoBounds(s, { width: 1000, height: 1000 });
    expect(result.clamped).toBe(true);
    expect(result.shape.x).toBe(20); // its own radius
    expect(result.shape.vx).toBe(-40); // velocity untouched: the wall owns it
  });

  it('does not invert when a shape is wider than the stage', () => {
    const s = shape({ x: 5, y: 5, size: 400 });
    const result = clampIntoBounds(s, { width: 100, height: 100 });
    expect(result.shape.x).toBe(200);
    expect(result.shape.y).toBe(200);
  });
});

describe('trackStuck', () => {
  const at = (x, y) => shape({ id: 's', x, y });

  it('reports nothing before a full window has elapsed', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), 0.1));
    const result = trackStuck(state, [at(0, 0)], new Set(['s']), 0.1);
    expect(result.stuck.size).toBe(0);
  });

  it('flags a shape that barely moved while touching a wall', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(
      state, [at(STUCK_DISPLACEMENT_PER_S / 2, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S,
    );
    expect(result.stuck.has('s')).toBe(true);
  });

  it('ignores a slow shape that never touched a wall', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(state, [at(1, 0)], new Set(), DEFAULT_STUCK_AFTER_S);
    expect(result.stuck.size).toBe(0);
  });

  it('ignores a shape that covered real ground inside a drawn pen', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    const result = trackStuck(state, [at(60, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S);
    expect(result.stuck.size).toBe(0);
  });

  it('scales the threshold to the window, so a short window flags less', () => {
    // At stuckAfterS = 0.5 the effective threshold is 4px, so a shape covering
    // 6px in that half-second is moving normally — a flat 8px threshold would
    // have false-flagged it and handed it wall immunity for nothing.
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), 0.5, 0.5));
    const result = trackStuck(
      state, [at(STUCK_DISPLACEMENT_PER_S * 0.75, 0)], new Set(['s']), 0.5, 0.5,
    );
    expect(result.stuck.size).toBe(0);
  });

  it('resets the window after reporting', () => {
    let state = createStuckState();
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    ({ state } = trackStuck(state, [at(0, 0)], new Set(['s']), DEFAULT_STUCK_AFTER_S));
    expect(state.elapsed).toBe(0);
    expect(state.contacted.size).toBe(0);
    expect(state.positions.get('s')).toEqual({ x: 0, y: 0 });
  });
});
