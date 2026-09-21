// Static collision geometry derived from finger-drawn strokes. Every function
// here is pure: no React, no refs, and deliberately no `rng` — wall collision
// makes no random choice, so the seq([...]) draw-position gotcha documented in
// .claude/rules/doodle.md cannot apply to this module.

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
