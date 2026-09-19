import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { createDoodleHaptics, PATTERNS, MIN_INTERVAL_MS } from './doodleHaptics';

// jsdom has no navigator.vibrate, so define it per test rather than stubbing
// the whole navigator object.
function installVibrate() {
  const vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  return vibrate;
}

afterEach(() => {
  delete navigator.vibrate;
  vi.restoreAllMocks();
});

describe('doodleHaptics', () => {
  it('vibrates with the pattern for the event kind', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('pop')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(PATTERNS.pop);
  });

  it('no-ops when navigator.vibrate is unavailable', () => {
    const haptics = createDoodleHaptics();
    expect(() => haptics.vibrate('pop')).not.toThrow();
    expect(haptics.vibrate('pop')).toBe(false);
  });

  it('never throws when navigator.vibrate throws', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => { throw new Error('blocked'); },
      configurable: true,
    });
    const haptics = createDoodleHaptics();
    expect(() => haptics.vibrate('pop')).not.toThrow();
    expect(haptics.vibrate('pop')).toBe(false);
  });

  it('ignores an unknown kind', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('explode')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('rate-limits bounce on the wall clock, not on call count', () => {
    const vibrate = installVibrate();
    const now = vi.spyOn(Date, 'now');
    const haptics = createDoodleHaptics();

    now.mockReturnValue(1000);
    expect(haptics.vibrate('bounce')).toBe(true);
    // 50 more bounce pairs in the same frame: resolveCollisions emits one
    // event per colliding pair, so this is the spam case.
    for (let i = 0; i < 50; i += 1) expect(haptics.vibrate('bounce')).toBe(false);

    now.mockReturnValue(1000 + MIN_INTERVAL_MS.bounce - 1);
    expect(haptics.vibrate('bounce')).toBe(false);
    now.mockReturnValue(1000 + MIN_INTERVAL_MS.bounce);
    expect(haptics.vibrate('bounce')).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('never rate-limits pop, which is already gated by the double-tap', () => {
    installVibrate();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('pop')).toBe(true);
    expect(haptics.vibrate('pop')).toBe(true);
    expect(now).toHaveBeenCalled();
  });

  it('gates each kind independently so a bounce never suppresses a merge', () => {
    installVibrate();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const haptics = createDoodleHaptics();
    expect(haptics.vibrate('bounce')).toBe(true);
    expect(haptics.vibrate('merge')).toBe(true);
  });

  it('stays silent while muted', () => {
    const vibrate = installVibrate();
    const haptics = createDoodleHaptics();
    haptics.setMuted(true);
    expect(haptics.vibrate('pop')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    haptics.setMuted(false);
    expect(haptics.vibrate('pop')).toBe(true);
  });

  it('keeps every pattern shorter than its own gate so patterns never truncate each other', () => {
    // navigator.vibrate() replaces the running vibration rather than queueing.
    Object.keys(PATTERNS).forEach((kind) => {
      const total = PATTERNS[kind].reduce((sum, ms) => sum + ms, 0);
      if (MIN_INTERVAL_MS[kind] > 0) expect(total).toBeLessThan(MIN_INTERVAL_MS[kind]);
    });
  });
});
