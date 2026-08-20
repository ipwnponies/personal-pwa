import { mergeShapes, MAX_MERGE_SIZE } from './doodleShapes';

const RESTITUTION = 0.9;

const massOf = (shape) => shape.size ** 2;

// Pairwise brute-force collision pass (shape counts are small — dozens at
// most — so N^2 is comfortably cheap). Same-color overlapping pairs merge
// (unless the merged size would exceed MAX_MERGE_SIZE); every other
// overlapping pair bounces elastically. A merged shape is consumed for the
// rest of this pass — it can't also collide with a third shape in the same
// frame; that's resolved next frame instead.
//
// grabbedIds (optional): a Set of shapes currently held by the user's
// pointers/gestures, if any. Each still takes part in collision detection —
// so other shapes visibly bounce off it — but is treated as infinite mass
// (never displaced by impulse or position correction) and is never eligible
// to merge away. The caller (useDoodleObjects) additionally restores its
// exact position after the call, since it must track the pointer/gesture,
// not physics.
// eslint-disable-next-line import/prefer-default-export
export function resolveCollisions(shapes, grabbedIds = null) {
  const working = shapes.map((s) => ({ ...s }));
  const removed = new Set();
  const merged = [];
  const events = [];

  for (let i = 0; i < working.length; i += 1) {
    const a = working[i];
    if (!removed.has(a.id)) {
      for (let j = i + 1; j < working.length; j += 1) {
        const b = working[j];
        if (!removed.has(b.id)) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rawDist = Math.hypot(dx, dy);
          const dist = rawDist || 0.0001;
          const minDist = a.size / 2 + b.size / 2;
          let didMerge = false;

          // A freshly split shape (see SPLIT_GRACE_S) ignores collisions
          // entirely for its grace window, so siblings spawned coincident at
          // the same point can disperse before merge/bounce logic sees them.
          const aGraced = (a.splitGraceRemaining || 0) > 0;
          const bGraced = (b.splitGraceRemaining || 0) > 0;

          if (dist < minDist && !aGraced && !bGraced) {
            // Degenerate case: shapes are coincident (dx ~= 0 && dy ~= 0).
            // Derive a deterministic fallback normal from IDs to avoid (0, 0) normal.
            let nx = dx / dist;
            let ny = dy / dist;
            if (rawDist === 0) {
              const useXAxis = a.id < b.id;
              nx = useXAxis ? 1 : -1;
              ny = 0;
            }

            const aGrabbed = grabbedIds?.has(a.id) ?? false;
            const bGrabbed = grabbedIds?.has(b.id) ?? false;

            if (a.color === b.color && !aGrabbed && !bGrabbed) {
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
                didMerge = true;
              }
            }

            if (!didMerge) {
              // A grabbed shape has effectively infinite mass: an inverse mass
              // of 0 means it absorbs none of the position correction and none
              // of the velocity impulse, while the other shape still gets a
              // normal response.
              const invA = aGrabbed ? 0 : 1 / massOf(a);
              const invB = bGrabbed ? 0 : 1 / massOf(b);
              const totalInv = invA + invB;
              const overlap = minDist - dist;
              const shareA = totalInv > 0 ? invA / totalInv : 0.5;
              const shareB = totalInv > 0 ? invB / totalInv : 0.5;
              a.x -= nx * overlap * shareA;
              a.y -= ny * overlap * shareA;
              b.x += nx * overlap * shareB;
              b.y += ny * overlap * shareB;

              const rvx = b.vx - a.vx;
              const rvy = b.vy - a.vy;
              const velAlongNormal = rvx * nx + rvy * ny;
              // totalInv === 0 means both colliders are grabbed (infinite
              // mass on both sides) — no impulse is applicable, and dividing
              // by it would produce Infinity * 0 = NaN, corrupting both
              // shapes' velocities permanently (they'd never recover once
              // released, and NaN positions can cascade into other shapes
              // via future collisions).
              if (velAlongNormal < 0 && totalInv > 0) {
                const impulse = (-(1 + RESTITUTION) * velAlongNormal) / totalInv;
                const ix = impulse * nx;
                const iy = impulse * ny;
                a.vx -= ix * invA;
                a.vy -= iy * invA;
                b.vx += ix * invB;
                b.vy += iy * invB;
                // Only fire (and spawn particles for) a bounce when an actual
                // impulse was applied — not on every frame two shapes merely
                // remain overlapping (e.g. separating pairs, or pairs pinned
                // against a wall/corner with nothing physically changing).
                events.push({
                  type: 'bounce', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color: a.color, normal: { x: nx, y: ny },
                });
              }
            }
          }

          if (didMerge) break;
        }
      }
    }
  }

  return {
    shapes: working.filter((s) => !removed.has(s.id)).concat(merged),
    events,
  };
}
