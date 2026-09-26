import { useCallback, useEffect, useState } from 'react';

// iOS Safari 13+ refuses to deliver devicemotion/deviceorientation events
// until the page calls DeviceMotionEvent.requestPermission() (and the
// orientation equivalent) from inside a user gesture. Android and desktop
// expose no requestPermission at all and deliver both events
// unconditionally, so `typeof ...requestPermission !== 'function'` is the
// "no gate here" signal.
export const PERMISSION_UNKNOWN = 'unknown';
export const PERMISSION_NEEDED = 'needed';
export const PERMISSION_NOT_NEEDED = 'not-needed';
export const PERMISSION_GRANTED = 'granted';
export const PERMISSION_DENIED = 'denied';

const requesterFor = (name) => {
  const Ctor = globalThis[name];
  if (!Ctor || typeof Ctor.requestPermission !== 'function') return null;
  return () => Ctor.requestPermission();
};

// Both APIs are gated independently on iOS. Shake needs devicemotion and
// tilt needs deviceorientation, so ask for whichever of the two actually
// gates — one user tap covers both.
export function motionPermissionRequesters() {
  return [requesterFor('DeviceMotionEvent'), requesterFor('DeviceOrientationEvent')]
    .filter(Boolean);
}

export function useMotionPermission() {
  // Resolved in a mount effect rather than a lazy initializer: the doodle
  // page server-renders, where these globals don't exist, so deciding at
  // first render would diverge from the server HTML and trip a hydration
  // mismatch (same rule as the localStorage read in useDoodleObjects).
  const [status, setStatus] = useState(PERMISSION_UNKNOWN);

  useEffect(() => {
    setStatus(motionPermissionRequesters().length > 0 ? PERMISSION_NEEDED : PERMISSION_NOT_NEEDED);
  }, []);

  const request = useCallback(async () => {
    const requesters = motionPermissionRequesters();
    if (requesters.length === 0) {
      setStatus(PERMISSION_NOT_NEEDED);
      return PERMISSION_NOT_NEEDED;
    }
    let next = PERMISSION_GRANTED;
    try {
      const results = await Promise.all(requesters.map((requestOne) => requestOne()));
      if (results.some((result) => result !== 'granted')) next = PERMISSION_DENIED;
    } catch {
      // Thrown when called outside a user gesture, or on a browser that
      // exposes requestPermission but rejects it — treat as a refusal.
      next = PERMISSION_DENIED;
    }
    setStatus(next);
    return next;
  }, []);

  return {
    status,
    request,
    motionEnabled: status === PERMISSION_GRANTED || status === PERMISSION_NOT_NEEDED,
  };
}
