import { useEffect, useRef } from 'react';
import { clamp } from './random';

// deviceorientation reports beta (front-back tilt, -180..180 degrees) and
// gamma (left-right tilt, -90..90 degrees). Only a modest tilt should be
// needed to move a shape, and gamma becomes numerically unstable as the
// device approaches vertical, so both are clamped before mapping.
export const TILT_MAX_DEGREES = 45;
// Acceleration applied at full clamped tilt (px/s^2). Tunable — see
// TuningPanel.jsx.
export const DEFAULT_TILT_STRENGTH = 400;
// Exponential velocity decay rate (1/s) applied only while tilt is on.
// Without it, a constant acceleration against the perfectly elastic wall
// bounce in advanceShape never settles — shapes buzz along the low edge
// forever and, being permanently overlapped, get eaten by the merge path
// in resolveCollisions.
export const DEFAULT_TILT_DAMPING = 1.2;

// Landscape is deliberately not handled: beta and gamma swap meaning when
// the screen rotates, so gravity points sideways there. The doodle stage is
// a portrait play surface, and a toddler-facing toggle is not worth an
// orientation matrix.
export function tiltToAcceleration(beta, gamma, strength = DEFAULT_TILT_STRENGTH) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { x: 0, y: 0 };
  const scale = (degrees) => (clamp(degrees, -TILT_MAX_DEGREES, TILT_MAX_DEGREES) / TILT_MAX_DEGREES)
    * strength;
  return { x: scale(gamma), y: scale(beta) };
}

// Fraction (0..1) of full damping strength to apply for a given tilt
// reading — how strongly the device is actually tilted, not just whether
// the toggle is on. A level device (beta=gamma=0) yields 0, so ordinary
// drift isn't damped away when tilt is merely enabled but the device is
// flat. Clamped to 1: tilting on both axes at once (e.g. held at a corner)
// gives an acceleration vector magnitude up to strength*sqrt(2), which
// would otherwise over-damp past the single-axis maximum this is
// calibrated against.
export function tiltDampingFraction(beta, gamma, strength = DEFAULT_TILT_STRENGTH) {
  if (strength <= 0) return 0;
  const { x, y } = tiltToAcceleration(beta, gamma, strength);
  return Math.min(1, Math.hypot(x, y) / strength);
}

// Returns a ref holding the latest raw reading rather than firing a callback
// per event: deviceorientation fires at roughly display rate, and the only
// consumer is the rAF loop, which wants whatever the current tilt is at the
// moment it ticks. Mapping to an acceleration is left to the caller so it
// can apply live tuning without re-subscribing.
export function useDeviceTilt(enabled) {
  const orientationRef = useRef({ beta: 0, gamma: 0 });

  useEffect(() => {
    if (!enabled) {
      // Snap back to level on disable so an in-flight tilt doesn't keep
      // pulling shapes after the toggle is switched off.
      orientationRef.current = { beta: 0, gamma: 0 };
      return undefined;
    }
    const handleOrientation = (event) => {
      orientationRef.current = {
        beta: Number.isFinite(event.beta) ? event.beta : 0,
        gamma: Number.isFinite(event.gamma) ? event.gamma : 0,
      };
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [enabled]);

  return orientationRef;
}
