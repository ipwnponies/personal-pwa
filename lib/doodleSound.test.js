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

  it('maps each shapeType to its own oscillator type', () => {
    const cases = [
      ['circle', 'sine'],
      ['square', 'square'],
      ['triangle', 'triangle'],
      ['star', 'sawtooth'],
    ];
    cases.forEach(([shapeType, expected]) => {
      const { osc } = installMockAudio();
      const sound = createDoodleSound();
      sound.playNote(440, shapeType);
      expect(osc.type).toBe(expected);
      vi.unstubAllGlobals();
    });
  });

  it('falls back to sine for a missing or unknown shapeType', () => {
    const { osc } = installMockAudio();
    const sound = createDoodleSound();
    sound.playNote(440);
    expect(osc.type).toBe('sine');
    sound.playNote(440, 'hexagon');
    expect(osc.type).toBe('sine');
  });

  it('playChord creates one oscillator per frequency', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.playChord([261.63, 329.63, 440]);
    expect(createOscillator).toHaveBeenCalledTimes(3);
  });

  it('playChord stays silent when muted', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.setMuted(true);
    sound.playChord([261.63, 329.63, 440]);
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('playChord tolerates an empty frequency list', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.playChord([]);
    expect(createOscillator).not.toHaveBeenCalled();
  });
});
