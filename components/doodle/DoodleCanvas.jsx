import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import Shape from './Shape';
import Stroke from './Stroke';
import styles from './doodle.module.css';

const MOVE_THRESHOLD = 8; // px of movement before a press becomes a drag/draw
const DOUBLE_TAP_MS = 300;
const MUTE_KEY = 'doodle-muted';
const MAX_DT = 0.05; // clamp frame delta so a backgrounded tab doesn't jump

export default function DoodleCanvas({ rng, sound }) {
  const {
    objects, spawnShape, startStroke, appendStrokePoint, moveShape, popShape, advance, clear,
  } = useDoodleObjects(rng);

  const svgRef = useRef(null);
  const soundRef = useRef(null);
  if (soundRef.current === null) soundRef.current = sound || createDoodleSound();

  // Mirror latest objects for event handlers (avoids stale closures).
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // Single-slot: only one gesture tracked at a time (matches the spec's
  // single-pointer scope). A second finger touching down while one is
  // already active is ignored below rather than clobbering the first.
  const pointerRef = useRef(null); // { pointerId, mode, id, startX, startY, moved, strokeId }
  const lastTapRef = useRef(null); // { id, time }
  const pulseTimer = useRef(null);
  const [pulsingId, setPulsingId] = useState(null);
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
        const grabbed = pointerRef.current?.mode === 'drag' ? pointerRef.current.id : null;
        advance(dt, { width: rect.width, height: rect.height }, grabbed);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance]);

  // Clear a pending pulse timeout on unmount (consistent with the rAF cleanup).
  useEffect(() => () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
  }, []);

  const toLocal = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) };
  };

  // A shape group carries data-id; strokes (polylines) do not. So the presence
  // of a [data-id] ancestor is exactly "the pointer landed on a shape".
  const shapeIdFromTarget = (target) => target?.closest?.('[data-id]')?.getAttribute('data-id') || null;

  const triggerPulse = (id) => {
    setPulsingId(id);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulsingId(null), DOUBLE_TAP_MS);
  };

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

  // Note: we rely on the browser's implicit pointer capture — on touch, the
  // pointerdown target keeps receiving move/up events even if the finger
  // leaves that element — so a drag that wanders off a shape still tracks. The
  // stage is full-viewport, so no explicit setPointerCapture is needed.
  const onPointerDown = (e) => {
    if (pointerRef.current) return; // a gesture is already active — ignore extra fingers
    const pt = toLocal(e);
    pointerRef.current = {
      pointerId: e.pointerId,
      mode: null,
      id: shapeIdFromTarget(e.target),
      startX: pt.x,
      startY: pt.y,
      moved: false,
      strokeId: null,
    };
  };

  const onPointerMove = (e) => {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const pt = toLocal(e);
    if (!p.moved) {
      const dist = Math.hypot(pt.x - p.startX, pt.y - p.startY);
      if (dist < MOVE_THRESHOLD) return;
      p.moved = true;
      if (p.id) {
        p.mode = 'drag';
      } else {
        p.mode = 'draw';
        p.strokeId = startStroke(p.startX, p.startY);
        soundRef.current.playStroke();
      }
    }
    if (p.mode === 'drag') moveShape(p.id, pt.x, pt.y);
    else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
  };

  const onPointerUp = (e) => {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    pointerRef.current = null;
    if (p.moved) return; // drag/draw already handled on move
    if (p.id) {
      handleShapeTap(p.id);
    } else {
      const pt = toLocal(e);
      const shape = spawnShape(pt.x, pt.y);
      soundRef.current.playNote(shape.note);
    }
  };

  // The browser sends pointercancel instead of pointerup for palm rejection,
  // edge-swipe gestures, or the OS reclaiming the touch — all plausible when a
  // toddler's whole hand lands on the screen. Without this, pointerRef would
  // stay populated forever and onPointerDown's single-gesture guard would
  // permanently lock out every future touch.
  const onPointerCancel = (e) => {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    pointerRef.current = null;
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
          ? <Shape key={o.id} shape={o} pulsing={o.id === pulsingId} />
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
