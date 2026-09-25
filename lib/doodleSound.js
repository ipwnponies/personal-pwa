// A tiny Web Audio synth for the doodle sandbox. No audio assets: every sound
// is an oscillator + gain envelope. All access is guarded so SSR, a missing
// AudioContext, or a blocked autoplay policy degrade to a silent no-op.

// Each shape gets its own voice so a circle and a star at the same pitch are
// distinguishable by ear. The map lives here, not in DoodleCanvas: call sites
// pass a shapeType and never name an oscillator type.
const OSC_BY_SHAPE = {
  circle: 'sine',
  square: 'square',
  triangle: 'triangle',
  star: 'sawtooth',
};

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

  const tone = (freq, {
    duration = 0.25, type = 'sine', gain = 0.2, delay = 0,
  } = {}) => {
    if (muted) return;
    const audio = ensureCtx();
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const now = audio.currentTime + delay;
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
    playNote: (freq, shapeType) => tone(freq, {
      type: OSC_BY_SHAPE[shapeType] || 'sine', duration: 0.35, gain: 0.2,
    }),
    playStroke: () => tone(220, { type: 'triangle', duration: 0.12, gain: 0.12 }),
    playPop: () => tone(160, { type: 'square', duration: 0.15, gain: 0.15 }),
    // A rolled chord: same envelope as playNote, but each note starts 60ms
    // after the previous one so the notes read as an arpeggio rather than
    // one thick blob. Scheduled on the AudioContext clock rather than with
    // setTimeout, so it stays synchronous and doesn't drift.
    playChord: (freqs) => freqs.forEach((freq, i) => tone(freq, {
      type: 'sine', duration: 0.5, gain: 0.15, delay: i * 0.06,
    })),
    playWell: () => tone(110, { type: 'sine', duration: 0.4, gain: 0.15 }),
    setMuted: (value) => {
      muted = value;
    },
    isMuted: () => muted,
  };
}
