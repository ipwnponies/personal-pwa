// The theming layer. Game logic references pet type by key only, so adding a
// second pet (egg colors, alt sprites, etc.) later is an edit to this file
// alone. Placeholder emoji sprite set for the scaffold — swap for real art
// once brainstorming settles on a look.
export const PETS = {
  blob: {
    key: 'blob',
    name: 'Blob',
    sprite: {
      baby: { normal: '🥚', hungry: '🥚', sad: '🥚', asleep: '🥚', sick: '🥚' },
      child: { normal: '🐣', hungry: '🐣', sad: '🐣', asleep: '💤', sick: '🐣' },
      adult: {
        balanced: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        fedHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        playHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        sleepHeavy: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
        efficient: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤', sick: '🐤' },
      },
    },
  },
};

export const DEFAULT_PET = 'blob';

export const petKeys = () => Object.keys(PETS);

export const getPetType = (key) => PETS[key] || PETS[DEFAULT_PET];

// Which sprite variant to show for a stage, given current state — mirrors
// the aquarium's hungry/sad CSS classes but folded into sprite selection
// since a tamagotchi is a single stationary sprite, not a styled div.
export const spriteMood = (pet, metThreshold) => {
  if (pet.asleep) return 'asleep';
  if (pet.sick) return 'sick';
  if (pet.hunger < metThreshold) return 'hungry';
  if (pet.happiness < metThreshold) return 'sad';
  return 'normal';
};

// Sprite lookup, form/mood fallback-safe. Kept string-in/string-out so a
// later swap to image assets only changes the values stored here, not any
// call site.
export const getSprite = (petType, stage, adultForm, mood) => {
  const stageSprites =
    stage === 'adult'
      ? petType.sprite.adult[adultForm] || petType.sprite.adult.balanced
      : petType.sprite[stage];
  return stageSprites[mood] || stageSprites.normal;
};
