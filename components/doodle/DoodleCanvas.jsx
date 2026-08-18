import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import { clamp } from '../../lib/random';
import { MIN_SIZE, MAX_SIZE } from '../../lib/doodleShapes';
import Shape from './Shape';
import Stroke from './Stroke';
import styles from './doodle.module.css';

const MOVE_THRESHOLD = 8; // px of movement before a press becomes a drag/draw
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_RADIUS = MOVE_THRESHOLD * 3; // proximity a second tap must land within to complete a double-tap
const MUTE_KEY = 'doodle-muted';
const MAX_DT = 0.05; // clamp frame delta so a backgrounded tab doesn't jump
const MAX_POINTERS = 10; // defensive ceiling, not a gameplay limit
const PINCH_WINDOW_MS = 150; // two touches must land within this of each other to start a pinch

export default function DoodleCanvas({ rng, sound }) {
  const {
    objects, spawnShape, startStroke, appendStrokePoint, moveShape, transformShape, popShape, advance, clear,
  } = useDoodleObjects(rng);

  const svgRef = useRef(null);
  const soundRef = useRef(null);
  if (soundRef.current === null) soundRef.current = sound || createDoodleSound();

  // Read once at mount rather than reactively — kids aren't expected to
  // resize or rotate the window mid-play.
  const sizeMultiplierRef = useRef(null);
  if (sizeMultiplierRef.current === null) {
    sizeMultiplierRef.current = (typeof window !== 'undefined' && window.innerWidth >= 768) ? 2 : 1;
  }

  // Mirror latest objects for event handlers (avoids stale closures).
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const pointersRef = useRef(new Map()); // pointerId -> PointerState
  const pinchesRef = useRef(new Map()); // shapeId -> PinchState
  const lastTapRef = useRef(new Map()); // shapeId -> { x, y, time }
  const pulseTimers = useRef(new Map()); // shapeId -> timeoutId
  const [pulsingIds, setPulsingIds] = useState(new Set());
  const [muted, setMuted] = useState(false);

  // Load + persist the mute preference (separate from canvas content).
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === 'true');
    } catch {
      // ignore — default to unmuted
    }
  }, []);
  useEffect(() => {
    soundRef.current.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // ignore — preference just won't persist
    }
  }, [muted]);

  // Single rAF drift loop. Grabbed shape (if any) is held still.
  useEffect(() => {
    let raf;
    let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        const grabbedIds = new Set();
        pointersRef.current.forEach((entry) => {
          if (entry.mode === 'drag' || entry.mode === 'pinch-member') grabbedIds.add(entry.shapeId);
        });
        advance(dt, { width: rect.width, height: rect.height }, grabbedIds);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance]);

  // Clear every pending pulse timeout on unmount (consistent with the rAF cleanup).
  useEffect(() => () => {
    pulseTimers.current.forEach((timerId) => clearTimeout(timerId));
    pulseTimers.current.clear();
    pointersRef.current.clear();
    pinchesRef.current.clear();
  }, []);

  const toLocal = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) };
  };

  // A shape group carries data-id; strokes (polylines) do not. So the presence
  // of a [data-id] ancestor is exactly "the pointer landed on a shape".
  const shapeIdFromTarget = (target) => target?.closest?.('[data-id]')?.getAttribute('data-id') || null;

  // A shape is "claimed" once it has an active drag or an active pinch; a
  // pointer landing on a claimed shape becomes inert rather than starting a
  // second, conflicting gesture on the same shape.
  const shapeIsClaimed = (shapeId) => pinchesRef.current.has(shapeId)
    || [...pointersRef.current.values()].some((entry) => entry.shapeId === shapeId && entry.mode === 'drag');

  // Tears down a pinch when one of its two member pointers lifts/cancels:
  // removes the shared pinchesRef entry and hands the surviving pointer off
  // to a plain drag re-armed from its current live position, so it continues
  // smoothly instead of jumping or restarting the gesture.
  const endPinchMember = (p, pointerId) => {
    const pinch = pinchesRef.current.get(p.shapeId);
    pinchesRef.current.delete(p.shapeId);
    if (!pinch) return;
    const otherId = pinch.pointerIds.find((id) => id !== pointerId);
    const other = pointersRef.current.get(otherId);
    if (other) {
      other.mode = 'drag';
      other.moved = true;
      other.startX = other.x;
      other.startY = other.y;
    }
  };

  // Each shape's pulse expires independently, so a second concurrent tap (a
  // different finger, on a different shape) never cancels another shape's
  // in-flight pulse animation.
  const triggerPulse = (id) => {
    setPulsingIds((prev) => new Set(prev).add(id));
    const existingTimer = pulseTimers.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    pulseTimers.current.set(id, setTimeout(() => {
      pulseTimers.current.delete(id);
      setPulsingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, DOUBLE_TAP_MS));
  };

  const handleShapeTap = (id, x, y) => {
    const now = Date.now();
    const last = lastTapRef.current.get(id);
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_RADIUS) {
      lastTapRef.current.delete(id);
      popShape(id);
      soundRef.current.playPop();
      return;
    }
    lastTapRef.current.set(id, { x, y, time: now });
    // Prune other shapes' stale tap entries — they're too old to complete a
    // double-tap anyway, so there's no reason to keep them around forever.
    lastTapRef.current.forEach((entry, shapeId) => {
      if (shapeId !== id && now - entry.time >= DOUBLE_TAP_MS) lastTapRef.current.delete(shapeId);
    });
    triggerPulse(id);
    const shape = objectsRef.current.find((o) => o.id === id);
    if (shape) soundRef.current.playNote(shape.note);
  };

  // Note: we rely on the browser's implicit pointer capture — on touch, the
  // pointerdown target keeps receiving move/up events even if the finger
  // leaves that element — so a drag that wanders off a shape still tracks. The
  // stage is full-viewport, so no explicit setPointerCapture is needed.
  const onPointerDown = (e) => {
    if (pointersRef.current.size >= MAX_POINTERS) return;
    const pt = toLocal(e);
    const shapeId = shapeIdFromTarget(e.target);
    const now = Date.now();

    if (shapeId && shapeIsClaimed(shapeId)) {
      pointersRef.current.set(e.pointerId, {
        pointerId: e.pointerId, mode: 'inert', shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now,
      });
      return;
    }

    if (shapeId) {
      const partnerEntry = [...pointersRef.current.entries()].find(([, entry]) => (
        entry.shapeId === shapeId && entry.mode === null && !entry.moved
        && now - entry.downTime < PINCH_WINDOW_MS
      ));
      if (partnerEntry) {
        const [partnerId, partner] = partnerEntry;
        const shape = objectsRef.current.find((o) => o.id === shapeId);
        if (!shape) return;
        // Use the partner's live position, not its touchdown position — it may
        // have drifted (up to MOVE_THRESHOLD) before the second finger landed.
        const startDist = Math.max(Math.hypot(pt.x - partner.x, pt.y - partner.y), 1);
        const startAngle = Math.atan2(pt.y - partner.y, pt.x - partner.x) * (180 / Math.PI);
        pinchesRef.current.set(shapeId, {
          pointerIds: [partnerId, e.pointerId],
          startDist,
          startAngle,
          startSize: shape.size,
          startRotation: shape.rotation,
          sizeMultiplier: shape.sizeMultiplier || 1,
        });
        partner.mode = 'pinch-member';
        partner.moved = true;
        pointersRef.current.set(e.pointerId, {
          pointerId: e.pointerId, mode: 'pinch-member', shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now,
        });
        return;
      }
    }

    pointersRef.current.set(e.pointerId, {
      pointerId: e.pointerId, mode: null, shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: false, strokeId: null, downTime: now,
    });
  };

  const onPointerMove = (e) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    const pt = toLocal(e);
    p.x = pt.x;
    p.y = pt.y;

    if (p.mode === 'inert') return;

    if (p.mode === 'pinch-member') {
      const pinch = pinchesRef.current.get(p.shapeId);
      if (!pinch) return;
      const [idA, idB] = pinch.pointerIds;
      const a = pointersRef.current.get(idA);
      const b = pointersRef.current.get(idB);
      if (!a || !b) return;
      const liveDist = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
      const liveAngle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
      // MIN_SIZE/MAX_SIZE scale with the shape's own sizeMultiplier (a
      // tablet-spawned 2x shape pinches within its own larger range, not the
      // phone-scale range). MIN_SIZE*multiplier is the spawn floor, not a
      // floor on every shape — popped shards routinely start below it. Never
      // snap a shape up to that floor on the first pinch move; let it shrink
      // further from wherever it already was.
      const minSize = Math.min(MIN_SIZE * pinch.sizeMultiplier, pinch.startSize);
      const maxSize = MAX_SIZE * pinch.sizeMultiplier;
      const size = clamp(pinch.startSize * (liveDist / pinch.startDist), minSize, maxSize);
      const rotation = pinch.startRotation + (liveAngle - pinch.startAngle);
      transformShape(p.shapeId, { size, rotation });
      return;
    }

    if (!p.moved) {
      const distMoved = Math.hypot(pt.x - p.startX, pt.y - p.startY);
      if (distMoved < MOVE_THRESHOLD) return;
      p.moved = true;
      if (p.shapeId) {
        if (shapeIsClaimed(p.shapeId)) {
          p.mode = 'inert';
          return;
        }
        p.mode = 'drag';
      } else {
        p.mode = 'draw';
        p.strokeId = startStroke(p.startX, p.startY);
        soundRef.current.playStroke();
      }
    }
    if (p.mode === 'drag') moveShape(p.shapeId, pt.x, pt.y);
    else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
  };

  const onPointerUp = (e) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.delete(e.pointerId);

    if (p.mode === 'inert') return;

    if (p.mode === 'pinch-member') {
      endPinchMember(p, e.pointerId);
      return;
    }

    if (p.moved) return; // drag/draw already handled on move
    if (p.shapeId) {
      handleShapeTap(p.shapeId, p.startX, p.startY);
    } else {
      const pt = toLocal(e);
      const shape = spawnShape(pt.x, pt.y, sizeMultiplierRef.current);
      soundRef.current.playNote(shape.note);
    }
  };

  // The browser sends pointercancel instead of pointerup for palm rejection,
  // edge-swipe gestures, or the OS reclaiming the touch — all plausible when a
  // toddler's whole hand lands on the screen. A cancelled pointer's entry is
  // simply dropped, freeing that slot for future touches.
  const onPointerCancel = (e) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.delete(e.pointerId);
    if (p.mode === 'pinch-member') endPinchMember(p, e.pointerId);
  };

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={styles.stage}
        aria-label="Doodle canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {objects.map((o) => (o.kind === 'shape'
          ? <Shape key={o.id} shape={o} pulsing={pulsingIds.has(o.id)} />
          : <Stroke key={o.id} stroke={o} />))}
      </svg>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolButton}
          aria-label="Clear canvas"
          onClick={clear}
        >
          🗑️
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  );
}

DoodleCanvas.propTypes = {
  rng: PropTypes.func,
  sound: PropTypes.shape({
    playNote: PropTypes.func.isRequired,
    playStroke: PropTypes.func.isRequired,
    playPop: PropTypes.func.isRequired,
    setMuted: PropTypes.func.isRequired,
    isMuted: PropTypes.func.isRequired,
  }),
};

DoodleCanvas.defaultProps = {
  rng: Math.random,
  sound: null,
};
