import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDoodleSound } from './doodleSound';

function installMockAudio() {
  const osc = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const createOscillator = vi.fn(() => osc);
  const createGain = vi.fn(() => gain);
  // Real constructor: vitest 4 arrow-fn mocks are not constructors, and the
  // production code calls `new AudioContext()`.
  function MockAudioContext() {
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = createOscillator;
    this.createGain = createGain;
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
  return { createOscillator, osc };
}

describe('doodleSound', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('playNote creates and starts an oscillator', () => {
    const { createOscillator, osc } = installMockAudio();
    const sound = createDoodleSound();
    sound.playNote(440);
    expect(createOscillator).toHaveBeenCalledTimes(1);
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.frequency.value).toBe(440);
  });

  it('does not play while muted', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.setMuted(true);
    sound.playNote(440);
    sound.playPop();
    sound.playStroke();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('no-ops when AudioContext is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sound = createDoodleSound();
    expect(() => sound.playNote(440)).not.toThrow();
  });
});
