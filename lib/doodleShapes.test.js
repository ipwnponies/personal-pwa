import { describe, it, expect } from 'vitest';
import {
  createShape, splitShape, advanceShape, pickColor, mergeShapes,
  SHAPE_TYPES, COLORS, NOTES, POP_MIN_SIZE, MAX_MERGE_SIZE, SPLIT_GRACE_S,
  DEFAULT_DRIFT_MIN, DEFAULT_DRIFT_MAX,
} from './doodleShapes';

// Deterministic rng: cycles through a fixed list of values in [0,1).
const seq = (values) => {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
};

describe('doodleShapes', () => {
  it('pickColor selects from COLORS by rng', () => {
    expect(pickColor(() => 0)).toBe(COLORS[0]);
  });

  it('createShape produces a shape with valid members and drift velocity', () => {
    const shape = createShape(10, 20, seq([0, 0, 0, 0, 0, 0]));
    expect(shape.kind).toBe('shape');
    expect(shape.x).toBe(10);
    expect(shape.y).toBe(20);
    expect(SHAPE_TYPES).toContain(shape.shapeType);
    expect(COLORS).toContain(shape.color);
    expect(NOTES).toContain(shape.note);
    expect(Number.isFinite(shape.vx)).toBe(true);
    expect(Number.isFinite(shape.vy)).toBe(true);
    expect(shape.id).toBeTruthy();
  });

  it('splitShape returns 3-5 smaller children above the min size', () => {
    const parent = createShape(0, 0, seq([0.5]));
    parent.size = 60;
    const children = splitShape(parent, seq([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(children.length).toBeGreaterThanOrEqual(3);
    expect(children.length).toBeLessThanOrEqual(5);
    children.forEach((c) => expect(c.size).toBeLessThan(parent.size));
  });

  it('splitShape grants children a collision grace period so they can disperse', () => {
    const parent = createShape(0, 0, seq([0.5]));
    parent.size = 60;
    const children = splitShape(parent, seq([0, 0, 0, 0, 0, 0, 0, 0]));
    children.forEach((c) => expect(c.splitGraceRemaining).toBe(SPLIT_GRACE_S));
  });

  it('splitShape pads children away from the parent center along their emission angle', () => {
    const parent = createShape(0, 0, seq([0.5]));
    parent.size = 60;
    const children = splitShape(parent, seq([0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75]));
    children.forEach((c) => {
      const dist = Math.hypot(c.x - parent.x, c.y - parent.y);
      expect(dist).toBeCloseTo(c.size / 2);
    });
  });

  it('createShape/splitShape draw exactly the same rng call count when driftMin === driftMax as the pre-randomization behavior (regression: no silent rng-shift)', () => {
    const rngA = seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const rngB = seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const withDefaultRange = createShape(0, 0, rngA);
    const withExplicitEqualRange = createShape(0, 0, rngB, 1, DEFAULT_DRIFT_MIN, DEFAULT_DRIFT_MAX);
    // Compare all fields except id, which is randomly generated
    const { id: idA, ...restA } = withDefaultRange;
    const { id: idB, ...restB } = withExplicitEqualRange;
    expect(restB).toEqual(restA);
  });

  it('createShape/splitShape randomize speed per-shape once driftMin/driftMax actually differ', () => {
    const a = createShape(0, 0, seq([0.1, 0.2, 0.5, 0.5, 0.5, 0.5]), 1, 10, 50);
    const b = createShape(0, 0, seq([0.1, 0.8, 0.5, 0.5, 0.5, 0.5]), 1, 10, 50);
    const speedA = Math.hypot(a.vx, a.vy);
    const speedB = Math.hypot(b.vx, b.vy);
    expect(speedA).not.toBeCloseTo(speedB);
  });

  it('splitShape returns no children below the min size', () => {
    const parent = createShape(0, 0, seq([0.5]));
    parent.size = POP_MIN_SIZE - 1;
    expect(splitShape(parent, seq([0]))).toEqual([]);
  });

  it('advanceShape moves a shape by its velocity', () => {
    const shape = { ...createShape(50, 50, seq([0.5])), vx: 10, vy: 0, size: 20 };
    const next = advanceShape(shape, 1, { width: 1000, height: 1000 });
    expect(next.x).toBeCloseTo(60);
    expect(next.y).toBeCloseTo(50);
  });

  it('advanceShape counts down splitGraceRemaining and clears it once expired', () => {
    const shape = {
      ...createShape(50, 50, seq([0.5])), vx: 0, vy: 0, size: 20, splitGraceRemaining: SPLIT_GRACE_S,
    };
    const midway = advanceShape(shape, SPLIT_GRACE_S / 2, { width: 1000, height: 1000 });
    expect(midway.splitGraceRemaining).toBeCloseTo(SPLIT_GRACE_S / 2);

    const expired = advanceShape(midway, SPLIT_GRACE_S, { width: 1000, height: 1000 });
    expect(expired.splitGraceRemaining).toBeUndefined();
  });

  it('advanceShape leaves shapes without a splitGraceRemaining untouched', () => {
    const shape = { ...createShape(50, 50, seq([0.5])), vx: 0, vy: 0, size: 20 };
    const next = advanceShape(shape, 1, { width: 1000, height: 1000 });
    expect(next.splitGraceRemaining).toBeUndefined();
  });

  it('advanceShape reflects velocity at the left edge', () => {
    const shape = { ...createShape(5, 50, seq([0.5])), vx: -10, vy: 0, size: 20 };
    const next = advanceShape(shape, 1, { width: 1000, height: 1000 });
    expect(next.vx).toBeGreaterThan(0); // bounced inward
    expect(next.x).toBeGreaterThanOrEqual(next.size / 2);
  });

  it('createShape scales its size range and stores sizeMultiplier', () => {
    const shape = createShape(0, 0, seq([0]), 2); // rng=0 -> size = MIN_SIZE * multiplier
    expect(shape.sizeMultiplier).toBe(2);
    expect(shape.size).toBe(28 * 2);
  });

  it('splitShape scales the pop-min-size check and forwards sizeMultiplier to children', () => {
    const parent = createShape(0, 0, seq([0.5]), 2); // MIN_SIZE*2 = 56
    parent.size = 56; // below POP_MIN_SIZE*2 = 56? equal, not below -> should split
    const children = splitShape(parent, seq([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(children.length).toBeGreaterThanOrEqual(3);
    children.forEach((c) => expect(c.sizeMultiplier).toBe(2));

    parent.size = 55; // below POP_MIN_SIZE*2 -> no split
    expect(splitShape(parent, seq([0]))).toEqual([]);
  });

  it('splitShape treats a shape with no stored sizeMultiplier as 1x (legacy persisted shapes)', () => {
    const parent = createShape(0, 0, seq([0.5]));
    delete parent.sizeMultiplier;
    parent.size = POP_MIN_SIZE - 1;
    expect(splitShape(parent, seq([0]))).toEqual([]);
    parent.size = 60;
    const children = splitShape(parent, seq([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(children.length).toBeGreaterThanOrEqual(3);
    children.forEach((c) => expect(c.sizeMultiplier).toBe(1));
  });

  it('mergeShapes conserves area, mass-weights position, and unweighted-averages velocity', () => {
    const a = {
      id: 'a', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
      rotation: 0, size: 30, note: NOTES[0], vx: 10, vy: 0,
    };
    const b = {
      id: 'b', kind: 'shape', shapeType: 'square', x: 40, y: 0, color: '#457b9d',
      rotation: 90, size: 40, note: NOTES[0], vx: 0, vy: 5,
    };
    const merged = mergeShapes(a, b);
    expect(merged.size).toBeCloseTo(Math.sqrt(30 ** 2 + 40 ** 2));
    // mass-weighted x: (0*900 + 40*1600) / 2500 = 25.6
    expect(merged.x).toBeCloseTo(25.6);
    // unweighted average velocity: (10+0)/2 = 5, (0+5)/2 = 2.5
    expect(merged.vx).toBeCloseTo(5);
    expect(merged.vy).toBeCloseTo(2.5);
    expect(merged.sizeMultiplier).toBe(1); // from the larger shape (b), default 1
    expect(merged.id).toBeTruthy();
    expect(merged.id).not.toBe(a.id);
    expect(merged.id).not.toBe(b.id);
  });

  it('mergeShapes picks shapeType and color independently via rng, and rotation follows the shapeType donor', () => {
    const a = {
      id: 'a', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
      rotation: 0, size: 30, note: NOTES[0], vx: 10, vy: 0,
    };
    const b = {
      id: 'b', kind: 'shape', shapeType: 'square', x: 40, y: 0, color: '#457b9d',
      rotation: 90, size: 40, note: NOTES[0], vx: 0, vy: 5,
    };
    // rng sequence: first call (< 0.5) picks shapeDonor=a, second call (>= 0.5) picks colorDonor=b.
    const merged = mergeShapes(a, b, seq([0.1, 0.9]));
    expect(merged.shapeType).toBe('circle'); // a donated shape
    expect(merged.rotation).toBe(0); // rotation follows the shape donor (a)
    expect(merged.color).toBe('#457b9d'); // b donated color

    // Flip both coin flips the other way.
    const mergedFlipped = mergeShapes(a, b, seq([0.9, 0.1]));
    expect(mergedFlipped.shapeType).toBe('square');
    expect(mergedFlipped.rotation).toBe(90);
    expect(mergedFlipped.color).toBe('#e63946');
  });

  it('mergeShapes defaults to Math.random when no rng is given', () => {
    const a = {
      id: 'a', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946', rotation: 0, size: 20, note: 0, vx: 0, vy: 0,
    };
    const b = {
      id: 'b', kind: 'shape', shapeType: 'square', x: 0, y: 0, color: '#457b9d', rotation: 0, size: 20, note: 0, vx: 0, vy: 0,
    };
    const merged = mergeShapes(a, b);
    expect(['circle', 'square']).toContain(merged.shapeType);
    expect(['#e63946', '#457b9d']).toContain(merged.color);
  });

  it('mergeShapes lowers the note as the merged size grows', () => {
    const small = mergeShapes(
      { id: 'a', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#fff', rotation: 0, size: 20, note: 0, vx: 0, vy: 0 },
      { id: 'b', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#fff', rotation: 0, size: 20, note: 0, vx: 0, vy: 0 },
    );
    const large = mergeShapes(
      { id: 'c', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#fff', rotation: 0, size: 100, note: 0, vx: 0, vy: 0 },
      { id: 'd', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#fff', rotation: 0, size: 100, note: 0, vx: 0, vy: 0 },
    );
    expect(large.note).toBeLessThan(small.note);
  });

  it('MAX_MERGE_SIZE is twice the spawn MAX_SIZE', () => {
    expect(MAX_MERGE_SIZE).toBe(160);
  });
});
