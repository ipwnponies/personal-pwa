// Short synthesized cues via WebAudio for the Random page's six primary
// actions. No audio-file dependencies. Silent and safe when AudioContext is
// unavailable (SSR, jsdom, older browsers) — sound is never load-bearing.
// Each cue is a short note sequence (not a single tone) so the six cues stay
// distinguishable by ear; see RANDOM_CUES_DISTINCTNESS test for the guarantee
// that no two collapse into the same wave type + note count + first note.
export const RANDOM_CUES = {
  roll: {
    type: 'square',
    notes: [
      { freq: 440, ms: 60 },
      { freq: 330, ms: 60 },
      { freq: 260, ms: 60 },
    ],
  },
  pick: {
    type: 'sine',
    notes: [
      { freq: 520, ms: 90 },
      { freq: 780, ms: 140 },
    ],
  },
  flip: {
    type: 'triangle',
    notes: [
      { freq: 660, ms: 70 },
      { freq: 990, ms: 110 },
    ],
  },
  shake: {
    type: 'sawtooth',
    notes: [
      { freq: 180, ms: 70 },
      { freq: 140, ms: 70 },
      { freq: 180, ms: 70 },
    ],
  },
  shuffle: {
    type: 'triangle',
    notes: [
      { freq: 300, ms: 45 },
      { freq: 380, ms: 45 },
      { freq: 460, ms: 45 },
      { freq: 540, ms: 45 },
    ],
  },
  draw: {
    type: 'sine',
    notes: [
      { freq: 700, ms: 70 },
      { freq: 880, ms: 110 },
    ],
  },
};

const getAudioContextCtor = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

export const createRandomSound = (enabled = true) => {
  let isEnabled = enabled;
  let ctx = null;
  // Separate from `ctx` so a throwing constructor is distinguishable from
  // "not constructed yet": once construction has failed once, every later
  // play() is a silent no-op instead of retrying (and likely re-throwing)
  // the same failing constructor on every call.
  let ctorFailed = false;

  // Lazy: no AudioContext is constructed until the first play(). A user who
  // never triggers an action never creates one.
  const ensureCtx = () => {
    if (ctx) return ctx;
    if (ctorFailed) return null;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctorFailed = true;
      return null;
    }
    return ctx;
  };

  const play = (cueName) => {
    if (!isEnabled) return;
    const cue = RANDOM_CUES[cueName];
    if (!cue) return;
    const audio = ensureCtx();
    if (!audio) return;
    try {
      if (audio.state === 'suspended') {
        // resume() returns a promise that rejects if the browser refuses
        // (e.g. no user-gesture yet on some engines); swallow it the same
        // way the surrounding try/catch swallows every other audio failure.
        // Guarded rather than a bare `.catch` since test doubles for
        // AudioContext may not return a real promise.
        const resumed = audio.resume();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(() => {});
        }
      }
      // One baseline read per play() call, not per note: audio.currentTime
      // advances with real elapsed time, so re-reading it inside the loop
      // would let wall-clock time between iterations creep into each
      // note's offset instead of the fixed per-note durations below.
      const baseTime = audio.currentTime;
      let offset = 0;
      cue.notes.forEach(({ freq, ms }) => {
        const startTime = baseTime + offset;
        const endTime = startTime + ms / 1000;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = cue.type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, endTime);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(startTime);
        osc.stop(endTime);
        offset += ms / 1000;
      });
    } catch {
      // ignore audio failures — sound is non-essential
    }
  };

  const setEnabled = (value) => {
    isEnabled = value;
  };

  return { play, setEnabled };
};
