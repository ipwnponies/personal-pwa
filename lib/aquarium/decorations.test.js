import { describe, it, expect } from 'vitest';
import {
  DECORATION_TYPES,
  DEFAULT_DECORATION_TYPE,
  decorationKeys,
  getDecorationType,
} from './decorations';

describe('decorations config', () => {
  it('exposes at least one decoration type', () => {
    expect(decorationKeys().length).toBeGreaterThan(0);
  });

  it('has a default decoration type present in DECORATION_TYPES', () => {
    expect(DECORATION_TYPES[DEFAULT_DECORATION_TYPE]).toBeDefined();
  });

  it('every decoration type exposes key/name/emoji', () => {
    decorationKeys().forEach((key) => {
      const d = DECORATION_TYPES[key];
      expect(d.key).toBe(key);
      expect(typeof d.name).toBe('string');
      expect(typeof d.emoji).toBe('string');
    });
  });

  it('getDecorationType returns the requested type', () => {
    expect(getDecorationType(DEFAULT_DECORATION_TYPE).key).toBe(DEFAULT_DECORATION_TYPE);
  });

  it('getDecorationType falls back to the default for an unknown key', () => {
    expect(getDecorationType('not-a-decoration').key).toBe(DEFAULT_DECORATION_TYPE);
  });

  it('decorationKeys returns all five v1 types in unlock order', () => {
    expect(decorationKeys()).toEqual(['seaweed', 'coral', 'treasure', 'castle', 'bubblerock']);
  });
});
