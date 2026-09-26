// Long-press gravity well force. Pure: one shape plus one well in, a new
// velocity out. No rng — nothing here is random, so the rng-threading
// convention in .claude/rules/doodle.md does not apply and no seq([...])
// expectation elsewhere shifts.
//
// Linear falloff, not inverse-square. Inverse-square needs an epsilon and a
// cap to dodge the singularity at the center, and leaves most shapes sitting
// in a weak far tail where nothing visible happens. Linear has a natural zero
// at the rim, no singularity, and reads correctly to a child: closer means
// faster, evenly.

export const DEFAULT_WELL_RADIUS = 200; // px
export const DEFAULT_WELL_STRENGTH = 600; // px/s^2 at the center
export const DEFAULT_WELL_MAX_SPEED = 400; // px/s
export const DEFAULT_WELL_HOLD_MS = 800; // ms of stillness before the well engages

// Inside this distance the direction toward the well is undefined, so the
// shape is left alone rather than divided by a near-zero magnitude. A
// gesture-level guard like MOVE_THRESHOLD, not a feel knob, so it stays out of
// the tuning panel.
export const MIN_WELL_DISTANCE = 1; // px

// Shapes have no damping anywhere in the sandbox — advanceShape's wall bounce
// flips a velocity's sign and keeps its magnitude exactly, and RESTITUTION
// only applies on shape-to-shape impact — so without maxSpeed every well
// would permanently raise the canvas's energy.
export function applyWell(
  shape,
  well,
  dtSeconds,
  radius = DEFAULT_WELL_RADIUS,
  strength = DEFAULT_WELL_STRENGTH,
  maxSpeed = DEFAULT_WELL_MAX_SPEED,
) {
  if (!well) return shape;
  const dx = well.x - shape.x;
  const dy = well.y - shape.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius || d < MIN_WELL_DISTANCE) return shape;
  const accel = strength * (1 - d / radius) * dtSeconds;
  let vx = shape.vx + (dx / d) * accel;
  let vy = shape.vy + (dy / d) * accel;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    vx = (vx / speed) * maxSpeed;
    vy = (vy / speed) * maxSpeed;
  }
  return { ...shape, vx, vy };
}
