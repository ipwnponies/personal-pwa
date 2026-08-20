import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceShape, createShape, pickColor, splitShape } from './doodleShapes';
import { resolveCollisions } from './doodlePhysics';
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

  const spawnShape = useCallback((x, y, sizeMultiplier = 1) => {
    const shape = createShape(x, y, rng, sizeMultiplier);
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

  const transformShape = useCallback((id, { size, rotation } = {}) => {
    commit(objectsRef.current.map((o) => (
      o.id === id && o.kind === 'shape'
        ? { ...o, size: size ?? o.size, rotation: rotation ?? o.rotation }
        : o
    )));
  }, [commit]);

  const popShape = useCallback((id) => {
    const prev = objectsRef.current;
    const target = prev.find((o) => o.id === id);
    if (!target || target.kind !== 'shape') return;
    const children = splitShape(target, rng);
    commit([...prev.filter((o) => o.id !== id), ...children]);
  }, [rng, commit]);

  const advance = useCallback((dtSeconds, bounds, grabbedIds) => {
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
    const resolved = resolveCollisions(shapesForCollision, grabbedIds);
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

    commit([...survivors, ...mergedOnly]);
    return events;
  }, [commit]);

  const clear = useCallback(() => {
    commit([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
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
    transformShape,
    popShape,
    advance,
    clear,
  };
}
