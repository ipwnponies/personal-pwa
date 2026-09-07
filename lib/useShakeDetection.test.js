import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShakeDetection, SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS } from './useShakeDetection';

function dispatchMotion(z) {
  const event = new Event('devicemotion');
  event.accelerationIncludingGravity = { x: 0, y: 0, z };
  window.dispatchEvent(event);
}

describe('useShakeDetection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onShake when the acceleration delta crosses the threshold', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);

    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a small acceleration delta', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(1);

    expect(onShake).not.toHaveBeenCalled();
  });

  it('does not re-fire within the cooldown window', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(start.getTime() + SHAKE_COOLDOWN_MS - 100));
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('fires again after the cooldown window passes', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(start.getTime() + SHAKE_COOLDOWN_MS + 100));
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(2);
  });

  it('ignores devicemotion events with missing acceleration data', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    window.dispatchEvent(new Event('devicemotion'));

    expect(onShake).not.toHaveBeenCalled();
  });
});
