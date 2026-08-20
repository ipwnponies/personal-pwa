import { generateId } from './random';

export const DEFAULT_MAX_PARTICLES = 150;

const BURST_COUNT = 8;
const BURST_SPEED = 120;
const BURST_MAX_AGE = 0.15;
// Collision bounces get a much longer-lived burst than a tap-pop, so a kid
// can actually see where two shapes hit. Friction below quickly bleeds off
// BURST_SPEED so the extra lifetime reads as "lingering and fading in place"
// rather than "flying off screen."
export const COLLISION_BURST_MAX_AGE = 1;
const BURST_FRICTION = 4; // exponential velocity decay rate (1/s), burst kind only

const SPIRAL_COUNT = 10;
const SPIRAL_SPEED = 200;
const SPIRAL_TANGENTIAL_SPEED = 60;
const SPIRAL_MAX_AGE = 0.2;

const SQUASH_COUNT = 5;
const SQUASH_SPEED = 60;
const SQUASH_MAX_AGE = 0.1;

const DUST_COUNT = 2;
const DUST_SPEED_FACTOR = 0.2;
export const DEFAULT_DUST_MAX_AGE = 0.3;

const particle = (kind, x, y, vx, vy, color, maxAge) => ({
  id: generateId(), kind, x, y, vx, vy, color, age: 0, maxAge,
});

// Short dashes radiating from (x, y). With a normal vector given, they're
// biased into a 120-degree cone around it (a bounce's "away from contact"
// direction); otherwise they spread in a full circle.
export function spawnBurst(x, y, color, normal = null, maxAge = BURST_MAX_AGE) {
  const baseAngle = normal ? Math.atan2(normal.y, normal.x) : 0;
  const spread = normal ? Math.PI / 1.5 : Math.PI * 2;
  return Array.from({ length: BURST_COUNT }, (_, i) => {
    const t = BURST_COUNT === 1 ? 0 : i / (BURST_COUNT - 1);
    const angle = normal
      ? baseAngle - spread / 2 + t * spread
      : (i / BURST_COUNT) * Math.PI * 2;
    return particle(
      'burst', x, y, Math.cos(angle) * BURST_SPEED, Math.sin(angle) * BURST_SPEED, color, maxAge,
    );
  });
}

// Particles start clustered near (fromX, fromY) and drift toward
// (toX, toY) with a tangential component added for a spiral look.
export function spawnSpiral(fromX, fromY, toX, toY, color) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const dirX = dx / dist;
  const dirY = dy / dist;
  const tangentX = -dirY;
  const tangentY = dirX;
  return Array.from({ length: SPIRAL_COUNT }, (_, i) => {
    const t = i / SPIRAL_COUNT;
    const startX = fromX + dx * t * 0.2;
    const startY = fromY + dy * t * 0.2;
    const tangentialSign = i % 2 === 0 ? 1 : -1;
    return particle(
      'spiral',
      startX,
      startY,
      dirX * SPIRAL_SPEED + tangentX * SPIRAL_TANGENTIAL_SPEED * tangentialSign,
      dirY * SPIRAL_SPEED + tangentY * SPIRAL_TANGENTIAL_SPEED * tangentialSign,
      color,
      SPIRAL_MAX_AGE,
    );
  });
}

// A quick, lighter radial pop for the single-tap squash reaction.
export function spawnSquashPoof(x, y, color) {
  return Array.from({ length: SQUASH_COUNT }, (_, i) => {
    const angle = (i / SQUASH_COUNT) * Math.PI * 2;
    return particle(
      'squash', x, y, Math.cos(angle) * SQUASH_SPEED, Math.sin(angle) * SQUASH_SPEED, color, SQUASH_MAX_AGE,
    );
  });
}

// Trails behind a moving shape: particles drift opposite the shape's
// velocity, fanned slightly so the trail has width.
export function spawnDust(x, y, vx, vy, color, maxAge = DEFAULT_DUST_MAX_AGE) {
  const speed = Math.hypot(vx, vy) * DUST_SPEED_FACTOR;
  const baseAngle = Math.atan2(vy, vx) + Math.PI;
  return [-0.3, 0.3].map((offset) => particle(
    'dust',
    x,
    y,
    Math.cos(baseAngle + offset) * speed,
    Math.sin(baseAngle + offset) * speed,
    color,
    maxAge,
  )).slice(0, DUST_COUNT);
}

// Advances every particle's position/age by dtSeconds, drops expired ones,
// and caps the result at maxParticles (oldest — earliest in the array —
// dropped first) so a burst of collisions can't runaway-allocate.
export function advanceParticles(particles, dtSeconds, maxParticles = DEFAULT_MAX_PARTICLES) {
  const next = particles
    .map((p) => {
      const decay = p.kind === 'burst' ? Math.exp(-BURST_FRICTION * dtSeconds) : 1;
      return {
        ...p,
        x: p.x + p.vx * dtSeconds,
        y: p.y + p.vy * dtSeconds,
        vx: p.vx * decay,
        vy: p.vy * decay,
        age: p.age + dtSeconds,
      };
    })
    .filter((p) => p.age < p.maxAge);
  return next.length > maxParticles ? next.slice(next.length - maxParticles) : next;
}
