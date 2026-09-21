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
    const immune = (shape.wallImmunityRemaining || 0) > 0;
    if (!immune && !grabbedIds?.has(shape.id)) {
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

  return { shapes: working, events, contacts };
}
