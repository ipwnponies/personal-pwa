// A tiny Web Audio synth for the doodle sandbox. No audio assets: every sound
// is an oscillator + gain envelope. All access is guarded so SSR, a missing
// AudioContext, or a blocked autoplay policy degrade to a silent no-op.
// eslint-disable-next-line import/prefer-default-export
export function createDoodleSound() {
  let ctx = null;
  let muted = false;

  const ensureCtx = () => {
    if (typeof window === 'undefined') return null;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
    }
    return ctx;
  };

  const tone = (freq, { duration = 0.25, type = 'sine', gain = 0.2 } = {}) => {
    if (muted) return;
    const audio = ensureCtx();
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const now = audio.currentTime;
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(env);
      env.connect(audio.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // audio blocked/unavailable — sandbox stays silent, no crash
    }
  };

  return {
    playNote: (freq) => tone(freq, { type: 'sine', duration: 0.35, gain: 0.2 }),
    playStroke: () => tone(220, { type: 'triangle', duration: 0.12, gain: 0.12 }),
    playPop: () => tone(160, { type: 'square', duration: 0.15, gain: 0.15 }),
    setMuted: (value) => {
      muted = value;
    },
    isMuted: () => muted,
  };
}
