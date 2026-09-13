import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRandomSound, RANDOM_CUES } from './randomSound';

function installMockAudio() {
  const createOscillator = vi.fn(() => ({
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  const createGain = vi.fn(() => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }));
  // Real constructor: vitest 4 arrow-fn mocks are not constructors, and the
  // production code calls `new AudioContext()`.
  function MockAudioContext() {
    this.currentTime = 0;
    this.destination = {};
    this.state = 'running';
    this.resume = vi.fn();
    this.createOscillator = createOscillator;
    this.createGain = createGain;
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
  return { createOscillator, createGain };
}

const CUE_NAMES = Object.keys(RANDOM_CUES);

describe('createRandomSound', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe.each(CUE_NAMES)('%s cue', (cueName) => {
    it('creates oscillators when played', () => {
      const { createOscillator } = installMockAudio();
      const sound = createRandomSound(true);
      sound.play(cueName);
      expect(createOscillator).toHaveBeenCalled();
    });

    it('creates one oscillator per note', () => {
      const { createOscillator } = installMockAudio();
      const sound = createRandomSound(true);
      sound.play(cueName);
      expect(createOscillator).toHaveBeenCalledTimes(RANDOM_CUES[cueName].notes.length);
    });
  });

  it('setEnabled(false) creates no oscillators', () => {
    const { createOscillator } = installMockAudio();
    const sound = createRandomSound(true);
    sound.setEnabled(false);
    sound.play('roll');
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('an unknown cue name creates no oscillators and does not throw', () => {
    const { createOscillator } = installMockAudio();
    const sound = createRandomSound(true);
    expect(() => sound.play('not-a-real-cue')).not.toThrow();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('does not throw when there is no AudioContext on the global', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sound = createRandomSound(true);
    expect(() => sound.play('roll')).not.toThrow();
  });

  it('caches a throwing AudioContext constructor and never retries it', () => {
    const ctor = vi.fn(() => {
      throw new Error('audio hardware unavailable');
    });
    vi.stubGlobal('AudioContext', ctor);
    const sound = createRandomSound(true);

    expect(() => sound.play('roll')).not.toThrow();
    expect(() => sound.play('roll')).not.toThrow();

    expect(ctor).toHaveBeenCalledTimes(1);
  });
});

describe('RANDOM_CUES distinctness', () => {
  // Actual audible output isn't asserted anywhere (jsdom has no
  // AudioContext); this checks the ear-level distinctness guarantee — no
  // two cues collapse into the same wave type + note count + first
  // frequency — directly on the data table instead.
  it('no two cues share the same wave type, note count, and first frequency', () => {
    const seen = new Map();
    Object.entries(RANDOM_CUES).forEach(([name, cue]) => {
      const key = `${cue.type}:${cue.notes.length}:${cue.notes[0].freq}`;
      expect(seen.has(key), `${name} collides with ${seen.get(key)} on ${key}`).toBe(false);
      seen.set(key, name);
    });
  });
});
