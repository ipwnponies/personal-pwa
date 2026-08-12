import { clamp } from '../random';

export const CRUISE_SPEED_MIN = 15;
export const CRUISE_SPEED_MAX = 45;
export const SEEK_SPEED_MULTIPLIER = 1.4;
export const TURN_RATE_RAD_PER_SEC = Math.PI / 2;
export const ACCEL_PX_PER_SEC2 = 60;
export const WOBBLE_AMPLITUDE_FRAC = 0.015;
export const WOBBLE_FREQUENCY_HZ = 0.5;
export const EDGE_MARGIN = 0.12;
export const BOUNDS_MIN = 0.06;
export const BOUNDS_MAX = 0.94;
export const WANDER_INTERVAL_MIN_MS = 2000;
export const WANDER_INTERVAL_MAX_MS = 4000;
export const DETECTION_RADIUS = 0.35;
export const CONTACT_RADIUS = 0.05;
// Arrival damping. At full seek speed the capped turn rate implies a minimum
// turning radius (speed / turn rate) that, on a narrow tank, exceeds
// CONTACT_RADIUS — a fish that passes abeam of its drop then orbits it forever
// without ever touching it. Easing the speed down inside ARRIVE_RADIUS shrinks
// that radius until the fish can always curl back onto the target.
export const ARRIVE_RADIUS = CONTACT_RADIUS * 4;
// Fraction of the turn-limited speed to approach at; below 1 leaves slack so
// the turning circle fits comfortably inside CONTACT_RADIUS.
export const ARRIVE_TURN_MARGIN = 0.6;
// Absolute floor as a fraction of cruise speed — a fish frozen in front of its
// food reads as broken, so arrival never damps all the way to a standstill.
export const ARRIVE_MIN_SPEED_FRAC = 0.25;

const TWO_PI = Math.PI * 2;

const randomUnitVector = (rng) => {
  const angle = rng() * TWO_PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

// Wraps an angle difference into (-PI, PI] so a turn never goes "the long way around".
const wrapAngle = (angle) => (((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI;

const turnToward = (current, desired, maxAngle) => {
  const currentAngle = Math.atan2(current.y, current.x);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const diff = clamp(wrapAngle(desiredAngle - currentAngle), -maxAngle, maxAngle);
  const angle = currentAngle + diff;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const easeToward = (current, target, maxDelta) => {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
};

// Linear ramp from full seek speed at ARRIVE_RADIUS down to a turn-limited
// approach speed by CONTACT_RADIUS. The approach speed is derived from the
// tank width so the turning circle stays inside CONTACT_RADIUS at any tank
// size, rather than from a fixed fraction that only holds for some widths.
const arriveSpeed = (seekSpeed, cruiseSpeed, dist, boundsWidth) => {
  if (dist >= ARRIVE_RADIUS) return seekSpeed;
  const turnLimited = TURN_RATE_RAD_PER_SEC * CONTACT_RADIUS * boundsWidth * ARRIVE_TURN_MARGIN;
  const floor = Math.min(seekSpeed, Math.max(turnLimited, cruiseSpeed * ARRIVE_MIN_SPEED_FRAC));
  const t = clamp((dist - CONTACT_RADIUS) / (ARRIVE_RADIUS - CONTACT_RADIUS), 0, 1);
  return floor + (seekSpeed - floor) * t;
};

const unitVectorTo = (fromX, fromY, toX, toY) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  // Already at the target point; an arbitrary direction avoids a NaN heading.
  if (len === 0) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
};

// Distance-to-edge on one axis: positive "dir" means steer toward increasing
// value (near the low edge), negative means steer toward decreasing value.
const edgeSteer = (pos) => {
  if (pos < EDGE_MARGIN) return { dir: 1, dist: pos };
  if (pos > 1 - EDGE_MARGIN) return { dir: -1, dist: 1 - pos };
  return { dir: 0, dist: EDGE_MARGIN };
};

const applyEdgeSteering = (x, y, desired) => {
  const ex = edgeSteer(x);
  const ey = edgeSteer(y);
  if (ex.dir === 0 && ey.dir === 0) return desired;
  const closestDist = Math.min(
    ex.dir !== 0 ? ex.dist : EDGE_MARGIN,
    ey.dir !== 0 ? ey.dist : EDGE_MARGIN,
  );
  const blend = clamp((EDGE_MARGIN - closestDist) / EDGE_MARGIN, 0, 1);
  const blendedX = desired.x * (1 - blend) + ex.dir * blend;
  const blendedY = desired.y * (1 - blend) + ey.dir * blend;
  const len = Math.hypot(blendedX, blendedY);
  if (len === 0) return desired;
  return { x: blendedX / len, y: blendedY / len };
};

export const createMovementState = (x, y, rng = Math.random) => ({
  x,
  y,
  heading: randomUnitVector(rng),
  speed: 0,
  cruiseSpeed: CRUISE_SPEED_MIN + rng() * (CRUISE_SPEED_MAX - CRUISE_SPEED_MIN),
  wobblePhase: rng() * TWO_PI,
  wanderTarget: null,
  wanderTargetExpiresAt: 0,
});

// target: { x, y } | null — a claimed drop's position, or null for idle wander.
export const stepMovement = (moveState, dt, now, boundsWidth, target, rng = Math.random) => {
  let { wanderTarget, wanderTargetExpiresAt } = moveState;
  let desiredPoint = target;
  let desiredSpeed = moveState.cruiseSpeed;

  if (!target) {
    if (!wanderTarget || now >= wanderTargetExpiresAt) {
      wanderTarget = {
        x: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
        y: BOUNDS_MIN + rng() * (BOUNDS_MAX - BOUNDS_MIN),
      };
      wanderTargetExpiresAt =
        now + WANDER_INTERVAL_MIN_MS + rng() * (WANDER_INTERVAL_MAX_MS - WANDER_INTERVAL_MIN_MS);
    }
    desiredPoint = wanderTarget;
  } else {
    const distToTarget = Math.hypot(target.x - moveState.x, target.y - moveState.y);
    desiredSpeed = arriveSpeed(
      moveState.cruiseSpeed * SEEK_SPEED_MULTIPLIER,
      moveState.cruiseSpeed,
      distToTarget,
      boundsWidth,
    );
  }

  const rawDesiredHeading = unitVectorTo(moveState.x, moveState.y, desiredPoint.x, desiredPoint.y);
  const desiredHeading = applyEdgeSteering(moveState.x, moveState.y, rawDesiredHeading);

  const heading = turnToward(moveState.heading, desiredHeading, TURN_RATE_RAD_PER_SEC * dt);
  const speed = easeToward(moveState.speed, desiredSpeed, ACCEL_PX_PER_SEC2 * dt);

  const stepFrac = (speed * dt) / boundsWidth;
  const x = clamp(moveState.x + heading.x * stepFrac, 0, 1);
  const y = clamp(moveState.y + heading.y * stepFrac, 0, 1);

  return {
    ...moveState,
    x,
    y,
    heading,
    speed,
    wanderTarget,
    wanderTargetExpiresAt,
  };
};
