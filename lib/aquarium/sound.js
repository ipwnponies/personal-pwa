// Short synthesized cues via WebAudio. No audio-file dependencies. Silent and
// safe when AudioContext is unavailable (jsdom, older browsers).
const TONES = {
  nom: { freq: 220, type: 'square', ms: 90 },
  pop: { freq: 520, type: 'triangle', ms: 80 },
  sparkle: { freq: 880, type: 'sine', ms: 140 },
};

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

// eslint-disable-next-line import/prefer-default-export
export const createSound = (enabled = true) => {
  let isEnabled = enabled;
  let ctx = null;

  const ensureCtx = () => {
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const play = (name) => {
    if (!isEnabled) return;
    const tone = TONES[name];
    if (!tone) return;
    const audio = ensureCtx();
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.12, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + tone.ms / 1000);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + tone.ms / 1000);
    } catch {
      // ignore audio failures — sound is non-essential
    }
  };

  const setEnabled = (value) => {
    isEnabled = value;
  };

  return { play, setEnabled };
};
