import { describe, it, expect } from 'vitest';
import { SPECIES, DEFAULT_SPECIES, getSpecies, speciesKeys } from './creatures';

describe('creatures config', () => {
  it('exposes at least one species', () => {
    expect(speciesKeys().length).toBeGreaterThan(0);
  });

  it('has a default species present in SPECIES', () => {
    expect(SPECIES[DEFAULT_SPECIES]).toBeDefined();
  });

  it('every species exposes the fields render and simulation need', () => {
    speciesKeys().forEach((key) => {
      const s = SPECIES[key];
      expect(s.key).toBe(key);
      expect(typeof s.name).toBe('string');
      expect(typeof s.hueDeg).toBe('number');
      ['baby', 'child', 'adult'].forEach((stage) => {
        expect(typeof s.emoji[stage]).toBe('string');
        expect(typeof s.sizePx[stage]).toBe('number');
      });
    });
  });

  it('getSpecies returns the requested species', () => {
    expect(getSpecies(DEFAULT_SPECIES).key).toBe(DEFAULT_SPECIES);
  });

  it('getSpecies falls back to default for an unknown key', () => {
    expect(getSpecies('not-a-species').key).toBe(DEFAULT_SPECIES);
  });
});

describe('sizePx', () => {
  it('is doubled for touch-table use, uniformly across species', () => {
    speciesKeys().forEach((key) => {
      expect(SPECIES[key].sizePx).toEqual({ baby: 60, child: 84, adult: 108 });
    });
  });
});
