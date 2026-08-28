import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import { clamp } from '../../lib/random';
import { MIN_SIZE, MAX_SIZE } from '../../lib/doodleShapes';
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, spawnDust, advanceParticles, COLLISION_BURST_MAX_AGE,
  DEFAULT_MAX_PARTICLES, DEFAULT_DUST_MAX_AGE,
} from '../../lib/doodleParticles';
import Shape from './Shape';
import Stroke from './Stroke';
import Particles from './Particles';
import TuningPanel from './TuningPanel';
import styles from './doodle.module.css';

const MOVE_THRESHOLD = 8; // px of movement before a press becomes a drag/draw
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_RADIUS = MOVE_THRESHOLD * 3; // proximity a second tap must land within to complete a double-tap
const MUTE_KEY = 'doodle-muted';
const TRAILS_KEY = 'doodle-trails';
const TUNING_KEY = 'doodle-tuning';
const MAX_DT = 0.05; // clamp frame delta so a backgrounded tab doesn't jump
const MAX_POINTERS = 10; // defensive ceiling, not a gameplay limit
const PINCH_WINDOW_MS = 150; // two touches must land within this of each other to start a pinch
// A second finger doesn't need to land on the shape itself — sausage fingers
// make that nearly impossible on a small shape. It only needs to land within
// this radius of the first finger's touch point.
//
// CSS px are a device-independent "reference pixel" fixed at 96px = 2.54cm
// (the ratio holds regardless of a device's real pixel density — see
// components/layout.jsx's `initial-scale=1, width=device-width` viewport
// tag), so a physical distance converts to a screen-independent px radius
// with no per-device adjustment needed. 10cm approximates a relaxed
// thumb-to-middle-finger spread at touch-down — wide enough for one hand's
// pinch, but not so wide it also swallows an unrelated touch nearby.
const CSS_PX_PER_CM = 96 / 2.54;
const PINCH_PARTNER_RADIUS = 10 * CSS_PX_PER_CM;
const DUST_VELOCITY_THRESHOLD = 5; // px/s below which a shape is considered stationary
// Every shape drifts at ~18px/s by default with no damping, so the velocity
// threshold above is effectively always true — spawning dust every frame for
// every shape would starve the particle buffer's rarer merge/collision
// effects. Throttled by tuning.dustFrameInterval, defaulting to roughly 1 in
// 3 frames. All of these are user-adjustable via the tuning panel (see
// TuningPanel.jsx) rather than fixed constants — see doodle.md conventions.
// driftMin/driftMax here are the app's chosen good-feel defaults, not
// doodleShapes' DEFAULT_DRIFT_MIN/DEFAULT_DRIFT_MAX (which stay 18/18 so
// library-level rng-parity tests are unaffected by this choice) — a real
// spread (some shapes drift slower, some faster) is what the tuning panel
// is for.
const DEFAULT_TUNING = {
  maxParticles: DEFAULT_MAX_PARTICLES,
  dustMaxAge: DEFAULT_DUST_MAX_AGE,
  dustFrameInterval: 30,
  driftMin: 20,
  driftMax: 100,
};

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
  const particlesRef = useRef([]);
  // Shared append point for every particle-spawning call site (dust, bounce,
  // merge, tap-squash, pop-burst) so they don't each hand-roll the same
  // array-spread.
  const addParticles = (newParticles) => {
    if (newParticles.length === 0) return;
    particlesRef.current = [...particlesRef.current, ...newParticles];
  };
  const [pulsingIds, setPulsingIds] = useState(new Set());
  const [muted, setMuted] = useState(false);
  const [trailsEnabled, setTrailsEnabled] = useState(true);

  const trailsEnabledRef = useRef(trailsEnabled);
  trailsEnabledRef.current = trailsEnabled;

  const [tuning, setTuning] = useState(DEFAULT_TUNING);
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const [tuningPanelOpen, setTuningPanelOpen] = useState(false);

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

  // Load + persist tuning-panel values (dust/particle/drift knobs). Merged
  // over the defaults rather than replacing them outright, so a stored value
  // from before a new tuning field existed doesn't leave that new field
  // undefined.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TUNING_KEY);
      if (stored) setTuning((t) => ({ ...t, ...JSON.parse(stored) }));
    } catch {
      // ignore — default tuning stays in effect
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TUNING_KEY, JSON.stringify(tuning));
    } catch {
      // ignore — tuning just won't persist
    }
  }, [tuning]);

  const handleTuningChange = (key, value) => {
    if (!Number.isFinite(value)) return;
    setTuning((t) => ({ ...t, [key]: value }));
  };
  const handleTuningReset = () => setTuning(DEFAULT_TUNING);

  // Single rAF drift loop. Every grabbed shape (drag or pinch member) is held still.
  useEffect(() => {
    let raf;
    let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Dust is throttled to roughly every 3rd frame (see DUST_FRAME_INTERVAL)
    // so ambient dust from every on-screen shape doesn't evict the rarer,
    // longer-lived merge-spiral/collision-spark particles from the
    // fixed-size particle buffer.
    let frameCount = 0;
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      particlesRef.current = advanceParticles(particlesRef.current, dt, tuningRef.current.maxParticles);
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        const grabbedIds = new Set();
        pointersRef.current.forEach((entry) => {
          if (entry.mode === 'drag' || entry.mode === 'pinch-member') grabbedIds.add(entry.shapeId);
        });
        const spawnDustThisFrame = frameCount % tuningRef.current.dustFrameInterval === 0;
        frameCount += 1;
        if (trailsEnabledRef.current && spawnDustThisFrame) {
          // Batch every shape's dust into one local array and append once,
          // instead of re-spreading the (up to MAX_PARTICLES-sized) particle
          // array once per qualifying shape.
          const dust = [];
          objectsRef.current.forEach((o) => {
            // A grabbed shape still has a (pre-grab) vx/vy, so it still
            // leaves a trail while being dragged — it's just not
            // pointer-delta-accurate, which is fine for a dust trail.
            if (o.kind !== 'shape') return;
            const speed = Math.hypot(o.vx, o.vy);
            if (speed > DUST_VELOCITY_THRESHOLD) {
              // Spawn at the trailing edge (the point on the shape's own
              // outline farthest behind its direction of travel), not the
              // center — a large, slow-drifting shape otherwise covers its
              // own dust and drifts past it only after the dust has already
              // faded out.
              const angle = Math.atan2(o.vy, o.vx);
              const radius = o.size / 2;
              const backX = o.x - Math.cos(angle) * radius;
              const backY = o.y - Math.sin(angle) * radius;
              dust.push(...spawnDust(backX, backY, o.vx, o.vy, o.color, tuningRef.current.dustMaxAge));
            }
          });
          addParticles(dust);
        }
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds);
        events.forEach((event) => {
          if (event.type === 'bounce') {
            addParticles(spawnBurst(event.x, event.y, event.color, event.normal, COLLISION_BURST_MAX_AGE));
          } else if (event.type === 'merge') {
            addParticles(spawnSpiral(event.fromX, event.fromY, event.x, event.y, event.color));
            soundRef.current.playNote(event.note);
          }
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Guarded: some test environments swap fake timers back to real ones
    // (vi.useRealTimers()) after stubbing cancelAnimationFrame, which can
    // leave it transiently undefined during unmount cleanup.
    return () => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); };
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
    const shape = objectsRef.current.find((o) => o.id === id);
    // Scale the proximity radius with the shape's own size so a tablet-scaled
    // (larger) shape stays just as forgiving to double-tap as a phone-scale one.
    const doubleTapRadius = DOUBLE_TAP_RADIUS * (shape?.sizeMultiplier || 1);
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < doubleTapRadius) {
      lastTapRef.current.delete(id);
      popShape(id, tuningRef.current.driftMin, tuningRef.current.driftMax);
      soundRef.current.playPop();
      if (shape) {
        addParticles(spawnBurst(shape.x, shape.y, shape.color));
      }
      return;
    }
    lastTapRef.current.set(id, { x, y, time: now });
    // Prune other shapes' stale tap entries — they're too old to complete a
    // double-tap anyway, so there's no reason to keep them around forever.
    lastTapRef.current.forEach((entry, shapeId) => {
      if (shapeId !== id && now - entry.time >= DOUBLE_TAP_MS) lastTapRef.current.delete(shapeId);
    });
    triggerPulse(id);
    if (shape) {
      soundRef.current.playNote(shape.note);
      addParticles(spawnSquashPoof(shape.x, shape.y, shape.color));
    }
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

    // The first finger targets the shape (must land on it); the second only
    // needs to land near the first finger's touch point — its own target is
    // irrelevant, so it can miss the shape entirely and still pinch it.
    const partnerEntry = [...pointersRef.current.entries()].find(([, entry]) => (
      entry.shapeId && entry.mode === null && !entry.moved
      && now - entry.downTime < PINCH_WINDOW_MS
      && Math.hypot(pt.x - entry.x, pt.y - entry.y) <= PINCH_PARTNER_RADIUS
    ));
    if (partnerEntry) {
      const [partnerId, partner] = partnerEntry;
      const pinchShapeId = partner.shapeId;
      const shape = objectsRef.current.find((o) => o.id === pinchShapeId);
      if (!shape) return;
      // Use the partner's live position, not its touchdown position — it may
      // have drifted (up to MOVE_THRESHOLD) before the second finger landed.
      const startDist = Math.max(Math.hypot(pt.x - partner.x, pt.y - partner.y), 1);
      const startAngle = Math.atan2(pt.y - partner.y, pt.x - partner.x) * (180 / Math.PI);
      // The resize ceiling is the shape's own spawn/merge range only when the
      // stage's real dimensions aren't available (e.g. unmocked in tests) —
      // otherwise it's raised to fill the stage, since min(width, height) is
      // the largest size advanceShape's bounce math can hold without jitter.
      const rect = svgRef.current?.getBoundingClientRect();
      const sizeMultiplier = shape.sizeMultiplier || 1;
      const maxSize = rect && rect.width && rect.height
        ? Math.min(rect.width, rect.height)
        : MAX_SIZE * sizeMultiplier;
      pinchesRef.current.set(pinchShapeId, {
        pointerIds: [partnerId, e.pointerId],
        startDist,
        startAngle,
        startSize: shape.size,
        startRotation: shape.rotation,
        sizeMultiplier,
        maxSize,
      });
      partner.mode = 'pinch-member';
      partner.moved = true;
      pointersRef.current.set(e.pointerId, {
        pointerId: e.pointerId, mode: 'pinch-member', shapeId: pinchShapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now,
      });
      return;
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
      // MIN_SIZE scales with the shape's own sizeMultiplier (a tablet-spawned
      // 2x shape pinches within its own larger range, not the phone-scale
      // range). MIN_SIZE*multiplier is the spawn floor, not a floor on every
      // shape — popped shards routinely start below it. Never snap a shape up
      // to that floor on the first pinch move; let it shrink further from
      // wherever it already was. maxSize was resolved once at pinch-start
      // (see onPointerDown) to the stage's own dimensions.
      const minSize = Math.min(MIN_SIZE * pinch.sizeMultiplier, pinch.startSize);
      const size = clamp(pinch.startSize * (liveDist / pinch.startDist), minSize, pinch.maxSize);
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
      const shape = spawnShape(
        pt.x,
        pt.y,
        sizeMultiplierRef.current,
        tuningRef.current.driftMin,
        tuningRef.current.driftMax,
      );
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
        <Particles particles={particlesRef.current} />
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
        <button
          type="button"
          className={styles.toolButton}
          aria-label={trailsEnabled ? 'Disable trails' : 'Enable trails'}
          onClick={() => setTrailsEnabled((t) => !t)}
        >
          {trailsEnabled ? '💨' : '🚫'}
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-label={tuningPanelOpen ? 'Close tuning panel' : 'Open tuning panel'}
          onClick={() => setTuningPanelOpen((o) => !o)}
        >
          ⚙️
        </button>
      </div>
      {tuningPanelOpen && (
        <TuningPanel
          tuning={tuning}
          onChange={handleTuningChange}
          onReset={handleTuningReset}
          onClose={() => setTuningPanelOpen(false)}
        />
      )}
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
