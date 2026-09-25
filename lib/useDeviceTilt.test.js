import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDeviceTilt, tiltToAcceleration, tiltDampingFraction, TILT_MAX_DEGREES, DEFAULT_TILT_STRENGTH,
} from './useDeviceTilt';

function dispatchOrientation(beta, gamma) {
  const event = new Event('deviceorientation');
  event.beta = beta;
  event.gamma = gamma;
  window.dispatchEvent(event);
}

describe('tiltToAcceleration', () => {
  it('maps a level device to no acceleration', () => {
    expect(tiltToAcceleration(0, 0, 400)).toEqual({ x: 0, y: 0 });
  });

  it('maps full front tilt to full downward acceleration', () => {
    expect(tiltToAcceleration(TILT_MAX_DEGREES, 0, 400)).toEqual({ x: 0, y: 400 });
  });

  it('maps full back tilt to full upward acceleration', () => {
    expect(tiltToAcceleration(-TILT_MAX_DEGREES, 0, 400)).toEqual({ x: 0, y: -400 });
  });

  it('maps full right tilt to full rightward acceleration', () => {
    expect(tiltToAcceleration(0, TILT_MAX_DEGREES, 400)).toEqual({ x: 400, y: 0 });
  });

  it('clamps beyond the tilt ceiling instead of scaling past full strength', () => {
    expect(tiltToAcceleration(170, 0, 400)).toEqual({ x: 0, y: 400 });
  });

  it('scales linearly inside the tilt range', () => {
    const { y } = tiltToAcceleration(TILT_MAX_DEGREES / 2, 0, 400);
    expect(y).toBeCloseTo(200);
  });

  it('defaults strength to DEFAULT_TILT_STRENGTH', () => {
    expect(tiltToAcceleration(TILT_MAX_DEGREES, 0)).toEqual({ x: 0, y: DEFAULT_TILT_STRENGTH });
  });

  it('returns no acceleration for non-numeric readings', () => {
    expect(tiltToAcceleration(null, null, 400)).toEqual({ x: 0, y: 0 });
    expect(tiltToAcceleration(NaN, 0, 400)).toEqual({ x: 0, y: 0 });
  });
});

describe('tiltDampingFraction', () => {
  it('is 0 when level', () => {
    expect(tiltDampingFraction(0, 0, 400)).toBe(0);
  });

  it('is 1 at single-axis full tilt', () => {
    expect(tiltDampingFraction(TILT_MAX_DEGREES, 0, 400)).toBeCloseTo(1);
    expect(tiltDampingFraction(0, TILT_MAX_DEGREES, 400)).toBeCloseTo(1);
  });

  it('is clamped to 1 at diagonal full tilt, not sqrt(2)', () => {
    // Tilted to the ceiling on both axes at once (e.g. held at a corner):
    // the mapped acceleration vector's magnitude is strength*sqrt(2), which
    // would over-damp past the single-axis maximum if left unclamped.
    expect(tiltDampingFraction(TILT_MAX_DEGREES, TILT_MAX_DEGREES, 400)).toBeCloseTo(1);
  });

  it('scales linearly between level and full tilt', () => {
    expect(tiltDampingFraction(TILT_MAX_DEGREES / 2, 0, 400)).toBeCloseTo(0.5);
  });

  it('is 0 when strength is non-positive', () => {
    expect(tiltDampingFraction(TILT_MAX_DEGREES, 0, 0)).toBe(0);
    expect(tiltDampingFraction(TILT_MAX_DEGREES, 0, -400)).toBe(0);
  });
});

describe('useDeviceTilt', () => {
  it('records the latest orientation while enabled', () => {
    const { result } = renderHook(() => useDeviceTilt(true));
    dispatchOrientation(20, -10);
    expect(result.current.current).toEqual({ beta: 20, gamma: -10 });
  });

  it('ignores orientation events while disabled', () => {
    const { result } = renderHook(() => useDeviceTilt(false));
    dispatchOrientation(20, -10);
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });

  it('resets to level when disabled, so gravity stops immediately', () => {
    const { result, rerender } = renderHook(({ on }) => useDeviceTilt(on), {
      initialProps: { on: true },
    });
    dispatchOrientation(30, 30);
    expect(result.current.current.beta).toBe(30);
    rerender({ on: false });
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });

  it('treats a null reading as level', () => {
    const { result } = renderHook(() => useDeviceTilt(true));
    dispatchOrientation(null, null);
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });
});
