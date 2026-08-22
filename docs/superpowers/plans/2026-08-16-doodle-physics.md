# Doodle Physics + Particle Juice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shape-to-shape collision physics (bounce for different colors, merge for same colors) and particle-based visual feedback (spark bursts, merge spirals, squash poofs, movement dust trails) to the doodle sandbox, with zero new dependencies.

**Architecture:** Hand-rolled elastic circle-circle collision resolved once per `requestAnimationFrame` tick inside the existing drift loop. Collision math (`lib/doodlePhysics.js`) and particle math (`lib/doodleParticles.js`) are pure, dependency-free functions with no rng — every formula in this feature is deterministic (positions, sizes, and colors already vary from spawn-time randomness; the physics and particle effects layered on top don't need their own randomness). Particles live in a `useRef` array inside `DoodleCanvas`, never touch `localStorage`, and are advanced/rendered every frame without going through `useDoodleObjects`' persisted state.

**Tech Stack:** React 18 (hooks), plain JS (no TypeScript), SVG rendering, Vitest + React Testing Library, no new npm packages.

**Spec:** `docs/superpowers/specs/2026-08-16-doodle-physics-design.md`

## Global Constraints

- No new dependencies (no physics engine, no particle library) — pure hand-rolled JS only.
- JavaScript only, no `.ts`/`.tsx` files.
- Follow Airbnb ESLint conventions already used in this codebase (functional components, `prop-types`, no class components).
- Test files colocated next to source (`lib/x.js` → `lib/x.test.js`), never under `pages/`.
- `restitution = 0.9` for elastic bounces (from spec).
- `MAX_MERGE_SIZE = 160` (2× existing `MAX_SIZE` of 80, from spec).
- `MAX_PARTICLES = 150` live particles at any time, oldest dropped first (from spec).
- Particles must never be written to `localStorage` — only `objects` (shapes/strokes) persist, exactly as today.
- All new/changed collision and particle functions are pure (no `rng` parameter needed — see Task 1/2/3 notes) so they're trivially unit-testable.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/doodleShapes.js` (extend) | Add `mergeShapes(a, b)` and `MAX_MERGE_SIZE`. |
| `lib/doodlePhysics.js` (new) | `resolveCollisions(shapes)` — pairwise bounce/merge resolution, pure. |
| `lib/doodleParticles.js` (new) | Particle spawn/advance helpers, pure, operate on plain arrays. |
| `components/doodle/Particles.jsx` (new) | Renders a particle array as SVG `<line>`/`<circle>` elements. |
| `lib/useDoodleObjects.js` (extend) | `advance()` now also resolves collisions and returns `events`. |
| `components/doodle/DoodleCanvas.jsx` (extend) | Owns `particlesRef`, trail toggle, wires collision/tap/pop events to particle spawns + sound. |

---

### Task 1: `mergeShapes` + `MAX_MERGE_SIZE` in `doodleShapes.js`

**Files:**
- Modify: `lib/doodleShapes.js`
- Test: `lib/doodleShapes.test.js`

**Interfaces:**
- Consumes: `clamp` from `./random` (already exists: `export const clamp = (val, min, max) => Math.min(max, Math.max(min, val));`); `generateId` from `./random` (already imported in this file); `NOTES`, `MIN_SIZE` (already defined in this file).
- Produces: `mergeShapes(a, b) -> shape` and `MAX_MERGE_SIZE` (number `160`), both exported from `lib/doodleShapes.js`, for use by `lib/doodlePhysics.js` (Task 2).

Merge math: area-conserving size (`sqrt(a.size² + b.size²)`), mass-weighted (mass ∝ `size²`) position and velocity, `shapeType`/`rotation` from the larger parent, `color` kept (inputs share a color by construction — merges only happen between same-color shapes), `note` re-derived from the new size so bigger shapes sound lower.

- [ ] **Step 1: Write the failing tests**

Add to `lib/doodleShapes.test.js` (append inside the existing `describe('doodleShapes', ...)` block, alongside the existing `seq` helper already defined at the top of the file):

```js
  it('mergeShapes conserves area and combines mass-weighted velocity', () => {
    const a = {
      id: 'a', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
      rotation: 0, size: 30, note: NOTES[0], vx: 10, vy: 0,
    };
    const b = {
      id: 'b', kind: 'shape', shapeType: 'square', x: 40, y: 0, color: '#e63946',
      rotation: 90, size: 40, note: NOTES[0], vx: 0, vy: 5,
    };
    const merged = mergeShapes(a, b);
    expect(merged.size).toBeCloseTo(Math.sqrt(30 ** 2 + 40 ** 2));
    expect(merged.shapeType).toBe('square'); // b is larger
    expect(merged.rotation).toBe(90);
    expect(merged.color).toBe('#e63946');
    // mass-weighted x: (0*900 + 40*1600) / 2500 = 25.6
    expect(merged.x).toBeCloseTo(25.6);
    // mass-weighted vx: (10*900 + 0*1600) / 2500 = 3.6
    expect(merged.vx).toBeCloseTo(3.6);
    expect(merged.id).toBeTruthy();
    expect(merged.id).not.toBe(a.id);
    expect(merged.id).not.toBe(b.id);
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
    expect(large.note).toBeLessThanOrEqual(small.note);
  });

  it('MAX_MERGE_SIZE is twice the spawn MAX_SIZE', () => {
    expect(MAX_MERGE_SIZE).toBe(160);
  });
```

Update the import line at the top of `lib/doodleShapes.test.js` from:
```js
import {
  createShape, splitShape, advanceShape, pickColor,
  SHAPE_TYPES, COLORS, NOTES, POP_MIN_SIZE,
} from './doodleShapes';
```
to:
```js
import {
  createShape, splitShape, advanceShape, pickColor, mergeShapes,
  SHAPE_TYPES, COLORS, NOTES, POP_MIN_SIZE, MAX_MERGE_SIZE,
} from './doodleShapes';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: FAIL — `mergeShapes` and `MAX_MERGE_SIZE` are not exported.

- [ ] **Step 3: Implement `mergeShapes` and `MAX_MERGE_SIZE`**

In `lib/doodleShapes.js`, change the import line at the top from:
```js
import { generateId } from './random';
```
to:
```js
import { generateId, clamp } from './random';
```

Add after the existing `MIN_SIZE`/`MAX_SIZE`/`POP_MIN_SIZE`/`DRIFT_SPEED` constants (after line 21, `export const DRIFT_SPEED = 18;`):

```js
// Cap on merged-shape size (2x the spawn maximum). Same-color shapes at or
// above this combined size bounce instead of merging, so the kid — not an
// auto-pop — decides when a shape explodes (via the existing double-tap).
export const MAX_MERGE_SIZE = 160;
```

Add after `splitShape` (after the existing function, before `advanceShape`):

```js
export function mergeShapes(a, b) {
  const massA = a.size ** 2;
  const massB = b.size ** 2;
  const totalMass = massA + massB;
  const size = Math.sqrt(a.size ** 2 + b.size ** 2);
  const larger = a.size >= b.size ? a : b;
  // Bigger merged shapes sound lower: map size across [MIN_SIZE, MAX_MERGE_SIZE]
  // onto the NOTES scale in reverse (index 0 = lowest pitch = biggest shape).
  const normalized = clamp((size - MIN_SIZE) / (MAX_MERGE_SIZE - MIN_SIZE), 0, 1);
  const noteIndex = Math.round((1 - normalized) * (NOTES.length - 1));
  return {
    id: generateId(),
    kind: 'shape',
    shapeType: larger.shapeType,
    x: (a.x * massA + b.x * massB) / totalMass,
    y: (a.y * massA + b.y * massB) / totalMass,
    color: a.color,
    rotation: larger.rotation,
    size,
    note: NOTES[noteIndex],
    vx: (a.vx * massA + b.vx * massB) / totalMass,
    vy: (a.vy * massA + b.vy * massB) / totalMass,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add lib/doodleShapes.js lib/doodleShapes.test.js
git commit -m "feat: add mergeShapes for same-color shape merging"
```

---

### Task 2: `resolveCollisions` in `lib/doodlePhysics.js`

**Files:**
- Create: `lib/doodlePhysics.js`
- Test: `lib/doodlePhysics.test.js`

**Interfaces:**
- Consumes: `mergeShapes`, `MAX_MERGE_SIZE` from `./doodleShapes` (Task 1).
- Produces: `resolveCollisions(shapes) -> { shapes, events }` from `lib/doodlePhysics.js`, where `events` is an array of:
  - `{ type: 'bounce', x, y, color }` — contact midpoint and one collider's color.
  - `{ type: 'merge', x, y, fromX, fromY, color, note }` — `x,y` is the merged shape's new position, `fromX,fromY` is the smaller input shape's pre-merge position (for the spiral effect's start point), `color`/`note` are the merged shape's.

  Used by `lib/useDoodleObjects.js` (Task 5) and `components/doodle/DoodleCanvas.jsx` (Task 7).

Collision only fires between overlapping **shapes** (never strokes — callers must filter). Same-color pairs merge if the resulting size is at or below `MAX_MERGE_SIZE`, otherwise (and always for different-color pairs) they bounce elastically with `restitution = 0.9`, mass ∝ `size²`. A merged shape is consumed by the merge for the rest of that call (it does not also bounce off a third shape in the same frame — checked again next frame instead, an acceptable simplification for a toy without a physics engine).

- [ ] **Step 1: Write the failing tests**

Create `lib/doodlePhysics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveCollisions } from './doodlePhysics';
import { MAX_MERGE_SIZE } from './doodleShapes';

const shape = (overrides) => ({
  id: 'id', kind: 'shape', shapeType: 'circle', x: 0, y: 0, color: '#e63946',
  rotation: 0, size: 40, note: 440, vx: 0, vy: 0, ...overrides,
});

describe('resolveCollisions', () => {
  it('leaves non-overlapping shapes untouched', () => {
    const a = shape({ id: 'a', x: 0, y: 0, size: 20 });
    const b = shape({ id: 'b', x: 500, y: 500, size: 20 });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toEqual([a, b]);
    expect(events).toEqual([]);
  });

  it('bounces overlapping shapes of different colors, conserving momentum', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946', vx: 10, vy: 0,
    });
    const b = shape({
      id: 'b', x: 10, y: 0, size: 20, color: '#457b9d', vx: -10, vy: 0,
    });
    const massA = a.size ** 2;
    const massB = b.size ** 2;
    const pxBefore = a.vx * massA + b.vx * massB;
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2);
    const na = shapes.find((s) => s.id === 'a');
    const nb = shapes.find((s) => s.id === 'b');
    // separated: no longer overlapping
    expect(Math.hypot(nb.x - na.x, nb.y - na.y)).toBeGreaterThanOrEqual(na.size / 2 + nb.size / 2 - 1e-6);
    // momentum conserved
    const pxAfter = na.vx * massA + nb.vx * massB;
    expect(pxAfter).toBeCloseTo(pxBefore, 5);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });

  it('merges overlapping shapes of the same color below the size cap', () => {
    const a = shape({
      id: 'a', x: 0, y: 0, size: 20, color: '#e63946',
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: 20, color: '#e63946',
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].size).toBeCloseTo(Math.sqrt(20 ** 2 + 20 ** 2));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('merge');
    expect(events[0].color).toBe('#e63946');
    expect(Number.isFinite(events[0].note)).toBe(true);
  });

  it('bounces same-color shapes instead of merging once combined size exceeds the cap', () => {
    const big = MAX_MERGE_SIZE; // combined size = sqrt(big^2 + big^2) > MAX_MERGE_SIZE
    const a = shape({
      id: 'a', x: 0, y: 0, size: big, color: '#e63946',
    });
    const b = shape({
      id: 'b', x: 5, y: 0, size: big, color: '#e63946',
    });
    const { shapes, events } = resolveCollisions([a, b]);
    expect(shapes).toHaveLength(2); // no merge
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bounce');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/doodlePhysics.test.js`
Expected: FAIL — `lib/doodlePhysics.js` does not exist.

- [ ] **Step 3: Implement `resolveCollisions`**

Create `lib/doodlePhysics.js`:

```js
import { mergeShapes, MAX_MERGE_SIZE } from './doodleShapes';

const RESTITUTION = 0.9;

const massOf = (shape) => shape.size ** 2;

// Pairwise brute-force collision pass (shape counts are small — dozens at
// most — so N^2 is comfortably cheap). Same-color overlapping pairs merge
// (unless the merged size would exceed MAX_MERGE_SIZE); every other
// overlapping pair bounces elastically. A merged shape is consumed for the
// rest of this pass — it can't also collide with a third shape in the same
// frame; that's resolved next frame instead.
// eslint-disable-next-line import/prefer-default-export
export function resolveCollisions(shapes) {
  const working = shapes.map((s) => ({ ...s }));
  const removed = new Set();
  const merged = [];
  const events = [];

  for (let i = 0; i < working.length; i += 1) {
    const a = working[i];
    if (removed.has(a.id)) continue;

    for (let j = i + 1; j < working.length; j += 1) {
      const b = working[j];
      if (removed.has(b.id)) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = a.size / 2 + b.size / 2;
      if (dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      if (a.color === b.color) {
        const combinedSize = Math.sqrt(a.size ** 2 + b.size ** 2);
        if (combinedSize <= MAX_MERGE_SIZE) {
          const result = mergeShapes(a, b);
          const smaller = a.size <= b.size ? a : b;
          events.push({
            type: 'merge',
            x: result.x,
            y: result.y,
            fromX: smaller.x,
            fromY: smaller.y,
            color: result.color,
            note: result.note,
          });
          removed.add(a.id);
          removed.add(b.id);
          merged.push(result);
          break; // a is consumed for the rest of this pass
        }
      }

      const overlap = minDist - dist;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal < 0) {
        const invA = 1 / massOf(a);
        const invB = 1 / massOf(b);
        const impulse = (-(1 + RESTITUTION) * velAlongNormal) / (invA + invB);
        const ix = impulse * nx;
        const iy = impulse * ny;
        a.vx -= ix * invA;
        a.vy -= iy * invA;
        b.vx += ix * invB;
        b.vy += iy * invB;
      }
      events.push({
        type: 'bounce', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color: a.color,
      });
    }
  }

  return {
    shapes: working.filter((s) => !removed.has(s.id)).concat(merged),
    events,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/doodlePhysics.test.js`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/doodlePhysics.js lib/doodlePhysics.test.js
git commit -m "feat: add resolveCollisions for shape bounce/merge physics"
```

---

### Task 3: Particle helpers in `lib/doodleParticles.js`

**Files:**
- Create: `lib/doodleParticles.js`
- Test: `lib/doodleParticles.test.js`

**Interfaces:**
- Consumes: `generateId` from `./random`.
- Produces (all from `lib/doodleParticles.js`), for `components/doodle/Particles.jsx` (Task 4) and `components/doodle/DoodleCanvas.jsx` (Tasks 7–9):
  - `spawnBurst(x, y, color, normal = null) -> Particle[]` — 8 short-lived `kind: 'burst'` particles radiating from a point (spread into a cone around `normal` if given, else a full circle).
  - `spawnSpiral(fromX, fromY, toX, toY, color) -> Particle[]` — 10 `kind: 'spiral'` particles that travel from one point toward another with a tangential drift.
  - `spawnSquashPoof(x, y, color) -> Particle[]` — 5 `kind: 'squash'` particles, quick radial pop.
  - `spawnDust(x, y, vx, vy, color) -> Particle[]` — 2 `kind: 'dust'` particles trailing opposite the direction of motion.
  - `advanceParticles(particles, dtSeconds) -> Particle[]` — ages, moves, and expires particles; caps the array at `MAX_PARTICLES`, dropping the oldest first.
  - `MAX_PARTICLES` (number, `150`).
  - Particle shape: `{ id, kind: 'burst'|'spiral'|'squash'|'dust', x, y, vx, vy, color, age, maxAge }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/doodleParticles.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, spawnDust, advanceParticles, MAX_PARTICLES,
} from './doodleParticles';

describe('doodleParticles', () => {
  it('spawnBurst creates 8 particles at the given point', () => {
    const particles = spawnBurst(10, 20, '#e63946');
    expect(particles).toHaveLength(8);
    particles.forEach((p) => {
      expect(p.kind).toBe('burst');
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
      expect(p.color).toBe('#e63946');
      expect(p.age).toBe(0);
      expect(p.maxAge).toBeGreaterThan(0);
      expect(p.id).toBeTruthy();
    });
  });

  it('spawnSpiral creates 10 particles biased toward the target', () => {
    const particles = spawnSpiral(0, 0, 100, 0, '#457b9d');
    expect(particles).toHaveLength(10);
    particles.forEach((p) => {
      expect(p.kind).toBe('spiral');
      expect(p.color).toBe('#457b9d');
      expect(p.vx).toBeGreaterThan(0); // net drift toward the target (+x)
    });
  });

  it('spawnSquashPoof creates 5 small particles', () => {
    const particles = spawnSquashPoof(5, 5, '#f4a261');
    expect(particles).toHaveLength(5);
    particles.forEach((p) => expect(p.kind).toBe('squash'));
  });

  it('spawnDust creates 2 particles drifting opposite the motion vector', () => {
    const particles = spawnDust(0, 0, 10, 0, '#2a9d8f');
    expect(particles).toHaveLength(2);
    particles.forEach((p) => {
      expect(p.kind).toBe('dust');
      expect(p.vx).toBeLessThan(0); // drifts backward relative to +x motion
    });
  });

  it('advanceParticles moves particles and ages them', () => {
    const particles = [{
      id: '1', kind: 'dust', x: 0, y: 0, vx: 10, vy: 0, color: '#000', age: 0, maxAge: 1,
    }];
    const next = advanceParticles(particles, 0.5);
    expect(next).toHaveLength(1);
    expect(next[0].x).toBeCloseTo(5);
    expect(next[0].age).toBeCloseTo(0.5);
  });

  it('advanceParticles removes particles once they exceed maxAge', () => {
    const particles = [{
      id: '1', kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#000', age: 0.9, maxAge: 1,
    }];
    const next = advanceParticles(particles, 0.2);
    expect(next).toHaveLength(0);
  });

  it('advanceParticles caps the array at MAX_PARTICLES, dropping the oldest first', () => {
    const particles = Array.from({ length: MAX_PARTICLES + 10 }, (_, i) => ({
      id: `p${i}`, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#000', age: 0, maxAge: 10,
    }));
    const next = advanceParticles(particles, 0.01);
    expect(next).toHaveLength(MAX_PARTICLES);
    expect(next[0].id).toBe('p10'); // the first 10 (oldest) were dropped
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/doodleParticles.test.js`
Expected: FAIL — `lib/doodleParticles.js` does not exist.

- [ ] **Step 3: Implement particle helpers**

Create `lib/doodleParticles.js`:

```js
import { generateId } from './random';

export const MAX_PARTICLES = 150;

const BURST_COUNT = 8;
const BURST_SPEED = 120;
const BURST_MAX_AGE = 0.15;

const SPIRAL_COUNT = 10;
const SPIRAL_SPEED = 200;
const SPIRAL_TANGENTIAL_SPEED = 60;
const SPIRAL_MAX_AGE = 0.2;

const SQUASH_COUNT = 5;
const SQUASH_SPEED = 60;
const SQUASH_MAX_AGE = 0.1;

const DUST_COUNT = 2;
const DUST_SPEED_FACTOR = 0.2;
const DUST_MAX_AGE = 0.3;

const particle = (kind, x, y, vx, vy, color, maxAge) => ({
  id: generateId(), kind, x, y, vx, vy, color, age: 0, maxAge,
});

// Short dashes radiating from (x, y). With a normal vector given, they're
// biased into a 120-degree cone around it (a bounce's "away from contact"
// direction); otherwise they spread in a full circle.
export function spawnBurst(x, y, color, normal = null) {
  const baseAngle = normal ? Math.atan2(normal.y, normal.x) : 0;
  const spread = normal ? Math.PI / 1.5 : Math.PI * 2;
  return Array.from({ length: BURST_COUNT }, (_, i) => {
    const t = BURST_COUNT === 1 ? 0 : i / (BURST_COUNT - 1);
    const angle = normal
      ? baseAngle - spread / 2 + t * spread
      : (i / BURST_COUNT) * Math.PI * 2;
    return particle(
      'burst', x, y, Math.cos(angle) * BURST_SPEED, Math.sin(angle) * BURST_SPEED, color, BURST_MAX_AGE,
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
export function spawnDust(x, y, vx, vy, color) {
  const speed = Math.hypot(vx, vy) * DUST_SPEED_FACTOR;
  const baseAngle = Math.atan2(vy, vx) + Math.PI;
  return [-0.3, 0.3].map((offset) => particle(
    'dust',
    x,
    y,
    Math.cos(baseAngle + offset) * speed,
    Math.sin(baseAngle + offset) * speed,
    color,
    DUST_MAX_AGE,
  )).slice(0, DUST_COUNT);
}

// Advances every particle's position/age by dtSeconds, drops expired ones,
// and caps the result at MAX_PARTICLES (oldest — earliest in the array —
// dropped first) so a burst of collisions can't runaway-allocate.
export function advanceParticles(particles, dtSeconds) {
  const next = particles
    .map((p) => ({
      ...p, x: p.x + p.vx * dtSeconds, y: p.y + p.vy * dtSeconds, age: p.age + dtSeconds,
    }))
    .filter((p) => p.age < p.maxAge);
  return next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/doodleParticles.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/doodleParticles.js lib/doodleParticles.test.js
git commit -m "feat: add particle spawn/advance helpers for doodle juice"
```

---

### Task 4: `Particles` render component

**Files:**
- Create: `components/doodle/Particles.jsx`
- Test: `components/doodle/Particles.test.jsx`

**Interfaces:**
- Consumes: particle objects shaped `{ id, kind, x, y, vx, vy, color, age, maxAge }` (Task 3).
- Produces: `<Particles particles={Particle[]} />` from `components/doodle/Particles.jsx`, mounted inside the SVG stage by `DoodleCanvas.jsx` (Task 7). `burst` particles render as `<line>` elements; `spiral`/`squash`/`dust` render as `<circle cx cy>` elements (distinguishable in tests from `Shape`'s `<circle r>`, which carries no `cx`/`cy`).

- [ ] **Step 1: Write the failing test**

Create `components/doodle/Particles.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Particles from './Particles';

const wrap = (node) => render(<svg>{node}</svg>);

describe('Particles', () => {
  it('renders burst particles as lines', () => {
    const particles = [{
      id: 'a', kind: 'burst', x: 0, y: 0, vx: 10, vy: 0, color: '#e63946', age: 0, maxAge: 0.15,
    }];
    const { container } = wrap(<Particles particles={particles} />);
    expect(container.querySelectorAll('line')).toHaveLength(1);
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(0);
  });

  it('renders dust/spiral/squash particles as circles with cx/cy', () => {
    const particles = [
      {
        id: 'a', kind: 'dust', x: 1, y: 2, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.3,
      },
      {
        id: 'b', kind: 'spiral', x: 3, y: 4, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.2,
      },
      {
        id: 'c', kind: 'squash', x: 5, y: 6, vx: 0, vy: 0, color: '#e63946', age: 0, maxAge: 0.1,
      },
    ];
    const { container } = wrap(<Particles particles={particles} />);
    expect(container.querySelectorAll('circle[cx]')).toHaveLength(3);
    expect(container.querySelectorAll('line')).toHaveLength(0);
  });

  it('fades particles out as they age', () => {
    const particles = [{
      id: 'a', kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, color: '#e63946', age: 0.15, maxAge: 0.3,
    }];
    const { container } = wrap(<Particles particles={particles} />);
    const circle = container.querySelector('circle[cx]');
    expect(Number(circle.getAttribute('opacity'))).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/Particles.test.jsx`
Expected: FAIL — `components/doodle/Particles.jsx` does not exist.

- [ ] **Step 3: Implement `Particles`**

Create `components/doodle/Particles.jsx`:

```jsx
import React from 'react';
import PropTypes from 'prop-types';

const LINE_LENGTH = 10;
const DOT_RADIUS = 3;

export default function Particles({ particles }) {
  return (
    <>
      {particles.map((p) => {
        const opacity = Math.max(0, 1 - p.age / p.maxAge);
        if (p.kind === 'burst') {
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const x2 = p.x + (p.vx / speed) * LINE_LENGTH;
          const y2 = p.y + (p.vy / speed) * LINE_LENGTH;
          return (
            <line
              key={p.id}
              x1={p.x}
              y1={p.y}
              x2={x2}
              y2={y2}
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        }
        return (
          <circle key={p.id} cx={p.x} cy={p.y} r={DOT_RADIUS} fill={p.color} opacity={opacity} />
        );
      })}
    </>
  );
}

Particles.propTypes = {
  particles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['burst', 'spiral', 'squash', 'dust']).isRequired,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    vx: PropTypes.number.isRequired,
    vy: PropTypes.number.isRequired,
    color: PropTypes.string.isRequired,
    age: PropTypes.number.isRequired,
    maxAge: PropTypes.number.isRequired,
  })).isRequired,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/doodle/Particles.test.jsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/doodle/Particles.jsx components/doodle/Particles.test.jsx
git commit -m "feat: add Particles SVG render component"
```

---

### Task 5: `useDoodleObjects.advance` resolves collisions and returns events

**Files:**
- Modify: `lib/useDoodleObjects.js`
- Test: `lib/useDoodleObjects.test.jsx`

**Interfaces:**
- Consumes: `resolveCollisions` from `./doodlePhysics` (Task 2).
- Produces: `advance(dtSeconds, bounds, grabbedId) -> events` — same name/signature as today, now returns the `events` array from `resolveCollisions` (previously returned nothing) — for `components/doodle/DoodleCanvas.jsx` (Task 7).

Shape/stroke interleave order (z-order) must be preserved for every shape that survives unmerged — only newly-merged shapes are appended at the end (they don't have a single original slot to keep, and rendering the freshly-combined shape on top reads fine).

- [ ] **Step 1: Write the failing test**

Add to `lib/useDoodleObjects.test.jsx`, inside the existing `describe('useDoodleObjects', ...)` block (after the existing `'advance moves non-grabbed shapes...'` test):

```js
  it('advance resolves collisions between overlapping shapes and returns events', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.5])));
    let a;
    let b;
    act(() => { a = result.current.spawnShape(100, 100); });
    act(() => { b = result.current.spawnShape(105, 100); }); // overlapping, same rng -> same color
    // dt=0 makes the drift step a no-op, isolating collision resolution from drift.
    let events;
    act(() => { events = result.current.advance(0, { width: 1000, height: 1000 }, null); });
    expect(events.length).toBeGreaterThan(0);
    // same color (both spawned with the same rng sequence) -> merge -> one fewer shape
    const ids = [a.id, b.id];
    const survivingOriginals = result.current.objects.filter((o) => ids.includes(o.id));
    expect(survivingOriginals.length).toBeLessThan(2);
  });

  it('advance preserves stroke/shape interleave order for untouched objects', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(0, 0); });
    let strokeId;
    act(() => { strokeId = result.current.startStroke(500, 500); });
    act(() => result.current.advance(0.01, { width: 1000, height: 1000 }, null));
    const order = result.current.objects.map((o) => o.id);
    expect(order).toEqual([shape.id, strokeId]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: FAIL — `advance` returns `undefined`, no collision resolution happens yet.

- [ ] **Step 3: Implement collision resolution in `advance`**

In `lib/useDoodleObjects.js`, change the import line at the top from:
```js
import { advanceShape, createShape, pickColor, splitShape } from './doodleShapes';
```
to:
```js
import { advanceShape, createShape, pickColor, splitShape } from './doodleShapes';
import { resolveCollisions } from './doodlePhysics';
```

Replace the existing `advance` implementation:
```js
  const advance = useCallback((dtSeconds, bounds, grabbedId) => {
    setObjects((prev) => prev.map((o) => (
      o.kind === 'shape' && o.id !== grabbedId
        ? advanceShape(o, dtSeconds, bounds)
        : o
    )));
  }, []);
```
with:
```js
  const advance = useCallback((dtSeconds, bounds, grabbedId) => {
    let events = [];
    setObjects((prev) => {
      const drifted = prev.map((o) => (
        o.kind === 'shape' && o.id !== grabbedId
          ? advanceShape(o, dtSeconds, bounds)
          : o
      ));
      const shapesOnly = drifted.filter((o) => o.kind === 'shape');
      const resolved = resolveCollisions(shapesOnly);
      events = resolved.events;
      // Preserve original interleave order for everything that survived
      // untouched or merely bounced; genuinely new merged shapes (fresh ids)
      // are appended at the end since they no longer have a single slot.
      const byId = new Map(resolved.shapes.map((s) => [s.id, s]));
      const survivors = drifted
        .filter((o) => o.kind !== 'shape' || byId.has(o.id))
        .map((o) => (o.kind === 'shape' ? byId.get(o.id) : o));
      const survivorIds = new Set(survivors.map((o) => o.id));
      const mergedOnly = resolved.shapes.filter((s) => !survivorIds.has(s.id));
      return [...survivors, ...mergedOnly];
    });
    return events;
  }, []);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx
git commit -m "feat: resolve shape collisions in the drift advance step"
```

---

### Task 6: Trail toggle button

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Produces: `trailsEnabled` React state in `DoodleCanvas`, persisted to `localStorage` under `doodle-trails` (mirrors the existing `doodle-muted` pattern), default `true`. A new toolbar button toggles it. Consumed by Task 9 (dust trail spawning).

- [ ] **Step 1: Write the failing test**

Add to `components/doodle/DoodleCanvas.test.jsx`, after the existing `'mute button toggles its label...'` test:

```jsx
  it('trails toggle button flips its label and persists the preference', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Disable trails'));
    expect(getByLabelText('Enable trails')).toBeTruthy();
    expect(localStorage.getItem('doodle-trails')).toBe('false');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — no element with label "Disable trails".

- [ ] **Step 3: Add `trailsEnabled` state and toolbar button**

In `components/doodle/DoodleCanvas.jsx`, change:
```js
const MUTE_KEY = 'doodle-muted';
```
to:
```js
const MUTE_KEY = 'doodle-muted';
const TRAILS_KEY = 'doodle-trails';
```

Change:
```js
  const [pulsingId, setPulsingId] = useState(null);
  const [muted, setMuted] = useState(false);
```
to:
```js
  const [pulsingId, setPulsingId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [trailsEnabled, setTrailsEnabled] = useState(true);
```

After the existing mute-persistence effects (after the `useEffect` that calls `soundRef.current.setMuted(muted)` and writes `MUTE_KEY`), add:
```js
  // Load + persist the trail preference (default on; a parent/kid can turn
  // it off if it costs too much on a lower-end device).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TRAILS_KEY);
      if (stored !== null) setTrailsEnabled(stored === 'true');
    } catch {
      // ignore — default to enabled
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TRAILS_KEY, String(trailsEnabled));
    } catch {
      // ignore — preference just won't persist
    }
  }, [trailsEnabled]);
```

In the toolbar `<div className={styles.toolbar}>`, after the existing mute `<button>` and before the closing `</div>`, add:
```jsx
        <button
          type="button"
          className={styles.toolButton}
          aria-label={trailsEnabled ? 'Disable trails' : 'Enable trails'}
          onClick={() => setTrailsEnabled((t) => !t)}
        >
          {trailsEnabled ? '💨' : '🚫'}
        </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: add dust trail toggle button"
```

---

### Task 7: Wire collision events to particles + merge chime

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `spawnBurst`, `spawnSpiral`, `advanceParticles` from `../../lib/doodleParticles` (Task 3); `Particles` from `./Particles` (Task 4); `advance(...) -> events` from `useDoodleObjects` (Task 5).
- Produces: `particlesRef` (a `useRef([])` holding the live particle array) inside `DoodleCanvas`, mutated once per animation frame before shape state commits — the scaffold Tasks 8 and 9 build on.

Ordering within a single `tick()` call matters: all particle-array mutations must happen synchronously before the function returns, so that when React commits the re-render triggered by `advance`'s `setObjects` call, `particlesRef.current` already reflects this frame's particles (no separate particle state/re-render trigger needed).

- [ ] **Step 1: Write the failing tests**

Add to `components/doodle/DoodleCanvas.test.jsx`, after the existing `'runs a drift loop that moves shapes over time'` test. These reuse that test's pattern of manually driving `requestAnimationFrame` with a controlled clock and a real stage rect, but also craft the `rng` sequence so two shapes spawn overlapping (10px apart, sizes computed as `MIN_SIZE` from an `rng` of `0` — see `createShape` in `lib/doodleShapes.js`: the 6 rng draws per shape are `[angle, shapeType, color, rotation, size, note]`).

```jsx
  const driveOneFrame = () => {
    const cbs = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { cbs.push(cb); return cbs.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const rect = {
      width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
    };
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    return { cbs, rectSpy, nowSpy };
  };

  it('bouncing different-color shapes spawns a spark burst and keeps both shapes', () => {
    const sound = mockSound();
    // Two spawns, 6 rng draws each: [angle, shapeType, color, rotation, size, note].
    // Color draw 0 -> COLORS[0]; color draw 0.2 -> COLORS[1] (different).
    const rng = seq([0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);

    act(() => { cbs[cbs.length - 1](16); });

    expect(shapeGroups(container)).toHaveLength(2); // no merge
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0); // spark burst

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('merging same-color shapes spawns spiral particles, plays a chime, and reduces shape count', () => {
    const sound = mockSound();
    // Both spawns use color draw 0 -> COLORS[0] for both -> same color.
    const rng = seq([0, 0, 0, 0, 0, 0]);
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={rng} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    expect(shapeGroups(container)).toHaveLength(2);
    sound.playNote.mockClear();

    act(() => { cbs[cbs.length - 1](16); });

    expect(shapeGroups(container)).toHaveLength(1); // merged
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0); // spiral particles
    expect(sound.playNote).toHaveBeenCalledTimes(1); // merge chime

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('never persists particles to localStorage, only shapes and strokes', () => {
    vi.useFakeTimers();
    const rng = seq([0, 0, 0, 0, 0, 0]); // both spawns same color -> triggers a merge + particles
    const { cbs, rectSpy } = driveOneFrame();
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = render(<DoodleCanvas rng={rng} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerDown(svg, { clientX: 210, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 210, clientY: 200, pointerId: 2 });

    act(() => { cbs[cbs.length - 1](16); });
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0); // particles did spawn
    act(() => { vi.advanceTimersByTime(1000); }); // flush the persistence interval

    const saved = JSON.parse(localStorage.getItem('doodle-objects'));
    expect(saved.length).toBeGreaterThan(0);
    saved.forEach((o) => expect(['shape', 'stroke']).toContain(o.kind));

    nowSpy.mockRestore();
    rectSpy.mockRestore();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — no particles are spawned yet, `advance`'s returned events are ignored. (The localStorage-isolation test passes even before this task's implementation, since particles never touched persisted state to begin with — it's included here as a regression guard for what Task 7 introduces.)

- [ ] **Step 3: Wire particle spawning into the drift loop**

In `components/doodle/DoodleCanvas.jsx`, change the import block:
```js
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import Shape from './Shape';
import Stroke from './Stroke';
```
to:
```js
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import { spawnBurst, spawnSpiral, advanceParticles } from '../../lib/doodleParticles';
import Shape from './Shape';
import Stroke from './Stroke';
import Particles from './Particles';
```

After the existing `const pulseTimer = useRef(null);` line, add:
```js
  const particlesRef = useRef([]);
```

Replace the drift-loop `useEffect` (the one starting `useEffect(() => { let raf; ... }, [advance]);`):
```js
  useEffect(() => {
    let raf;
    let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        const grabbed = pointerRef.current?.mode === 'drag' ? pointerRef.current.id : null;
        advance(dt, { width: rect.width, height: rect.height }, grabbed);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance]);
```
with:
```js
  useEffect(() => {
    let raf;
    let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      particlesRef.current = advanceParticles(particlesRef.current, dt);
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        const grabbed = pointerRef.current?.mode === 'drag' ? pointerRef.current.id : null;
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbed);
        events.forEach((event) => {
          if (event.type === 'bounce') {
            particlesRef.current = [...particlesRef.current, ...spawnBurst(event.x, event.y, event.color)];
          } else if (event.type === 'merge') {
            particlesRef.current = [
              ...particlesRef.current,
              ...spawnSpiral(event.fromX, event.fromY, event.x, event.y, event.color),
            ];
            soundRef.current.playNote(event.note);
          }
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance]);
```

In the render, inside the `<svg ...>` element, after the existing `{objects.map((o) => ...)}` block and before the closing `</svg>`, add:
```jsx
        <Particles particles={particlesRef.current} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: spawn collision particles and play merge chime"
```

---

### Task 8: Squash poof on tap + spark burst on pop

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `spawnSquashPoof`, `spawnBurst` from `../../lib/doodleParticles` (Task 3); `particlesRef` scaffold from Task 7.

- [ ] **Step 1: Write the failing tests**

Add to `components/doodle/DoodleCanvas.test.jsx`, after the existing `'double tap on a shape pops it'` test:

```jsx
  it('single tap on a shape spawns a squash poof', () => {
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0);
  });

  it('double tap pop spawns a spark burst in addition to child scatter', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.99])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const g = container.querySelector('svg > g[data-id]');
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 3 });
    expect(sound.playPop).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — no particles spawn on tap or pop yet.

- [ ] **Step 3: Wire squash/pop particle spawns**

In `components/doodle/DoodleCanvas.jsx`, change the import line from:
```js
import { spawnBurst, spawnSpiral, advanceParticles } from '../../lib/doodleParticles';
```
to:
```js
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, advanceParticles,
} from '../../lib/doodleParticles';
```

Replace `handleShapeTap`:
```js
  const handleShapeTap = (id) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === id && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      popShape(id);
      soundRef.current.playPop();
      return;
    }
    lastTapRef.current = { id, time: now };
    triggerPulse(id);
    const shape = objectsRef.current.find((o) => o.id === id);
    if (shape) soundRef.current.playNote(shape.note);
  };
```
with:
```js
  const handleShapeTap = (id) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const shape = objectsRef.current.find((o) => o.id === id);
    if (last && last.id === id && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      popShape(id);
      soundRef.current.playPop();
      if (shape) {
        particlesRef.current = [...particlesRef.current, ...spawnBurst(shape.x, shape.y, shape.color)];
      }
      return;
    }
    lastTapRef.current = { id, time: now };
    triggerPulse(id);
    if (shape) {
      soundRef.current.playNote(shape.note);
      particlesRef.current = [
        ...particlesRef.current, ...spawnSquashPoof(shape.x, shape.y, shape.color),
      ];
    }
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: add squash poof and pop burst particles"
```

---

### Task 9: Dust trail on movement

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `spawnDust` from `../../lib/doodleParticles` (Task 3); `particlesRef` scaffold (Task 7); `trailsEnabled` state (Task 6).

The drift-loop `useEffect`'s dependency array is `[advance]`, so it does not re-run when `trailsEnabled` changes — reading `trailsEnabled` directly inside `tick()` would close over a stale value. Mirror the existing `objectsRef` pattern: mirror `trailsEnabled` into a ref on every render, and read the ref inside `tick()`.

- [ ] **Step 1: Write the failing test**

Add to `components/doodle/DoodleCanvas.test.jsx`, after the two Task 7 tests:

```jsx
  it('moving shapes spawn a dust trail while trails are enabled', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('circle[cx]').length).toBeGreaterThan(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });

  it('disabling trails stops new dust particles from spawning', () => {
    const { cbs, rectSpy, nowSpy } = driveOneFrame();
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Disable trails'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });

    act(() => { cbs[cbs.length - 1](16); });

    expect(container.querySelectorAll('circle[cx]').length).toBe(0);

    nowSpy.mockRestore();
    rectSpy.mockRestore();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: FAIL — no dust particles spawn from movement yet.

- [ ] **Step 3: Wire dust trail spawning**

In `components/doodle/DoodleCanvas.jsx`, change the import line from:
```js
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, advanceParticles,
} from '../../lib/doodleParticles';
```
to:
```js
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, spawnDust, advanceParticles,
} from '../../lib/doodleParticles';
```

Add near the other top-of-file constants (alongside `MOVE_THRESHOLD`, `DOUBLE_TAP_MS`, etc.):
```js
const DUST_VELOCITY_THRESHOLD = 5; // px/s below which a shape is considered stationary
```

After the existing `const objectsRef = useRef(objects); objectsRef.current = objects;` mirror, add a matching mirror for the toggle:
```js
  const trailsEnabledRef = useRef(trailsEnabled);
  trailsEnabledRef.current = trailsEnabled;
```

In the `tick` function (inside the drift-loop `useEffect` from Task 7), after the `if (rect && rect.width && rect.height) { ... }` block's `const grabbed = ...` line and before the `const events = advance(...)` call, add the dust-spawn pass:
```js
        const grabbed = pointerRef.current?.mode === 'drag' ? pointerRef.current.id : null;
        if (trailsEnabledRef.current) {
          objectsRef.current.forEach((o) => {
            if (o.kind !== 'shape' || o.id === grabbed) return;
            const speed = Math.hypot(o.vx, o.vy);
            if (speed > DUST_VELOCITY_THRESHOLD) {
              particlesRef.current = [
                ...particlesRef.current, ...spawnDust(o.x, o.y, o.vx, o.vy, o.color),
              ];
            }
          });
        }
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbed);
```
(this replaces the single existing `const grabbed = ...` / `const events = advance(...)` pair with the three lines above — the `grabbed` declaration itself is unchanged, only the dust-spawn block is inserted between it and the `advance` call).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in the repo, including all doodle files touched by this plan.

- [ ] **Step 6: Commit**

```bash
git add components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "feat: add movement dust trail gated on the trails toggle"
```

---

## Manual verification (after Task 9)

Automated tests cover logic and event wiring; the feel of floaty collisions and particle timing is worth a quick manual pass:

```bash
npm run dev
```

Open `/doodle/`, then:
1. Tap empty space twice near each other to spawn two shapes close together — confirm they visibly bounce or merge depending on color, with the corresponding particle effect and (for merges) a chime.
2. Drag a shape across the canvas — confirm a dust trail follows it, and disappears when the trail toggle is switched off.
3. Single-tap a shape — confirm the existing pulse plus a small particle poof.
4. Double-tap a shape — confirm the existing split plus a spark burst at the original spot.
5. Grow a same-color pair to the merge cap (repeatedly bump matching shapes together) — confirm they stop merging and instead bounce once at the cap.
6. Reload the page — confirm no particle artifacts linger and saved shapes/strokes are unaffected (persistence unchanged).
