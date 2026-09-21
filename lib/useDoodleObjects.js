import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advanceShape, createShape, pickColor, splitShape, DEFAULT_DRIFT_MIN, DEFAULT_DRIFT_MAX,
} from './doodleShapes';
import { resolveCollisions } from './doodlePhysics';
import {
  buildWalls, resolveWallCollisions, clampIntoBounds, createStuckState, trackStuck,
  DEFAULT_WALL_RESTITUTION, DEFAULT_STUCK_AFTER_S, DEFAULT_WALL_IMMUNITY_S,
} from './doodleWalls';
import { generateId } from './random';

const STORAGE_KEY = 'doodle-objects';
const SAVE_INTERVAL_MS = 1000;

function loadStored() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line import/prefer-default-export
export function useDoodleObjects(rng = Math.random) {
  const [objects, setObjects] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const dirtyRef = useRef(false);

  // Per-stroke bounding boxes for wall broad phase. A ref, never state: it is
  // derived data that must not reach the localStorage snapshot, and mutating
  // it must not trigger a render.
  const wallCacheRef = useRef(new Map());

  // Stuck-detection state. A ref for the same reason as the wall cache: it is
  // transient bookkeeping, not canvas content, and must never reach the
  // localStorage snapshot.
  const stuckRef = useRef(createStuckState());

  // Single source of truth for every mutator: write the ref synchronously,
  // then mirror it into React state. Every mutator below reads
  // objectsRef.current (never a `prev` from a setState updater) and writes
  // through here, so there's no dependency on how React composes/queues
  // updater-function calls against each other — a plain-value setState call
  // replaces whatever update was pending rather than composing with it,
  // which used to let a rAF-driven advance() silently clobber a same-tick
  // pointermove update (or, on mount, the hydration read itself).
  const commit = useCallback((next) => {
    objectsRef.current = next;
    setObjects(next);
  }, []);

  // Read in a mount effect, not a lazy initializer: the server has no
  // localStorage, so a synchronous read would diverge from server-rendered
  // HTML and trigger a hydration mismatch (same rule as the fitness page).
  useEffect(() => {
    const stored = loadStored();
    if (Array.isArray(stored)) commit(stored);
    setHydrated(true);
  }, [commit]);

  // Mark state dirty on every change; the interval below decides when to write.
  useEffect(() => {
    if (hydrated) dirtyRef.current = true;
  }, [objects, hydrated]);

  // Drift mutates positions every frame, so a reset-on-change debounce would
  // never fire (each frame clears the pending timer). Use a fixed-interval
  // flush instead — at most one write per SAVE_INTERVAL_MS regardless of how
  // fast objects change — plus a flush on page-hide/unmount so navigating away
  // mid-play still persists.
  useEffect(() => {
    if (!hydrated) return undefined;
    const save = () => {
      if (!dirtyRef.current) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(objectsRef.current));
        dirtyRef.current = false;
      } catch {
        // storage full/unavailable (private mode/quota) — keep running
      }
    };
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
      save(); // final flush on unmount
    };
  }, [hydrated]);

  const spawnShape = useCallback((
    x,
    y,
    sizeMultiplier = 1,
    driftMin = DEFAULT_DRIFT_MIN,
    driftMax = DEFAULT_DRIFT_MAX,
  ) => {
    const shape = createShape(x, y, rng, sizeMultiplier, driftMin, driftMax);
    commit([...objectsRef.current, shape]);
    return shape;
  }, [rng, commit]);

  const startStroke = useCallback((x, y) => {
    const id = generateId();
    commit([...objectsRef.current, {
      id, kind: 'stroke', color: pickColor(rng), points: [{ x, y }],
    }]);
    return id;
  }, [rng, commit]);

  const appendStrokePoint = useCallback((id, x, y) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'stroke'
        ? { ...o, points: [...o.points, { x, y }] }
        : o
    )));
  }, [commit]);

  const moveShape = useCallback((id, x, y) => {
    commit(objectsRef.current.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, [commit]);

  // Flick-to-throw: moveShape rewrites position only, so a released shape
  // would otherwise resume the ambient drift it had before the grab. This is
  // the one mutator that writes velocity from a gesture.
  const throwShape = useCallback((id, vx, vy) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape' ? { ...o, vx, vy } : o
    )));
  }, [commit]);

  const transformShape = useCallback((id, { size, rotation } = {}) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape'
        ? { ...o, size: size ?? o.size, rotation: rotation ?? o.rotation }
        : o
    )));
  }, [commit]);

  const popShape = useCallback((id, driftMin = DEFAULT_DRIFT_MIN, driftMax = DEFAULT_DRIFT_MAX) => {
    const prev = objectsRef.current;
    const target = prev.find((o) => o.id === id);
    if (!target || target.kind !== 'shape') return;
    const children = splitShape(target, rng, driftMin, driftMax);
    commit([...prev.filter((o) => o.id !== id), ...children]);
  }, [rng, commit]);

  // Ending a drag or pinch grants wall immunity: a child who parked a shape on
  // top of a line should see it drift free, not get spat out the moment they
  // lift their finger.
  const releaseShape = useCallback((id, wallImmunityS = DEFAULT_WALL_IMMUNITY_S) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape'
        ? { ...o, wallImmunityRemaining: wallImmunityS }
        : o
    )));
  }, [commit]);

  const advance = useCallback((dtSeconds, bounds, grabbedIds, tuning = {}) => {
    const {
      wallRestitution = DEFAULT_WALL_RESTITUTION,
      stuckAfterS = DEFAULT_STUCK_AFTER_S,
      wallImmunityS = DEFAULT_WALL_IMMUNITY_S,
    } = tuning;
    // Compute entirely synchronously using objectsRef.current (current state
    // mirror) so this stays a plain synchronous read/write against `commit`,
    // matching every other mutator — no flushSync needed.
    const prev = objectsRef.current;

    // Apply drift to non-grabbed shapes; a grabbed shape stays exactly where
    // the pointer (drag) or pinch gesture (transformShape) put it, never
    // advanced by drift.
    const drifted = prev.map((o) => (
      o.kind === 'shape' && !grabbedIds?.has(o.id)
        ? advanceShape(o, dtSeconds, bounds)
        : o
    ));

    // Resolve collisions among ALL shapes, including grabbed ones — passing
    // their ids lets resolveCollisions treat each as infinite mass: it still
    // detects overlap and can bounce/trigger events (so other shapes visibly
    // react to it), but never merges away and never gets displaced.
    const shapesForCollision = drifted.filter((o) => o.kind === 'shape');
    const resolved = resolveCollisions(shapesForCollision, grabbedIds, rng);
    const { events } = resolved;

    // Map resolved shapes by id for reconstruction
    const byId = new Map(resolved.shapes.map((s) => [s.id, s]));
    const beforeById = new Map(drifted.map((o) => [o.id, o]));

    // Preserve original interleave order: keep non-shape objects in place,
    // update shapes with collision results — restoring each grabbed shape's
    // exact pre-call position (it must track the pointer/gesture, not
    // physics) — and append newly merged shapes.
    const survivors = drifted
      .filter((o) => (o.kind !== 'shape' ? true : byId.has(o.id)))
      .map((o) => {
        if (o.kind !== 'shape') return o;
        const resolvedShape = byId.get(o.id);
        if (grabbedIds?.has(o.id)) {
          const before = beforeById.get(o.id);
          return { ...resolvedShape, x: before.x, y: before.y };
        }
        return resolvedShape;
      });

    const survivorIds = new Set(survivors.map((o) => o.id));
    const mergedOnly = resolved.shapes.filter((s) => !survivorIds.has(s.id));
    const afterShapes = [...survivors, ...mergedOnly];

    // Walls run after shape-against-shape so immovable geometry gets the last
    // word: a shape shoved into a line by another shape — or a merge that
    // yields a bigger, more deeply embedded shape — ends the frame outside the
    // line rather than inside it, subject to the per-frame push cap.
    const walls = buildWalls(
      afterShapes.filter((o) => o.kind === 'stroke'),
      wallCacheRef.current,
    );
    const wallPass = resolveWallCollisions(
      afterShapes.filter((o) => o.kind === 'shape'),
      walls,
      grabbedIds,
      wallRestitution,
    );
    const wallById = new Map(wallPass.shapes.map((s) => [s.id, s]));

    const tracked = trackStuck(
      stuckRef.current, afterShapes, wallPass.contacts, dtSeconds, stuckAfterS,
    );
    stuckRef.current = tracked.state;

    const next = afterShapes.map((o) => {
      if (o.kind !== 'shape' || grabbedIds?.has(o.id)) return o;
      const pushed = wallById.get(o.id);
      // advanceShape already clamped this shape into bounds this frame and the
      // wall pass may have pushed it back out. Re-clamp — and treat a re-clamp
      // that reverses the wall's own push on a still-contacting shape as the
      // wall-against-edge deadlock, handing it straight to immunity instead of
      // jittering between the two constraints forever.
      const { shape, clamped } = clampIntoBounds(pushed, bounds);

      // A genuine wall-vs-edge deadlock is the bounds clamp reversing the wall
      // pass's own push (opposite direction on the same axis) — not merely "some
      // clamp happened somewhere while some wall was also touched," which can be
      // two unrelated events (e.g. a shape shoved out of bounds by another shape
      // while separately brushing an unrelated wall elsewhere).
      const wallDx = pushed.x - o.x;
      const wallDy = pushed.y - o.y;
      const clampDx = shape.x - pushed.x;
      const clampDy = shape.y - pushed.y;
      const opposedPush = (wallDx * clampDx + wallDy * clampDy) < 0;

      const trapped = tracked.stuck.has(o.id)
        || (clamped && opposedPush && wallPass.contacts.has(o.id));
      if (trapped) return { ...shape, wallImmunityRemaining: wallImmunityS };

      // An already-immune shape still overlapping a wall stays immune until it
      // actually clears, rather than expiring on a fixed clock while still
      // pinned — otherwise a tight enclosure produces a repeating grant/jitter
      // cycle instead of a one-time rescue.
      if ((shape.wallImmunityRemaining || 0) > 0 && wallPass.contacts.has(o.id)) {
        return { ...shape, wallImmunityRemaining: wallImmunityS };
      }
      return shape;
    });

    commit(next);
    return [...events, ...wallPass.events];
  }, [commit, rng]);

  // With no kind, wipes everything (original behavior). With a kind
  // ('shape' | 'stroke'), removes only objects of that kind, leaving the
  // other kind untouched — lets the canvas offer a mode-scoped clear.
  // Returns the objects that were removed, so a caller can offer an undo
  // (see `restore`).
  const clear = useCallback((kind) => {
    const prev = objectsRef.current;
    const removed = kind ? prev.filter((o) => o.kind === kind) : prev;
    const next = kind ? prev.filter((o) => o.kind !== kind) : [];
    commit(next);
    try {
      if (next.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore — nothing to clean up if storage is unavailable
    }
    return removed;
  }, [commit]);

  // Undo for `clear`: appends the previously removed objects back onto
  // whatever is currently in state (never replaces it — the user may have
  // drawn new objects during the undo window, and those must survive).
  // Writes localStorage synchronously/directly rather than through the
  // debounced interval, since an undo should persist immediately.
  const restore = useCallback((removed) => {
    if (!removed || removed.length === 0) return;
    const merged = [...objectsRef.current, ...removed];
    commit(merged);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore — nothing to clean up if storage is unavailable
    }
  }, [commit]);

  return {
    objects,
    hydrated,
    spawnShape,
    startStroke,
    appendStrokePoint,
    moveShape,
    throwShape,
    transformShape,
    popShape,
    releaseShape,
    advance,
    clear,
    restore,
  };
}
