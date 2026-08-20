import { describe, it, expect } from 'vitest';
import { resolveCollisions } from './doodlePhysics';
import { MAX_MERGE_SIZE } from './doodleShapes';

const shape = (overrides) => ({
  id: 'id', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
  rotation: 0, size: 40, note: 440, vx: 0, vy: 0, ...overrides,
});

describe('resolveCollisions', () => {
  it('leaves non-overlapping shapes untouched', () => {
    const a = shape({ id: 'a', x: 0, y: 0, size: 20 });
    const b = shape({ id: 'b', x: 500, y: 500, size: 20 });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toEqual([a, b]);
    expect(events).toEqual([]);
  });

  it('bounces overlapping shapes of different colors, conserving momentum', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: 10, vy: 0,
    });
    const b = shape({
      id: 'b', x: 10, y: 0, size: 20, color: '#457b9d', vx: -10, vy: 0,
    });
    const massA = a.size ** 2;
    const massB = b.size ** 2;
    const pxBefore = a.vx * massA + b.vx * massB;
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2);
    const na = shapes.find((s) => s.id === 'a');
    const nb = shapes.find((s) => s.id === 'b');
    // separated: no longer overlapping
    expect(Math.hypot(nb.x - na.x, nb.y - na.y)).toBeGreaterThanOrEqual(na.size / 2 + nb.size / 2 - 1e-6);
    // momentum conserved
    const pxAfter = na.vx * massA + nb.vx * massB;
    expect(pxAfter).toBeCloseTo(pxBefore, 5);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });

  it('merges overlapping shapes of the same color below the size cap', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946',
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: 20, color: '#e63946',
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].size).toBeCloseTo(Math.sqrt(20 ** 2 + 20 ** 2));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('merge');
    expect(events[0].color).toBe('#e63946');
    expect(Number.isFinite(events[0].note)).toBe(true);
  });

  it('bounces same-color shapes instead of merging once combined size exceeds the cap', () => {
    const big = MAX_MERGE_SIZE; // combined size = sqrt(big^2 + big^2) > MAX_MERGE_SIZE
    // Approaching velocities so a real impulse fires (a bounce event only
    // fires when velAlongNormal < 0 — see Fix 3).
    const a = shape({
      id: 'a', x: 0, y: 0, size: big, color: '#e63946', vx: 10, vy: 0,
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: big, color: '#e63946', vx: -10, vy: 0,
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2); // no merge
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });

  it('separates coincident shapes (zero-distance case)', () => {
    // Regression test: splitShape spawns children at parent's exact x,y.
    // Coincident shapes with different colors should bounce and separate.
    // Approaching velocities (along the deterministic fallback normal, +x
    // since 'a' < 'b') so a real impulse fires — a bounce event only fires
    // when velAlongNormal < 0 (see Fix 3).
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: 10, vy: 0,
    });
    const b = shape({
      id: 'b', x: 0, y: 0, size: 20, color: '#457b9d', vx: -10, vy: 0,
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2);
    const na = shapes.find((s) => s.id === 'a');
    const nb = shapes.find((s) => s.id === 'b');
    // shapes must be separated (no longer coincident)
    const dist = Math.hypot(nb.x - na.x, nb.y - na.y);
    const minDist = na.size / 2 + nb.size / 2;
    expect(dist).toBeGreaterThan(0);
    // Allow small tolerance for floating-point precision
    expect(dist).toBeGreaterThanOrEqual(minDist - 0.01);
    // velocities must be finite (not NaN)
    expect(Number.isFinite(na.vx)).toBe(true);
    expect(Number.isFinite(na.vy)).toBe(true);
    expect(Number.isFinite(nb.vx)).toBe(true);
    expect(Number.isFinite(nb.vy)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });

  it('does not fire a bounce event when two overlapping shapes have no closing velocity', () => {
    // Fix 3 regression: a bounce event (and its particle spawn) must only
    // fire when an actual impulse was applied, not on every frame two shapes
    // merely remain overlapping — e.g. a separating pair, or a pair pinned
    // together with nothing physically changing.
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: -10, vy: 0,
    });
    const b = shape({
      id: 'b', x: 10, y: 0, size: 20, color: '#457b9d', vx: 10, vy: 0,
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2); // still resolves the position overlap...
    expect(events).toEqual([]); // ...but no bounce event, since nothing physically bounced
  });

  it('does not merge or bounce coincident same-color shapes while split-graced', () => {
    // Bug regression: splitShape's children are same-color and spawn
    // coincident at the parent's exact x,y. Without immunity, the
    // same-color merge branch fired on the very next frame, instantly
    // recombining them — so a double-tap pop looked like nothing happened.
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: 10, vy: 0, splitGraceRemaining: 0.4,
    });
    const b = shape({
      id: 'b', x: 0, y: 0, size: 20, color: '#e63946', vx: -10, vy: 0, splitGraceRemaining: 0.4,
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2); // no merge
    expect(shapes).toEqual([a, b]); // untouched: no position correction, no impulse
    expect(events).toEqual([]); // no bounce/merge event either
  });

  it('resumes normal same-color merging once splitGraceRemaining has expired', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', splitGraceRemaining: 0,
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: 20, color: '#e63946',
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(1); // merges normally
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('merge');
  });

  it('treats a grabbed shape as infinite mass: it bounces others without merging or being displaced', () => {
    // Fix 2 regression: a shape excluded entirely from collision detection
    // produces zero physics feedback when dragged into another shape (no
    // bounce, no merge, no spark). Passing its id keeps it in detection while
    // preventing it from merging away or getting pushed.
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: 0, vy: 0,
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: 20, color: '#e63946', vx: -10, vy: 0, // same color, approaching a
    });
    const { shapes, events } = resolveCollisions([a, b], new Set(['a']));
    expect(shapes).toHaveLength(2); // never merges away, even though same color
    const na = shapes.find((s) => s.id === 'a');
    const nb = shapes.find((s) => s.id === 'b');
    expect(na.x).toBe(0); // grabbed shape never displaced by position correction
    expect(na.y).toBe(0);
    expect(na.vx).toBe(0); // grabbed shape never absorbs impulse
    expect(na.vy).toBe(0);
    expect(nb.vx).toBeGreaterThan(-10); // the other shape gets a normal bounce response
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });
});
