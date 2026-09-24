import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import { useDoodleObjects } from '../../lib/useDoodleObjects';
import { createDoodleSound } from '../../lib/doodleSound';
import { createDoodleHaptics } from '../../lib/doodleHaptics';
import {
  DEFAULT_WALL_RESTITUTION, DEFAULT_STUCK_AFTER_S, DEFAULT_WALL_IMMUNITY_S,
} from '../../lib/doodleWalls';
import { clamp } from '../../lib/random';
import {
  MIN_SIZE, MAX_SIZE, DEFAULT_MAX_THROW_SPEED, THROW_SAMPLE_WINDOW_MS, throwVelocity,
  NOTES, scatterShapes, DEFAULT_SHAKE_IMPULSE, DEFAULT_MAX_SPEED,
} from '../../lib/doodleShapes';
import {
  useMotionPermission, PERMISSION_NEEDED, PERMISSION_DENIED,
} from '../../lib/useMotionPermission';
import { useShakeDetection } from '../../lib/useShakeDetection';
import {
  useDeviceTilt, tiltToAcceleration, tiltDampingFraction, DEFAULT_TILT_STRENGTH, DEFAULT_TILT_DAMPING,
} from '../../lib/useDeviceTilt';
import {
  spawnBurst, spawnSpiral, spawnSquashPoof, spawnDust, advanceParticles, COLLISION_BURST_MAX_AGE,
  DEFAULT_MAX_PARTICLES, DEFAULT_DUST_MAX_AGE,
} from '../../lib/doodleParticles';
import {
  DEFAULT_WELL_HOLD_MS, DEFAULT_WELL_MAX_SPEED, DEFAULT_WELL_RADIUS, DEFAULT_WELL_STRENGTH,
} from '../../lib/doodleWell';
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
const TILT_KEY = 'doodle-tilt';
const MODE_KEY = 'doodle-mode';
const TUNING_KEY = 'doodle-tuning';
const TIME_SCALE_KEY = 'doodle-time-scale';
// Multipliers applied to the frame delta, cycled by the toolbar button.
const TIME_SCALES = [1, 0.25, 0];
// Keyed by the current scale; like the mode and mute buttons, the label names
// what a click does next, not the current state.
const TIME_SCALE_LABELS = { 1: 'Slow motion', 0.25: 'Freeze', 0: 'Normal speed' };
const TIME_SCALE_ICONS = { 1: '▶️', 0.25: '🐢', 0: '⏸️' };
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
  maxThrowSpeed: DEFAULT_MAX_THROW_SPEED,
  wallRestitution: DEFAULT_WALL_RESTITUTION,
  stuckAfterS: DEFAULT_STUCK_AFTER_S,
  wallImmunityS: DEFAULT_WALL_IMMUNITY_S,
  shakeImpulse: DEFAULT_SHAKE_IMPULSE,
  maxSpeed: DEFAULT_MAX_SPEED,
  tiltStrength: DEFAULT_TILT_STRENGTH,
  tiltDamping: DEFAULT_TILT_DAMPING,
  wellRadius: DEFAULT_WELL_RADIUS,
  wellStrength: DEFAULT_WELL_STRENGTH,
  wellMaxSpeed: DEFAULT_WELL_MAX_SPEED,
  wellHoldMs: DEFAULT_WELL_HOLD_MS,
};

// A fixed C-E-A triad drawn from the pentatonic NOTES scale. Fixed rather
// than randomized so a shake always sounds like the same event, and
// consonant with whatever notes the shapes themselves are carrying.
const SHAKE_CHORD = [NOTES[0], NOTES[2], NOTES[4]];

export default function DoodleCanvas({ rng, sound }) {
  const {
    objects, spawnShape, startStroke, appendStrokePoint, moveShape, throwShape, transformShape,
    popShape, releaseShape, applyToShapes, advance, clear, restore,
  } = useDoodleObjects(rng);

  const svgRef = useRef(null);
  const soundRef = useRef(null);
  if (soundRef.current === null) soundRef.current = sound || createDoodleSound();

  const hapticsRef = useRef(null);
  if (hapticsRef.current === null) hapticsRef.current = createDoodleHaptics();

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
  // Default off: tilt fights the drawing and pinching gestures (those want a
  // flat, steady device), so it is opt-in rather than forced on everyone.
  const [tiltEnabled, setTiltEnabled] = useState(false);
  // 'shape': tap spawns a shape, drag on empty canvas is ignored. 'draw': drag
  // draws a stroke, tap draws a dot. Keeps the two interaction styles from
  // fighting each other (a drag meant to nudge a half-built shape no longer
  // leaves behind a stray doodle).
  const [mode, setMode] = useState('shape');
  const [timeScale, setTimeScale] = useState(1);
  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;

  // iOS gates devicemotion/deviceorientation behind a tap; everywhere else
  // `motionEnabled` is true from mount with no button ever shown.
  const { status: permissionStatus, request: requestMotionPermission, motionEnabled } = useMotionPermission();

  const trailsEnabledRef = useRef(trailsEnabled);
  trailsEnabledRef.current = trailsEnabled;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Subscribe to orientation only when the toggle is on **and** motion is
  // permitted (iOS gates deviceorientation the same way it gates devicemotion).
  const tiltActive = tiltEnabled && motionEnabled;
  const orientationRef = useDeviceTilt(tiltActive);
  const tiltActiveRef = useRef(tiltActive);
  tiltActiveRef.current = tiltActive;

  const [tuning, setTuning] = useState(DEFAULT_TUNING);
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const [tuningPanelOpen, setTuningPanelOpen] = useState(false);

  // Undo toast for the trash button: clear(kind) returns the objects it just
  // removed, and restore(removed) puts them back — see lib/useDoodleObjects.js.
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = useRef(null);

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
    hapticsRef.current.setMuted(muted);
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

  // Load + persist the tilt-gravity preference (default off — see the state
  // declaration above for why).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TILT_KEY);
      if (stored !== null) setTiltEnabled(stored === 'true');
    } catch {
      // ignore — default to disabled
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TILT_KEY, String(tiltEnabled));
    } catch {
      // ignore — preference just won't persist
    }
  }, [tiltEnabled]);

  // Load + persist the draw/shape mode preference.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      if (stored === 'draw' || stored === 'shape') setMode(stored);
    } catch {
      // ignore — default mode stays in effect
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore — preference just won't persist
    }
  }, [mode]);

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

  // Load + persist the slow-motion choice. A stored freeze (0) is coerced
  // back to 1: the app must never open frozen, because a kid cannot work out
  // why nothing moves.
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(TIME_SCALE_KEY));
      if (TIME_SCALES.includes(stored) && stored !== 0) setTimeScale(stored);
    } catch {
      // ignore — default to normal speed
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TIME_SCALE_KEY, String(timeScale));
    } catch {
      // ignore — preference just won't persist
    }
  }, [timeScale]);

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
      const rawDt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      // A frozen canvas skips the whole body rather than advancing with a
      // zero delta. Two parts of this loop are not dt-driven, so dt === 0
      // does not actually freeze anything: resolveCollisions is purely
      // positional, so already-overlapping shapes keep merging and
      // position-correcting; and dust spawning is gated on vx/vy, which a
      // zero delta never changes, while advanceParticles(p, 0) ages nothing
      // and its age < maxAge filter drops nothing — so particles pile up to
      // maxParticles and never expire. `last` is still updated above, or
      // unfreezing would feed one huge delta.
      if (timeScaleRef.current === 0) {
        // advanceParticles is the only place maxParticles gets enforced, and
        // it's skipped for the rest of this branch — but addParticles (tap
        // squash/burst) is still reachable while frozen, so particles would
        // otherwise grow unbounded for as long as the freeze lasts.
        const { maxParticles } = tuningRef.current;
        if (particlesRef.current.length > maxParticles) {
          particlesRef.current = particlesRef.current.slice(-maxParticles);
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = rawDt * timeScaleRef.current;
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
        const { beta, gamma } = orientationRef.current;
        const tiltOn = tiltActiveRef.current;
        const { tiltStrength } = tuningRef.current;
        const accel = tiltOn ? tiltToAcceleration(beta, gamma, tiltStrength) : undefined;
        // Damping is scaled by how strongly the device is actually tilted,
        // rather than applied at full strength whenever the toggle is
        // merely on. A flat desktop browser or a tablet resting level on a
        // table reports beta=gamma=0 while the toggle is on; applying full
        // damping there brought every shape to a dead stop within a few
        // seconds with no gravity to show for it.
        const tiltMagnitudeFraction = tiltOn ? tiltDampingFraction(beta, gamma, tiltStrength) : 0;
        // A coasting throw's ceiling must never sit below what the tuning
        // panel promises: throwVelocity clamps a release to
        // tuning.maxThrowSpeed, but this clamp runs every tick after that,
        // and tuning.maxSpeed defaults lower (600) than maxThrowSpeed's
        // usable range (up to 3000) — an unclamped max() would otherwise
        // silently undo a raised throw speed on the very next frame.
        // While tilt is on, though, this ceiling is the only thing standing
        // between a shape under constant acceleration and tunneling through
        // a drawn wall in one frame (see DEFAULT_MAX_SPEED in
        // doodleShapes.js) — raising it to match maxThrowSpeed there would
        // let sustained gravity, not just a one-shot throw, reach speeds the
        // wall-collision check was never sized for.
        const maxSpeed = tiltOn
          ? tuningRef.current.maxSpeed
          : Math.max(tuningRef.current.maxSpeed, tuningRef.current.maxThrowSpeed);
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds, {
          wallRestitution: tuningRef.current.wallRestitution,
          stuckAfterS: tuningRef.current.stuckAfterS,
          wallImmunityS: tuningRef.current.wallImmunityS,
          accel,
          damping: tiltOn ? tuningRef.current.tiltDamping * tiltMagnitudeFraction : 0,
          maxSpeed,
        });
        events.forEach((event) => {
          if (event.type === 'bounce' || event.type === 'wallBounce') {
            addParticles(spawnBurst(event.x, event.y, event.color, event.normal, COLLISION_BURST_MAX_AGE));
            hapticsRef.current.vibrate('bounce');
          } else if (event.type === 'merge') {
            addParticles(spawnSpiral(event.fromX, event.fromY, event.x, event.y, event.color));
            soundRef.current.playNote(event.note, event.shapeType);
            hapticsRef.current.vibrate('merge');
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

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  const showUndoToast = useCallback((message, onUndo) => {
    clearTimeout(undoTimerRef.current);
    setUndoToast({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoToast) return;
    clearTimeout(undoTimerRef.current);
    undoToast.onUndo();
    setUndoToast(null);
  }, [undoToast]);

  // Mode-scoped clear: clear(kind) returns exactly what it removed, so the
  // undo toast only ever offers back what this tap actually took away — a
  // shape-mode clear never resurrects strokes, and vice versa.
  const handleClear = useCallback(() => {
    const kind = mode === 'shape' ? 'shape' : 'stroke';
    const removed = clear(kind);
    if (removed.length === 0) return;
    const message = mode === 'shape' ? 'Shapes cleared' : 'Doodles cleared';
    showUndoToast(message, () => restore(removed));
  }, [mode, clear, restore, showUndoToast]);

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
      other.samples = [];
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
      hapticsRef.current.vibrate('pop');
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
      soundRef.current.playNote(shape.note, shape.shapeType);
      addParticles(spawnSquashPoof(shape.x, shape.y, shape.color));
    }
  };

  // A shake pushes every shape outward from the centre of the stage, sprays
  // a burst from each, and rolls a chord. Shapes are pushed, never popped —
  // a shake should feel like a big gust, not a reset.
  const handleShake = useCallback(() => {
    const shapes = objectsRef.current.filter((o) => o.kind === 'shape');
    if (shapes.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const centerX = (rect?.width || 0) / 2;
    const centerY = (rect?.height || 0) / 2;
    const { shakeImpulse, maxSpeed } = tuningRef.current;
    const burst = [];
    shapes.forEach((shape) => {
      burst.push(...spawnBurst(shape.x, shape.y, shape.color, null, COLLISION_BURST_MAX_AGE));
    });
    addParticles(burst);
    applyToShapes((current) => scatterShapes(current, centerX, centerY, rng, shakeImpulse, maxSpeed));
    soundRef.current.playChord(SHAKE_CHORD);
  }, [applyToShapes, rng]);

  useShakeDetection(handleShake);

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
        pointerId: e.pointerId, mode: 'inert', shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now, samples: [],
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
        pointerId: e.pointerId, mode: 'pinch-member', shapeId: pinchShapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: true, strokeId: null, downTime: now, samples: [],
      });
      return;
    }

    pointersRef.current.set(e.pointerId, {
      pointerId: e.pointerId, mode: null, shapeId, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, moved: false, strokeId: null, downTime: now, samples: [],
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
      } else if (modeRef.current === 'draw') {
        p.mode = 'draw';
        p.strokeId = startStroke(p.startX, p.startY);
        soundRef.current.playStroke();
      } else {
        // Shape mode: a drag that starts on empty canvas is ignored rather
        // than drawing a stroke, so building shapes doesn't accidentally
        // doodle.
        p.mode = 'inert';
        return;
      }
    }
    if (p.mode === 'drag') {
      // Sample the drag so pointerup can derive a release velocity. Trimmed
      // to the window on every move so the buffer stays ~6 entries at 60Hz.
      const t = Date.now();
      p.samples = p.samples.filter((s) => t - s.t <= THROW_SAMPLE_WINDOW_MS);
      p.samples.push({ x: pt.x, y: pt.y, t });
      moveShape(p.shapeId, pt.x, pt.y);
    } else if (p.mode === 'draw') appendStrokePoint(p.strokeId, pt.x, pt.y);
  };

  const onPointerUp = (e) => {
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    pointersRef.current.delete(e.pointerId);

    if (p.mode === 'inert') return;

    // A shape released from a drag or pinch may be sitting on top of a line.
    // Immunity lets it drift out under its own drift instead of being ejected.
    // A pinch's surviving pointer continues as a drag and grants again when it
    // finally lifts; re-granting is harmless.
    if (p.mode === 'drag' || p.mode === 'pinch-member') {
      releaseShape(p.shapeId, tuningRef.current.wallImmunityS);
    }

    if (p.mode === 'pinch-member') {
      endPinchMember(p, e.pointerId);
      return;
    }

    if (p.mode === 'drag') {
      // An empty samples buffer means no throwing gesture ever happened —
      // e.g. a pinch member promoted straight to drag (see endPinchMember)
      // and lifted before any pointermove. Leave the shape's existing
      // velocity (its ambient drift) alone rather than reading this as "held
      // still, throw at zero speed" and parking it. A real drag always has
      // at least one sample from onPointerMove, so this only catches the
      // pinch-handoff case.
      if (p.samples.length === 0) return;
      const { vx, vy } = throwVelocity(p.samples, Date.now(), tuningRef.current.maxThrowSpeed);
      throwShape(p.shapeId, vx, vy);
      return;
    }

    if (p.moved) return; // drag/draw already handled on move
    if (p.shapeId) {
      handleShapeTap(p.shapeId, p.startX, p.startY);
    } else if (modeRef.current === 'shape') {
      const pt = toLocal(e);
      const shape = spawnShape(
        pt.x,
        pt.y,
        sizeMultiplierRef.current,
        tuningRef.current.driftMin,
        tuningRef.current.driftMax,
      );
      soundRef.current.playNote(shape.note, shape.shapeType);
    } else {
      // Draw mode: a tap (no movement) draws a dot — a stroke whose two
      // points share the same spot, rendered as a filled circle by the
      // polyline's round linecap.
      const pt = toLocal(e);
      const strokeId = startStroke(pt.x, pt.y);
      appendStrokePoint(strokeId, pt.x, pt.y);
      soundRef.current.playStroke();
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
    if (p.mode === 'drag' || p.mode === 'pinch-member') {
      releaseShape(p.shapeId, tuningRef.current.wallImmunityS);
    }
    if (p.mode === 'pinch-member') endPinchMember(p, e.pointerId);
    // Same empty-samples guard as onPointerUp: a pinch survivor promoted to
    // 'drag' with samples reset to [] (see endPinchMember) that gets
    // cancelled before any pointermove never actually dragged, so leave its
    // existing drift velocity alone instead of zeroing it.
    else if (p.mode === 'drag' && p.samples.length > 0) throwShape(p.shapeId, 0, 0);
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
          aria-label={mode === 'shape' ? 'Switch to draw mode' : 'Switch to shape mode'}
          onClick={() => setMode((m) => (m === 'shape' ? 'draw' : 'shape'))}
        >
          {mode === 'shape' ? '⭐' : '✏️'}
        </button>
        <button
          type="button"
          className={styles.toolButton}
          aria-label={mode === 'shape' ? 'Clear shapes' : 'Clear doodles'}
          onClick={handleClear}
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
        {motionEnabled && (
          <button
            type="button"
            className={styles.toolButton}
            aria-label={tiltEnabled ? 'Disable tilt gravity' : 'Enable tilt gravity'}
            onClick={() => setTiltEnabled((t) => !t)}
          >
            {tiltEnabled ? '🌍' : '🌑'}
          </button>
        )}
        {(permissionStatus === PERMISSION_NEEDED || permissionStatus === PERMISSION_DENIED) && (
          <button
            type="button"
            className={styles.toolButton}
            aria-label={permissionStatus === PERMISSION_DENIED ? 'Motion controls blocked' : 'Enable motion controls'}
            onClick={requestMotionPermission}
          >
            {permissionStatus === PERMISSION_DENIED ? '🚷' : '📱'}
          </button>
        )}
        <button
          type="button"
          className={styles.toolButton}
          aria-label={TIME_SCALE_LABELS[timeScale]}
          onClick={() => setTimeScale(
            (t) => TIME_SCALES[(TIME_SCALES.indexOf(t) + 1) % TIME_SCALES.length],
          )}
        >
          {TIME_SCALE_ICONS[timeScale]}
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
      {undoToast && (
        <div className={styles.undoToast} role="status">
          <span>{undoToast.message}</span>
          <button type="button" className={styles.undoButton} onClick={handleUndo}>
            ↩️ Undo
          </button>
        </div>
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
    playChord: PropTypes.func.isRequired,
    setMuted: PropTypes.func.isRequired,
    isMuted: PropTypes.func.isRequired,
  }),
};

DoodleCanvas.defaultProps = {
  rng: Math.random,
  sound: null,
};
