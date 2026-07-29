import { generateId } from './random';

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
export const DRIFT_SPEED = 18; // units/second baseline drift

const randRange = (min, max, rng) => min + (max - min) * rng();
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export const pickColor = (rng = Math.random) => pick(COLORS, rng);

export function createShape(x, y, rng = Math.random) {
  const angle = rng() * Math.PI * 2;
  return {
    id: generateId(),
    kind: 'shape',
    shapeType: pick(SHAPE_TYPES, rng),
    x,
    y,
    color: pickColor(rng),
    rotation: rng() * 360,
    size: randRange(MIN_SIZE, MAX_SIZE, rng),
    note: pick(NOTES, rng),
    vx: Math.cos(angle) * DRIFT_SPEED,
    vy: Math.sin(angle) * DRIFT_SPEED,
  };
}

export function splitShape(shape, rng = Math.random) {
  if (shape.size < POP_MIN_SIZE) return [];
  const childCount = 3 + Math.floor(rng() * 3); // 3..5
  const childSize = shape.size / 2;
  const children = [];
  for (let i = 0; i < childCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    const speed = DRIFT_SPEED * (1.5 + rng());
    children.push({
      id: generateId(),
      kind: 'shape',
      shapeType: shape.shapeType,
      x: shape.x,
      y: shape.y,
      color: shape.color,
      rotation: rng() * 360,
      size: childSize,
      note: shape.note,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  return children;
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
  return { ...shape, x, y, vx, vy };
}
