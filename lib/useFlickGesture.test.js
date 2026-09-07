import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlickGesture, FLICK_DISTANCE_THRESHOLD, FLICK_MAX_DURATION_MS } from './useFlickGesture';

function touchStartEvent(clientX, clientY) {
  return { touches: [{ clientX, clientY }] };
}

function touchEndEvent(clientX, clientY) {
  return { changedTouches: [{ clientX, clientY }] };
}

describe('useFlickGesture', () => {
  it('fires onFlick for a fast, far touch sequence', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });
    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD + 10));
    });

    expect(onFlick).toHaveBeenCalledTimes(1);
    expect(onFlick.mock.calls[0][0].distance).toBeGreaterThanOrEqual(FLICK_DISTANCE_THRESHOLD);
  });

  it('does not fire for a touch that does not travel far enough', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });
    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD - 10));
    });

    expect(onFlick).not.toHaveBeenCalled();
  });

  it('does not fire for a slow touch even if far enough', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });

    vi.setSystemTime(new Date(start.getTime() + FLICK_MAX_DURATION_MS + 50));

    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD + 10));
    });

    expect(onFlick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores a touchend with no matching touchstart', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, 100));
    });

    expect(onFlick).not.toHaveBeenCalled();
  });
});
