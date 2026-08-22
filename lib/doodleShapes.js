import { generateId, clamp } from './random';

export const SHAPE_TYPES = ['circle', 'square', 'triangle', 'star'];

export const COLORS = [
  '#e63946', '#f4a261', '#e9c46a', '#2a9d8f',
  '#457b9d', '#8e7dbe', '#f28482', '#43aa8b',
];

// C major pentatonic, one octave plus a partial second (Hz) — any combination
// sounds consonant.
export const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

export const MIN_SIZE = 28;
export const MAX_SIZE = 80;
// Below this, popping removes the shape without children. Kept equal to the
// spawn minimum so a freshly spawned shape always splits at least once (never
// vanishes on its first pop); only already-split children can get small enough
// to poof.
export const POP_MIN_SIZE = MIN_SIZE;
// Default ambient drift speed range (px/s). min === max reproduces the old
// fixed-speed behavior; the doodle tuning panel widens this range so each
// shape's speed is independently randomized instead of uniform. Keeping
// min === max as the default also matters for rng-call parity — see
// `driftSpeed` below.
export const DEFAULT_DRIFT_MIN = 18;
export const DEFAULT_DRIFT_MAX = 18;

// Cap on merged-shape size (2x the spawn maximum, at sizeMultiplier 1).
// Merge-eligible shapes at or above this combined size bounce instead of
// merging, so the kid — not an auto-pop — decides when a shape explodes (via
// the existing double-tap). resolveCollisions scales this cap by the
// shapes' own sizeMultiplier (tablet-spawned shapes are already up to 2x
// bigger, so the fixed base value would block nearly all their merges).
export const MAX_MERGE_SIZE = 160;

// Split children spawn near the parent's x,y, sharing its color and
// shapeType (both of which are merge-eligible — see resolveCollisions).
// Without immunity, the merge branch fires on the very next frame — before
// they've had time to drift apart — and silently recombines them, so a pop
// looks like nothing happened. This grace window exempts a freshly split
// shape from all collision handling (merge, bounce, position correction)
// until it's had a moment to disperse.
export const SPLIT_GRACE_S = 0.8;

const randRange = (min, max, rng) => min + (max - min) * rng();
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Skips the rng() draw entirely when min === max (the default, unwidened
// range) so createShape/splitShape consume exactly as many rng() calls as
// they did before drift-speed randomization existed. This keeps every
// existing deterministic-rng test's expected values unchanged unless the
// tuning panel has actually widened the range.
const driftSpeed = (min, max, rng) => (min === max ? min : randRange(min, max, rng));

export const pickColor = (rng = Math.random) => pick(COLORS, rng);

export function createShape(
  x,
  y,
  rng = Math.random,
  sizeMultiplier = 1,
  driftMin = DEFAULT_DRIFT_MIN,
  driftMax = DEFAULT_DRIFT_MAX,
) {
  const angle = rng() * Math.PI * 2;
  const speed = driftSpeed(driftMin, driftMax, rng);
  return {
    id: generateId(),
    kind: 'shape',
    shapeType: pick(SHAPE_TYPES, rng),
    x,
    y,
    color: pickColor(rng),
    rotation: rng() * 360,
    size: randRange(MIN_SIZE * sizeMultiplier, MAX_SIZE * sizeMultiplier, rng),
    note: pick(NOTES, rng),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    sizeMultiplier,
  };
}

export function splitShape(
  shape,
  rng = Math.random,
  driftMin = DEFAULT_DRIFT_MIN,
  driftMax = DEFAULT_DRIFT_MAX,
) {
  const sizeMultiplier = shape.sizeMultiplier || 1;
  if (shape.size < POP_MIN_SIZE * sizeMultiplier) return [];
  const childCount = 3 + Math.floor(rng() * 3); // 3..5
  const childSize = shape.size / 2;
  // The child's own full diameter as spawn padding: children start well
  // separated along their emission angle instead of dead-center on the
  // parent, so — combined with SPLIT_GRACE_S and their outward velocity —
  // they have a real chance to disperse before grace expires and stop
  // re-overlapping (and re-merging) the moment it does.
  const offset = childSize;
  const children = [];
  for (let i = 0; i < childCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const speed = driftSpeed(driftMin, driftMax, rng) * (1.5 + rng());
    children.push({
      id: generateId(),
      kind: 'shape',
      shapeType: shape.shapeType,
      x: shape.x + Math.cos(angle) * offset,
      y: shape.y + Math.sin(angle) * offset,
      color: shape.color,
      rotation: rng() * 360,
      size: childSize,
      note: shape.note,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      sizeMultiplier,
      splitGraceRemaining: SPLIT_GRACE_S,
    });
  }
  return children;
}

// Merges two overlapping shapes (see resolveCollisions for eligibility: same
// color or same shapeType). shapeType and color are each independently
// rolled from one parent or the other — a merge is a coin flip on both, not
// a deterministic "winner". rotation follows whichever parent donated
// shapeType, so the merged shape's rotation always matches a shape it could
// plausibly have been. Velocity is a plain (unweighted) average of the two
// parents' velocity — treated as equal mass for this blend specifically,
// unlike the mass-weighted collision-impulse physics in doodlePhysics.js.
// Position stays mass-weighted (biased toward the larger shape) and size
// stays the sqrt-sum-of-squares area-conserving formula — neither of those
// is a randomized attribute.
export function mergeShapes(a, b, rng = Math.random) {
  const massA = a.size ** 2;
  const massB = b.size ** 2;
  const totalMass = massA + massB;
  const size = Math.sqrt(a.size ** 2 + b.size ** 2);
  const larger = a.size >= b.size ? a : b;
  const shapeDonor = rng() < 0.5 ? a : b;
  const colorDonor = rng() < 0.5 ? a : b;
  // Bigger merged shapes sound lower: map size across [MIN_SIZE, MAX_MERGE_SIZE]
  // onto the NOTES scale in reverse (index 0 = lowest pitch = biggest shape).
  const normalized = clamp((size - MIN_SIZE) / (MAX_MERGE_SIZE - MIN_SIZE), 0, 1);
  const noteIndex = Math.round((1 - normalized) * (NOTES.length - 1));
  return {
    id: generateId(),
    kind: 'shape',
    shapeType: shapeDonor.shapeType,
    x: (a.x * massA + b.x * massB) / totalMass,
    y: (a.y * massA + b.y * massB) / totalMass,
    color: colorDonor.color,
    rotation: shapeDonor.rotation,
    size,
    note: NOTES[noteIndex],
    vx: (a.vx + b.vx) / 2,
    vy: (a.vy + b.vy) / 2,
    sizeMultiplier: larger.sizeMultiplier || 1,
  };
}

export function advanceShape(shape, dtSeconds, bounds) {
  const r = shape.size / 2;
  let { x, y, vx, vy } = shape;
  x += vx * dtSeconds;
  y += vy * dtSeconds;
  if (x - r < 0) {
    x = r;
    vx = Math.abs(vx);
  } else if (x + r > bounds.width) {
    x = bounds.width - r;
    vx = -Math.abs(vx);
  }
  if (y - r < 0) {
    y = r;
    vy = Math.abs(vy);
  } else if (y + r > bounds.height) {
    y = bounds.height - r;
    vy = -Math.abs(vy);
  }
  const next = {
    ...shape, x, y, vx, vy,
  };
  if (shape.splitGraceRemaining > 0) {
    const remaining = shape.splitGraceRemaining - dtSeconds;
    if (remaining > 0) next.splitGraceRemaining = remaining;
    else delete next.splitGraceRemaining;
  }
  return next;
}
