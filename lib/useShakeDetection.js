import { useEffect, useRef } from 'react';

export const SHAKE_THRESHOLD = 15;
export const SHAKE_COOLDOWN_MS = 1000;

// eslint-disable-next-line import/prefer-default-export
export function useShakeDetection(onShake) {
  const lastMagnitudeRef = useRef(null);
  const lastShakeAtRef = useRef(0);

  useEffect(() => {
    const handleMotion = (event) => {
      const { x, y, z } = event.accelerationIncludingGravity || {};
      if (x == null || y == null || z == null) return;

      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const last = lastMagnitudeRef.current;
      lastMagnitudeRef.current = magnitude;
      if (last == null) return;

      const delta = Math.abs(magnitude - last);
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShakeAtRef.current > SHAKE_COOLDOWN_MS) {
        lastShakeAtRef.current = now;
        onShake();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [onShake]);
}
