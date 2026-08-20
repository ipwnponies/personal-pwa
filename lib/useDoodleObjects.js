import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceShape, createShape, pickColor, splitShape } from './doodleShapes';
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

  // Read in a mount effect, not a lazy initializer: the server has no
  // localStorage, so a synchronous read would diverge from server-rendered
  // HTML and trigger a hydration mismatch (same rule as the fitness page).
  useEffect(() => {
    const stored = loadStored();
    if (Array.isArray(stored)) setObjects(stored);
    setHydrated(true);
  }, []);

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
    setObjects((prev) => [...prev, shape]);
    return shape;
  }, [rng]);

  const startStroke = useCallback((x, y) => {
    const id = generateId();
    setObjects((prev) => [...prev, {
      id, kind: 'stroke', color: pickColor(rng), points: [{ x, y }],
    }]);
    return id;
  }, [rng]);

  const appendStrokePoint = useCallback((id, x, y) => {
    setObjects((prev) => prev.map((o) => (
      o.id === id && o.kind === 'stroke'
        ? { ...o, points: [...o.points, { x, y }] }
        : o
    )));
  }, []);

  const moveShape = useCallback((id, x, y) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, []);

  const transformShape = useCallback((id, { size, rotation } = {}) => {
    setObjects((prev) => prev.map((o) => (
      o.id === id && o.kind === 'shape'
        ? { ...o, size: size ?? o.size, rotation: rotation ?? o.rotation }
        : o
    )));
  }, []);

  const popShape = useCallback((id) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id);
      if (!target || target.kind !== 'shape') return prev;
      const children = splitShape(target, rng);
      return [...prev.filter((o) => o.id !== id), ...children];
    });
  }, [rng]);

  const advance = useCallback((dtSeconds, bounds, grabbedIds) => {
    setObjects((prev) => prev.map((o) => (
      o.kind === 'shape' && !grabbedIds?.has(o.id)
        ? advanceShape(o, dtSeconds, bounds)
        : o
    )));
  }, []);

  const clear = useCallback(() => {
    setObjects([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore — nothing to clean up if storage is unavailable
    }
  }, []);

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
