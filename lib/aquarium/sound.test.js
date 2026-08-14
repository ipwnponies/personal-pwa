import { describe, it, expect } from 'vitest';
import { createSound } from './sound';

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
});
