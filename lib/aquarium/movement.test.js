import { describe, it, expect } from 'vitest';
import {
  CRUISE_SPEED_MIN,
  CRUISE_SPEED_MAX,
  TURN_RATE_RAD_PER_SEC,
  ACCEL_PX_PER_SEC2,
  createMovementState,
  stepMovement,
  wobbleOffset,
  WOBBLE_AMPLITUDE_FRAC,
  DETECTION_RADIUS,
} from './movement';

describe('createMovementState', () => {
  it('assigns a cruise speed within the documented range', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    expect(ms.cruiseSpeed).toBeGreaterThanOrEqual(CRUISE_SPEED_MIN);
    expect(ms.cruiseSpeed).toBeLessThanOrEqual(CRUISE_SPEED_MAX);
  });

  it('starts with a unit-length heading', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.25);
    expect(Math.hypot(ms.heading.x, ms.heading.y)).toBeCloseTo(1, 5);
  });

  it('starts at the given position with zero speed', () => {
    const ms = createMovementState(0.2, 0.8, () => 0.5);
    expect(ms.x).toBe(0.2);
    expect(ms.y).toBe(0.8);
    expect(ms.speed).toBe(0);
  });
});

describe('stepMovement wander', () => {
  it('picks a wander target on the first step', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.016, 1000, 500, null, () => 0.5);
    expect(next.wanderTarget).not.toBeNull();
    expect(next.wanderTargetExpiresAt).toBeGreaterThan(1000);
  });

  it('keeps the same wander target until it expires', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const first = stepMovement(ms, 0.016, 1000, 500, null, () => 0.5);
    const second = stepMovement(first, 0.016, 1016, 500, null, () => 0.9);
    expect(second.wanderTarget).toEqual(first.wanderTarget);
  });

  it('re-picks a wander target once it expires', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.1);
    const first = stepMovement(ms, 0.016, 1000, 500, null, () => 0.1);
    const later = stepMovement(
      first,
      0.016,
      first.wanderTargetExpiresAt + 1,
      500,
      null,
      () => 0.9,
    );
    expect(later.wanderTarget).not.toEqual(first.wanderTarget);
  });

  it('never overshoots the turn-rate cap in one step', () => {
    // Heading starts pointing +x (angle 0); force a wander target that
    // requires a near-180-degree turn, then take a small dt step.
    const ms = { ...createMovementState(0.5, 0.5, () => 0), heading: { x: 1, y: 0 } };
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.999);
    const currentAngle = Math.atan2(ms.heading.x === 1 ? 0 : 0, 1); // 0
    const nextAngle = Math.atan2(next.heading.y, next.heading.x);
    const maxTurn = TURN_RATE_RAD_PER_SEC * 0.05;
    let diff = nextAngle - currentAngle;
    diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    expect(Math.abs(diff)).toBeLessThanOrEqual(maxTurn + 1e-9);
  });

  it('never exceeds the acceleration cap in one step', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.5);
    expect(next.speed).toBeLessThanOrEqual(ACCEL_PX_PER_SEC2 * 0.05 + 1e-9);
  });

  it('moves toward its wander target over several steps', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.99); // wander target near BOUNDS_MAX
    for (let i = 0; i < 200; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, null, () => 0.99);
    }
    expect(ms.x).toBeGreaterThan(0.5);
    expect(ms.y).toBeGreaterThan(0.5);
  });

  it('keeps position within [0, 1]', () => {
    let ms = { ...createMovementState(0.01, 0.01, () => 0), heading: { x: -1, y: -1 } };
    for (let i = 0; i < 500; i += 1) {
      ms = stepMovement(ms, 0.1, 1000 + i * 100, 500, null, () => 0);
    }
    expect(ms.x).toBeGreaterThanOrEqual(0);
    expect(ms.y).toBeGreaterThanOrEqual(0);
  });

  it('steers away from the edge when very close to it', () => {
    const ms = { ...createMovementState(0.02, 0.5, () => 0.5), heading: { x: -1, y: 0 } };
    const next = stepMovement(ms, 0.05, 1000, 500, null, () => 0.5);
    // Heading was pointing further into the edge (x: -1); after one step it
    // must have turned toward increasing x.
    expect(next.heading.x).toBeGreaterThan(ms.heading.x);
  });
});

describe('stepMovement seek', () => {
  it('overrides wander and heads toward the target instead', () => {
    const ms = { ...createMovementState(0.5, 0.5, () => 0.01), heading: { x: 0, y: -1 } };
    // Wander (no target) would have picked a target near (0.06, 0.06) given rng()=0.01.
    const target = { x: 0.9, y: 0.5 };
    const next = stepMovement(ms, 0.05, 1000, 500, target, () => 0.01);
    // Heading should have turned toward +x (toward the target), not stayed at -y.
    expect(next.heading.x).toBeGreaterThan(ms.heading.x);
  });

  it('does not touch wanderTarget while seeking', () => {
    const ms = createMovementState(0.5, 0.5, () => 0.5);
    const next = stepMovement(ms, 0.05, 1000, 500, { x: 0.9, y: 0.9 }, () => 0.5);
    expect(next.wanderTarget).toBeNull();
  });

  it('seeks faster than cruise speed', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, { x: 0.9, y: 0.9 }, () => 0.5);
    }
    expect(ms.speed).toBeGreaterThan(ms.cruiseSpeed);
  });
});

describe('DETECTION_RADIUS', () => {
  it('is a positive fraction of the tank', () => {
    expect(DETECTION_RADIUS).toBeGreaterThan(0);
    expect(DETECTION_RADIUS).toBeLessThan(1);
  });
});

describe('wobbleOffset', () => {
  it('is a pure function of its inputs', () => {
    const heading = { x: 1, y: 0 };
    const a = wobbleOffset(heading, 0.3, 1000);
    const b = wobbleOffset(heading, 0.3, 1000);
    expect(a).toEqual(b);
  });

  it('stays within the configured amplitude', () => {
    const heading = { x: 1, y: 0 };
    for (let t = 0; t < 5000; t += 137) {
      const offset = wobbleOffset(heading, 0.7, t);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(WOBBLE_AMPLITUDE_FRAC + 1e-9);
    }
  });

  it('is perpendicular to the heading', () => {
    const heading = { x: 1, y: 0 };
    const offset = wobbleOffset(heading, Math.PI / 2, 500);
    // Dot product of a perpendicular offset with the heading is ~0.
    expect(Math.abs(offset.x * heading.x + offset.y * heading.y)).toBeLessThan(1e-9);
  });
});
