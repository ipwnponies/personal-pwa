import { describe, it, expect } from 'vitest';
import { getPetType, spriteMood, petKeys, DEFAULT_PET } from './creatures';

describe('getPetType', () => {
  it('returns the matching pet type', () => {
    expect(getPetType('blob').key).toBe('blob');
  });

  it('falls back to the default for an unknown key', () => {
    expect(getPetType('nonexistent').key).toBe(DEFAULT_PET);
  });
});

describe('petKeys', () => {
  it('lists at least the default pet', () => {
    expect(petKeys()).toContain(DEFAULT_PET);
  });
});

describe('spriteMood', () => {
  const base = { hunger: 100, happiness: 100, asleep: false };

  it('is asleep when the pet is asleep, regardless of needs', () => {
    expect(spriteMood({ ...base, asleep: true, hunger: 0 }, 60)).toBe('asleep');
  });

  it('is hungry when hunger is below threshold', () => {
    expect(spriteMood({ ...base, hunger: 10 }, 60)).toBe('hungry');
  });

  it('is sad when happiness is below threshold', () => {
    expect(spriteMood({ ...base, happiness: 10 }, 60)).toBe('sad');
  });

  it('is normal when all needs are met', () => {
    expect(spriteMood(base, 60)).toBe('normal');
  });
});
