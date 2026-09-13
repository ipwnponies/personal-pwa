import { describe, it, expect } from 'vitest';
import { getPetType, spriteMood, petKeys, DEFAULT_PET, PETS, getSprite, resolveForm } from './creatures';

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
  const base = { hunger: 100, happiness: 100, asleep: false, sick: false };

  it('is asleep when the pet is asleep, regardless of needs', () => {
    expect(spriteMood({ ...base, asleep: true, hunger: 0 }, 60)).toBe('asleep');
  });

  it('is sick when the pet is sick, taking priority over hungry/sad but not asleep', () => {
    expect(spriteMood({ ...base, sick: true, hunger: 0 }, 60)).toBe('sick');
    expect(spriteMood({ ...base, sick: true, asleep: true }, 60)).toBe('asleep');
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

describe('every species sprite table', () => {
  const moods = ['normal', 'hungry', 'sad', 'asleep', 'sick'];
  const verdicts = ['balanced', 'fedHeavy', 'playHeavy', 'sleepHeavy', 'efficient'];

  petKeys().forEach((key) => {
    describe(key, () => {
      const petType = PETS[key];

      it('has every mood key at the baby and child stages', () => {
        moods.forEach((mood) => {
          expect(petType.sprite.baby[mood]).toBeDefined();
          expect(petType.sprite.child[mood]).toBeDefined();
        });
      });

      it('maps every verdict to a declared form', () => {
        verdicts.forEach((verdict) => {
          expect(petType.forms[verdict]).toBeDefined();
        });
      });

      it('has a sprite table with every mood key for every declared form', () => {
        Object.values(petType.forms).forEach((form) => {
          expect(petType.sprite.adult[form]).toBeDefined();
          moods.forEach((mood) => {
            expect(petType.sprite.adult[form][mood]).toBeDefined();
          });
        });
      });

      it('has a defaultForm that exists in its adult sprite table', () => {
        expect(petType.sprite.adult[petType.defaultForm]).toBeDefined();
      });
    });
  });
});

describe('species branch sets', () => {
  it('gives sprout one form shared by the sleepHeavy and efficient verdicts', () => {
    const sprout = getPetType('sprout');
    expect(resolveForm(sprout, 'sleepHeavy')).toBe('evergreen');
    expect(resolveForm(sprout, 'efficient')).toBe('evergreen');
    expect(resolveForm(sprout, 'fedHeavy')).toBe('fruit');
  });

  it('gives ember three forms covering all five verdicts', () => {
    const ember = getPetType('ember');
    expect(new Set(Object.values(ember.forms)).size).toBe(3);
    expect(resolveForm(ember, 'balanced')).toBe('hearth');
    expect(resolveForm(ember, 'efficient')).toBe('hearth');
    expect(resolveForm(ember, 'playHeavy')).toBe('wildfire');
    expect(resolveForm(ember, 'sleepHeavy')).toBe('wildfire');
    expect(resolveForm(ember, 'fedHeavy')).toBe('forge');
  });

  it('falls back to each species own defaultForm, not to balanced', () => {
    // Blob's defaultForm IS 'balanced', so only a species without a balanced
    // form can catch a regression in getSprite's adult fallback.
    expect(getSprite(getPetType('ember'), 'adult', null, 'normal')).toBe('🏮');
    expect(getSprite(getPetType('sprout'), 'adult', 'nonexistent', 'normal')).toBe('🌸');
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

describe('resolveForm', () => {
  const blob = getPetType('blob');

  it('maps a verdict to that species form key', () => {
    expect(resolveForm(blob, 'fedHeavy')).toBe('fedHeavy');
    expect(resolveForm(blob, 'balanced')).toBe('balanced');
  });

  it('falls back to the species defaultForm for an unrecognized verdict', () => {
    expect(resolveForm(blob, 'nonexistent')).toBe(blob.defaultForm);
  });
});
