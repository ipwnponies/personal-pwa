// The theming layer. Game logic references pet type by key only, so adding a
// second pet (egg colors, alt sprites, etc.) later is an edit to this file
// alone. Placeholder emoji sprite set for the scaffold — swap for real art
// once brainstorming settles on a look.
export const PETS = {
  blob: {
    key: 'blob',
    name: 'Blob',
    sprite: {
      baby: { normal: '🥚', hungry: '🥚', sad: '🥚', asleep: '🥚' },
      child: { normal: '🐣', hungry: '🐣', sad: '🐣', asleep: '💤' },
      adult: { normal: '🐥', hungry: '🐤', sad: '🐤', asleep: '💤' },
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
  if (pet.hunger < metThreshold) return 'hungry';
  if (pet.happiness < metThreshold) return 'sad';
  return 'normal';
};
