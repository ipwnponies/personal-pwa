import { describe, it, expect } from 'vitest';
import {
  createShape, splitShape, advanceShape, pickColor,
  SHAPE_TYPES, COLORS, NOTES, POP_MIN_SIZE,
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
});
