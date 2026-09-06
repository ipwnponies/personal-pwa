import { describe, it, expect } from 'vitest';
import {
  CRUISE_SPEED_MIN,
  CRUISE_SPEED_MAX,
  TURN_RATE_RAD_PER_SEC,
  ACCEL_PX_PER_SEC2,
  SEEK_SPEED_MULTIPLIER,
  AFFINITY_SPEED_FLOOR,
  ARRIVE_RADIUS,
  createMovementState,
  stepMovement,
  wobbleOffset,
  WOBBLE_AMPLITUDE_FRAC,
  DETECTION_RADIUS,
  easeToward,
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

  it('seeks slower at low affinity than at high affinity, same distance', () => {
    // A single step can't show this: the acceleration cap
    // (ACCEL_PX_PER_SEC2 * dt) clips both to the same speed regardless of
    // affinity until enough steps pass to reach each one's own desired-speed
    // ceiling — same reason the existing 'seeks faster than cruise speed'
    // test loops 50 times instead of taking one step.
    const target = { x: 0.9, y: 0.5 };
    let lowAffinity = createMovementState(0.5, 0.5, () => 0.5);
    let highAffinity = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      const now = 1000 + i * 50;
      lowAffinity = stepMovement(lowAffinity, 0.05, now, 500, target, () => 0.5, 0);
      highAffinity = stepMovement(highAffinity, 0.05, now, 500, target, () => 0.5, 1);
    }
    expect(lowAffinity.speed).toBeLessThan(highAffinity.speed);
  });

  it('still seeks at the affinity floor speed, not a crawl, when affinity is 0', () => {
    let ms = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, { x: 0.9, y: 0.9 }, () => 0.5, 0);
    }
    // Verifies the actual converged speed against the formula, not just that
    // it happens to exceed cruiseSpeed (which only held because
    // AFFINITY_SPEED_FLOOR * SEEK_SPEED_MULTIPLIER > 1 — true today but not
    // guaranteed by that weaker assertion if the floor is ever recalibrated).
    expect(ms.speed).toBeCloseTo(ms.cruiseSpeed * SEEK_SPEED_MULTIPLIER * AFFINITY_SPEED_FLOOR, 5);
  });

  it('still eases down inside ARRIVE_RADIUS even at affinity 0 (arrival easing not bypassed)', () => {
    // Target sits well inside ARRIVE_RADIUS from the start, and heading is
    // pre-aligned toward it so the creature travels straight in, staying
    // inside ARRIVE_RADIUS the whole run rather than needing steps to turn.
    const target = { x: 0.5 + ARRIVE_RADIUS / 2, y: 0.5 };
    let ms = { ...createMovementState(0.5, 0.5, () => 0.5), heading: { x: 1, y: 0 } };
    for (let i = 0; i < 50; i += 1) {
      ms = stepMovement(ms, 0.05, 1000 + i * 50, 500, target, () => 0.5, 0);
    }
    const lowAffinitySeekCeiling = ms.cruiseSpeed * SEEK_SPEED_MULTIPLIER * AFFINITY_SPEED_FLOOR;
    expect(ms.speed).toBeLessThan(lowAffinitySeekCeiling);
  });

  it('defaults affinity to 1, matching pre-affinity full seek speed', () => {
    let withDefault = createMovementState(0.5, 0.5, () => 0.5);
    let explicit = createMovementState(0.5, 0.5, () => 0.5);
    for (let i = 0; i < 50; i += 1) {
      const now = 1000 + i * 50;
      withDefault = stepMovement(withDefault, 0.05, now, 500, { x: 0.9, y: 0.9 }, () => 0.5);
      explicit = stepMovement(explicit, 0.05, now, 500, { x: 0.9, y: 0.9 }, () => 0.5, 1);
    }
    expect(withDefault.speed).toBeCloseTo(explicit.speed, 10);
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

describe('easeToward', () => {
  it('moves partway to the target when the gap exceeds maxDelta', () => {
    expect(easeToward(0, 1, 0.3)).toBeCloseTo(0.3, 5);
  });

  it('snaps to the target when within maxDelta', () => {
    expect(easeToward(0.9, 1, 0.3)).toBe(1);
  });

  it('eases downward the same way it eases upward', () => {
    expect(easeToward(1, 0, 0.3)).toBeCloseTo(0.7, 5);
  });

  it('is a no-op when already at the target', () => {
    expect(easeToward(0.5, 0.5, 0.3)).toBe(0.5);
  });
});
