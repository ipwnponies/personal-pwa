import { describe, it, expect } from 'vitest';
import { createSound, TONES } from './sound';

describe('createSound', () => {
  // jsdom has no AudioContext, so this exercises the graceful-no-op path.
  it('returns a controller with play and setEnabled', () => {
    const sound = createSound(true);
    expect(typeof sound.play).toBe('function');
    expect(typeof sound.setEnabled).toBe('function');
  });

  it('play never throws when AudioContext is unavailable', () => {
    const sound = createSound(true);
    expect(() => sound.play('nom')).not.toThrow();
    expect(() => sound.play('pop')).not.toThrow();
    expect(() => sound.play('unknown')).not.toThrow();
  });

  it('setEnabled(false) makes play a no-op without throwing', () => {
    const sound = createSound(true);
    sound.setEnabled(false);
    expect(() => sound.play('sparkle')).not.toThrow();
  });

  it('play never throws for the new unlock/refused cues', () => {
    const sound = createSound(true);
    expect(() => sound.play('unlock')).not.toThrow();
    expect(() => sound.play('refused')).not.toThrow();
  });
});

describe('TONES coverage', () => {
  // jsdom has no AudioContext, so play() short-circuits before ever touching
  // tone.freq/tone.type — the only thing verifiable in this environment is
  // the TONES data table itself, so assert real distinctness directly on it.
  it('unlock and refused are distinct from each other and from pop/sparkle', () => {
    const names = ['nom', 'pop', 'sparkle', 'unlock', 'refused'];
    names.forEach((a, i) => {
      names.slice(i + 1).forEach((b) => {
        const same = TONES[a].freq === TONES[b].freq && TONES[a].type === TONES[b].type;
        expect(same, `TONES.${a} and TONES.${b} should differ in freq and/or type`).toBe(false);
      });
    });
  });
});
