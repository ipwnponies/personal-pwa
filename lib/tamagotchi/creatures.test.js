import { describe, it, expect } from 'vitest';
import { getPetType, spriteMood, petKeys, DEFAULT_PET, PETS, getSprite } from './creatures';

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

describe('PETS.blob.sprite shape', () => {
  const moods = ['normal', 'hungry', 'sad', 'asleep', 'sick'];
  const forms = ['balanced', 'fedHeavy', 'playHeavy', 'sleepHeavy', 'efficient'];

  it('has every mood key at the baby and child stages', () => {
    moods.forEach((mood) => {
      expect(PETS.blob.sprite.baby[mood]).toBeDefined();
      expect(PETS.blob.sprite.child[mood]).toBeDefined();
    });
  });

  it('has every form, each with every mood key, at the adult stage', () => {
    forms.forEach((form) => {
      expect(PETS.blob.sprite.adult[form]).toBeDefined();
      moods.forEach((mood) => {
        expect(PETS.blob.sprite.adult[form][mood]).toBeDefined();
      });
    });
  });
});

describe('getSprite', () => {
  const blob = getPetType('blob');

  it('looks up baby/child sprites directly by mood', () => {
    expect(getSprite(blob, 'baby', null, 'normal')).toBe('🥚');
    expect(getSprite(blob, 'child', null, 'asleep')).toBe('💤');
  });

  it('looks up adult sprites by form and mood', () => {
    expect(getSprite(blob, 'adult', 'fedHeavy', 'normal')).toBe('🐥');
  });

  it('falls back to balanced for a null or unrecognized adult form', () => {
    expect(getSprite(blob, 'adult', null, 'normal')).toBe(PETS.blob.sprite.adult.balanced.normal);
    expect(getSprite(blob, 'adult', 'nonexistent', 'normal')).toBe(PETS.blob.sprite.adult.balanced.normal);
  });

  it('falls back to normal for an unrecognized mood', () => {
    expect(getSprite(blob, 'baby', null, 'nonexistent')).toBe(PETS.blob.sprite.baby.normal);
  });
});
