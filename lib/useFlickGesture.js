import { useCallback, useRef } from 'react';

export const FLICK_DISTANCE_THRESHOLD = 40;
export const FLICK_MAX_DURATION_MS = 400;

// eslint-disable-next-line import/prefer-default-export
export function useFlickGesture(onFlick) {
  const touchRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current) return;
      const { startX, startY, startTime } = touchRef.current;
      touchRef.current = null;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const distance = Math.hypot(dx, dy);
      const duration = Date.now() - startTime;

      if (distance >= FLICK_DISTANCE_THRESHOLD && duration <= FLICK_MAX_DURATION_MS) {
        e.stopPropagation();
        onFlick({ dx, dy, distance, duration });
      }
    },
    [onFlick],
  );

  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}
