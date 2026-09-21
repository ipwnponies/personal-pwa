// Static collision geometry derived from finger-drawn strokes. Every function
// here is pure: no React, no refs, and deliberately no `rng` — wall collision
// makes no random choice, so the seq([...]) draw-position gotcha documented in
// .claude/rules/doodle.md cannot apply to this module.

import { clamp } from './random';

// Half of Stroke.jsx's strokeWidth={8}: collision geometry is exactly the
// visible ink, with no invisible halo. Structural, not a feel constant.
export const WALL_RADIUS = 4;

// Axis-aligned box over a stroke's points, expanded by the wall's own
// half-thickness so the box covers the drawn line rather than its centerline.
// An empty points array yields an inverted box (minX Infinity, maxX -Infinity)
// that no overlap test can match, which is the behavior we want.
export function strokeBounds(stroke) {
  const { points } = stroke;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: minX - WALL_RADIUS,
    minY: minY - WALL_RADIUS,
    maxX: maxX + WALL_RADIUS,
    maxY: maxY + WALL_RADIUS,
  };
}

// Walls are derived live every frame rather than baked at stroke commit, so
// the stroke data model stays untouched, old strokes in localStorage become
// walls with no migration, and a stroke still being drawn is already a wall.
// Only the bounding box is memoized. `cache` is passed in (rather than held in
// module scope) so this stays testable in isolation and so the owner —
// useDoodleObjects — can keep it in a ref, out of persisted state.
//
// The key is the stroke id plus its point count: appendStrokePoint only ever
// grows a stroke, so a changed count is exactly "this stroke changed".
export function buildWalls(strokes, cache) {
  const walls = strokes.map((stroke) => {
    const cached = cache.get(stroke.id);
    if (cached && cached.pointCount === stroke.points.length) return cached.wall;
    const wall = { id: stroke.id, points: stroke.points, bounds: strokeBounds(stroke) };
    cache.set(stroke.id, { pointCount: stroke.points.length, wall });
    return wall;
  });
  // Clearing the canvas removes strokes; without this the cache would keep
  // their entries alive for the lifetime of the page.
  if (cache.size > strokes.length) {
    const live = new Set(strokes.map((s) => s.id));
    cache.forEach((_, id) => {
      if (!live.has(id)) cache.delete(id);
    });
  }
  return walls;
}

// Same value as doodlePhysics' RESTITUTION: a wall bounces a shape exactly as
// another shape would, which is the least surprising thing for a child. A feel
// constant, so it is threaded from the tuning panel.
export const DEFAULT_WALL_RESTITUTION = 0.9;

// Ceiling on how far one shape may be pushed out of walls in a single frame.
// Drawing a line straight through a resting shape creates an arbitrarily deep
// overlap; without this cap the shape would be flung clear in one frame. With
// it, it emerges over a few frames. Structural, so it stays plain.
export const MAX_WALL_PUSH_PER_FRAME = 4;

// Resolves every shape against every wall. Walls are immovable (infinite
// mass), so a shape absorbs the entire position correction and the entire
// impulse — which is why its own mass cancels out of the impulse below, unlike
// the mass-weighted shape-against-shape path in doodlePhysics.
//
// grabbedIds (optional): a Set of shapes held by a pointer or pinch. Unlike
// doodlePhysics, a grabbed shape is skipped outright rather than treated as
// infinite mass: the finger always wins, so a child can hand-rescue a shape
// from anywhere and can deliberately park one inside a drawn pen.
//
// Returns `contacts` alongside `events`: `events` only fires where an impulse
// was applied (so a shape resting against a line doesn't emit a particle burst
// every frame), while the stuck detector needs to know about exactly that
// impulse-free resting case.
export function resolveWallCollisions(
  shapes,
  walls,
  grabbedIds = null,
  restitution = DEFAULT_WALL_RESTITUTION,
) {
  const working = shapes.map((s) => ({ ...s }));
  const events = [];
  const contacts = new Set();

  for (let s = 0; s < working.length; s += 1) {
    const shape = working[s];
    // An immune shape still runs detection so it can be reported in
    // `contacts` — the caller needs to know it is *still* overlapping a wall to
    // keep refreshing its immunity — but skips every correction below, so its
    // position and velocity are untouched while immune.
    const immune = (shape.wallImmunityRemaining || 0) > 0;
    if (!grabbedIds?.has(shape.id)) {
      const r = shape.size / 2;
      const minDist = r + WALL_RADIUS;
      let pushBudget = MAX_WALL_PUSH_PER_FRAME;

      for (let w = 0; w < walls.length; w += 1) {
        const wall = walls[w];
        const { bounds, points } = wall;
        // Broad phase: one box test rejects every segment of a distant stroke.
        const near = !(shape.x + r < bounds.minX || shape.x - r > bounds.maxX
          || shape.y + r < bounds.minY || shape.y - r > bounds.maxY);

        if (near) {
          // A stroke of one point (startStroke, before the first append) is a
          // single segment from that point to itself.
          const segCount = Math.max(points.length - 1, 1);
          for (let i = 0; i < segCount; i += 1) {
            const a = points[i];
            const b = points[i + 1] || a;
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const lenSq = abx * abx + aby * aby;
            // Closest point on the segment. A zero-length segment (a draw-mode
            // tap is a stroke of two identical points) collapses t to 0 and
            // the capsule degenerates to a circle, which is correct.
            const t = lenSq > 0
              ? clamp(((shape.x - a.x) * abx + (shape.y - a.y) * aby) / lenSq, 0, 1)
              : 0;
            const qx = a.x + abx * t;
            const qy = a.y + aby * t;
            const dx = shape.x - qx;
            const dy = shape.y - qy;
            const dist = Math.hypot(dx, dy);

            if (dist < minDist) {
              contacts.add(shape.id);
              if (!immune) {
                let nx;
                let ny;
                if (dist > 0) {
                  nx = dx / dist;
                  ny = dy / dist;
                } else if (lenSq > 0) {
                  // Center exactly on the segment: no direction to derive from
                  // the offset, so push out along the segment's perpendicular.
                  const len = Math.sqrt(lenSq);
                  nx = -aby / len;
                  ny = abx / len;
                } else {
                  // Center exactly on a zero-length segment: nothing geometric
                  // is left, so pick a deterministic axis from the two ids —
                  // the same trick doodlePhysics uses for coincident shapes.
                  nx = shape.id < wall.id ? 1 : -1;
                  ny = 0;
                }

                const push = Math.min(minDist - dist, pushBudget);
                if (push > 0) {
                  shape.x += nx * push;
                  shape.y += ny * push;
                  pushBudget -= push;
                }

                // Same gate as doodlePhysics: reflect only when the shape is
                // actually moving into the wall. Multiple contacts in one frame
                // resolve in sequence — at a sharp corner a shape reflected off
                // one segment may still be moving into the next, and reflecting
                // again there is correct, not double-counting.
                const velAlongNormal = shape.vx * nx + shape.vy * ny;
                if (velAlongNormal < 0) {
                  const impulse = -(1 + restitution) * velAlongNormal;
                  shape.vx += impulse * nx;
                  shape.vy += impulse * ny;
                  events.push({
                    type: 'wallBounce', x: qx, y: qy, color: shape.color, normal: { x: nx, y: ny },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return { shapes: working, events, contacts };
}

// How long a shape ignores walls once it is freed. Long enough to drift clear
// of a line at any tuned drift speed. A feel constant: the right value can
// only be found by watching a child play, which is exactly the bar the
// tuning-panel convention sets.
export const DEFAULT_WALL_IMMUNITY_S = 1.5;

// Window over which a shape's net displacement is measured. Also a feel
// constant, for the same reason.
export const DEFAULT_STUCK_AFTER_S = 1;

// Net displacement below which a shape counts as not having moved: one wall
// thickness, far less than even the slowest drifting shape covers in a second.
// Structural, so it stays plain.
export const STUCK_DISPLACEMENT = WALL_RADIUS * 2;

// Positional clamp only — deliberately no velocity reflection. advanceShape
// already reflected velocity at the edge this frame, and the wall pass may
// have set a velocity of its own; flipping it again here would cancel the
// bounce that just happened.
//
// `clamped` is the wall-against-canvas-edge tell: a shape the wall pushed out
// of bounds and the clamp pushed straight back into the wall is in a deadlock
// that no amount of further correction resolves. The caller escalates that to
// wall immunity rather than fighting it every frame.
export function clampIntoBounds(shape, bounds) {
  const r = shape.size / 2;
  // Math.max guards a shape larger than the stage, where the low bound would
  // otherwise exceed the high one.
  const x = clamp(shape.x, r, Math.max(bounds.width - r, r));
  const y = clamp(shape.y, r, Math.max(bounds.height - r, r));
  const clamped = x !== shape.x || y !== shape.y;
  return { shape: clamped ? { ...shape, x, y } : shape, clamped };
}

export function createStuckState() {
  return { elapsed: 0, positions: new Map(), contacted: new Set() };
}

// Samples shape positions once per stuckAfterS window and reports the shapes
// that barely moved across a whole window *while touching a wall*. Requiring
// the wall contact is what keeps a merely slow-drifting shape from being
// flagged; requiring near-zero displacement is what keeps a shape circling
// inside a deliberately drawn pen from being flagged, since a pen is the
// feature working and should not dissolve itself.
//
// State goes in and comes back out rather than being mutated in place: the
// caller keeps it in a ref, so it never reaches the localStorage snapshot.
export function trackStuck(
  state,
  shapes,
  contacts,
  dtSeconds,
  stuckAfterS = DEFAULT_STUCK_AFTER_S,
) {
  const contacted = new Set(state.contacted);
  contacts.forEach((id) => contacted.add(id));
  const elapsed = state.elapsed + dtSeconds;
  if (elapsed < stuckAfterS) {
    return { state: { ...state, elapsed, contacted }, stuck: new Set() };
  }

  const stuck = new Set();
  const positions = new Map();
  shapes.forEach((o) => {
    if (o.kind !== 'shape') return;
    positions.set(o.id, { x: o.x, y: o.y });
    const before = state.positions.get(o.id);
    if (before && contacted.has(o.id)
      && Math.hypot(o.x - before.x, o.y - before.y) < STUCK_DISPLACEMENT) {
      stuck.add(o.id);
    }
  });
  return { state: { elapsed: 0, positions, contacted: new Set() }, stuck };
}
