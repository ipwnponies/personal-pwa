import { describe, it, expect } from 'vitest';
import {
  applyWell,
  DEFAULT_WELL_MAX_SPEED,
  DEFAULT_WELL_RADIUS,
  DEFAULT_WELL_STRENGTH,
  MIN_WELL_DISTANCE,
} from './doodleWell';

const shapeAt = (x, y, vx = 0, vy = 0) => ({
  id: 's1', kind: 'shape', x, y, vx, vy, size: 28, color: '#f00',
});

describe('applyWell', () => {
  it('returns the same shape object when there is no well', () => {
    const shape = shapeAt(100, 100);
    expect(applyWell(shape, null, 0.016)).toBe(shape);
  });

  it('returns the same shape object for a shape beyond the radius', () => {
    const shape = shapeAt(400, 0);
    expect(applyWell(shape, { x: 0, y: 0 }, 0.5, 200, 600)).toBe(shape);
  });

  it('adds strength * (1 - d/radius) * dt at half radius', () => {
    // d = 100, radius 200 -> falloff 0.5. strength 600 * 0.5 * dt 0.5 = 150,
    // directed at the well, which sits on the -x side. Default maxSpeed 400
    // is above 150, so nothing clamps.
    const pulled = applyWell(shapeAt(100, 0), { x: 0, y: 0 }, 0.5, 200, 600);
    expect(pulled.vx).toBeCloseTo(-150, 6);
    expect(pulled.vy).toBeCloseTo(0, 6);
  });

  it('accelerates a shape near the center far harder than one near the rim', () => {
    const well = { x: 0, y: 0 };
    const near = applyWell(shapeAt(10, 0), well, 0.5, 200, 600);
    const rim = applyWell(shapeAt(199, 0), well, 0.5, 200, 600);
    expect(Math.abs(near.vx)).toBeGreaterThan(Math.abs(rim.vx) * 10);
    expect(Math.abs(rim.vx)).toBeLessThan(2); // falloff is 0.005 at the rim
  });

  it('points the acceleration at the well from every direction', () => {
    const well = { x: 500, y: 500 };
    const left = applyWell(shapeAt(400, 500), well, 0.1, 200, 600);
    const right = applyWell(shapeAt(600, 500), well, 0.1, 200, 600);
    const above = applyWell(shapeAt(500, 400), well, 0.1, 200, 600);
    const below = applyWell(shapeAt(500, 600), well, 0.1, 200, 600);
    expect(left.vx).toBeGreaterThan(0);
    expect(right.vx).toBeLessThan(0);
    expect(above.vy).toBeGreaterThan(0);
    expect(below.vy).toBeLessThan(0);
  });

  it('clamps the resulting speed to maxSpeed and keeps the direction', () => {
    // Shape at (60, 80) from a well at the origin: d = 100, radius 200 ->
    // falloff 0.5, strength 3000 * 0.5 * dt 1 = 1500 along (-0.6, -0.8), so
    // (-900, -1200) at speed 1500. Clamped to 100 that is exactly (-60, -80).
    const pulled = applyWell(shapeAt(60, 80), { x: 0, y: 0 }, 1, 200, 3000, 100);
    expect(Math.hypot(pulled.vx, pulled.vy)).toBeCloseTo(100, 6);
    expect(pulled.vx).toBeCloseTo(-60, 6);
    expect(pulled.vy).toBeCloseTo(-80, 6);
  });

  it('leaves a shape sitting exactly on the well point alone, with no NaN', () => {
    const shape = shapeAt(500, 500, 7, -3);
    const result = applyWell(shape, { x: 500, y: 500 }, 0.5, 200, 600);
    expect(result).toBe(shape);
    expect(Number.isNaN(result.vx)).toBe(false);
    expect(Number.isNaN(result.vy)).toBe(false);
  });

  it('leaves a shape inside MIN_WELL_DISTANCE alone', () => {
    const shape = shapeAt(500, 500 + MIN_WELL_DISTANCE / 2);
    expect(applyWell(shape, { x: 500, y: 500 }, 0.5, 200, 600)).toBe(shape);
  });

  it('is inert at radius 0 rather than dividing by zero', () => {
    const shape = shapeAt(100, 100);
    const result = applyWell(shape, { x: 0, y: 0 }, 0.5, 0, 600);
    expect(result).toBe(shape);
  });

  it('is inert at strength 0 while still returning finite velocities', () => {
    const pulled = applyWell(shapeAt(100, 0, 5, 5), { x: 0, y: 0 }, 0.5, 200, 0);
    expect(pulled.vx).toBeCloseTo(5, 6);
    expect(pulled.vy).toBeCloseTo(5, 6);
  });

  it('exposes the documented defaults', () => {
    expect(DEFAULT_WELL_RADIUS).toBe(200);
    expect(DEFAULT_WELL_STRENGTH).toBe(600);
    expect(DEFAULT_WELL_MAX_SPEED).toBe(400);
  });
});
