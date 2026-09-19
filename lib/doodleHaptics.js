// Touch feedback for the doodle sandbox, mirroring doodleSound.js: every
// access is guarded so a missing API or a blocked call degrades to a silent
// no-op instead of throwing.
//
// Platform note: the Vibration API is a W3C spec implemented by Blink and
// Gecko, not by WebKit. That is an engine gap, not an OS one — WebKit on any
// platform lacks it. Because iOS forces every browser onto WebKit, this is an
// Android-only feature in practice, and feature-detects away elsewhere.

// Short and distinct per kind. A pop is the only one with texture (two
// pulses) because it is the rarest and most deliberate.
export const PATTERNS = {
  pop: [18, 30, 18],
  merge: [25],
  bounce: [10],
};

// Wall-clock minimum between vibrations of the same kind. resolveCollisions
// emits one bounce event per colliding pair per frame, so an unguarded call
// buzzes continuously once there are a few shapes. Coalescing per rAF tick
// would bound the work but not the rate — a tick is a frame, so the ceiling
// would be 60/s on one device and 120/s on another. A wall-clock gate is
// O(1) per event and independent of both frame rate and shape count.
//
// pop is ungated: a double-tap is already human-rate-limited, and it is the
// one event that must never be swallowed. Each pattern above is shorter than
// its own gate, because navigator.vibrate() replaces the running vibration
// rather than queueing it.
export const MIN_INTERVAL_MS = {
  pop: 0,
  merge: 40,
  bounce: 100,
};

// eslint-disable-next-line import/prefer-default-export
export function createDoodleHaptics() {
  let muted = false;
  const lastAt = { pop: 0, merge: 0, bounce: 0 };

  return {
    // Returns true only when navigator.vibrate was actually called.
    vibrate: (kind) => {
      if (muted) return false;
      const pattern = PATTERNS[kind];
      if (!pattern) return false;
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
      const now = Date.now();
      if (now - lastAt[kind] < MIN_INTERVAL_MS[kind]) return false;
      try {
        navigator.vibrate(pattern);
      } catch {
        return false; // vibration blocked by policy — stay silent, no crash
      }
      lastAt[kind] = now;
      return true;
    },
    setMuted: (value) => {
      muted = value;
    },
  };
}
