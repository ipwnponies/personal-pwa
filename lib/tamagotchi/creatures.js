// The theming layer. Game logic references pet type by key only, so adding a
// second pet (egg colors, alt sprites, etc.) later is an edit to this file
// alone. Placeholder emoji sprite set for the scaffold — swap for real art
// once brainstorming settles on a look.
export const PETS = {
  blob: {
    key: 'blob',
    name: 'Blob',
    defaultForm: 'balanced',
    // Blob's form keys are deliberately identical to the five verdict names.
    // That identity is what lets every save written before species variety
    // resolve its stored adultForm with no migration.
    forms: {
      balanced: 'balanced',
      fedHeavy: 'fedHeavy',
      playHeavy: 'playHeavy',
      sleepHeavy: 'sleepHeavy',
      efficient: 'efficient',
    },
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
  sprout: {
    key: 'sprout',
    name: 'Sprout',
    defaultForm: 'bloom',
    forms: {
      balanced: 'bloom',
      fedHeavy: 'fruit',
      playHeavy: 'vine',
      sleepHeavy: 'evergreen',
      efficient: 'evergreen',
    },
    sprite: {
      baby: { normal: '🌰', hungry: '🌰', sad: '🌰', asleep: '🌰', sick: '🌰' },
      child: { normal: '🌱', hungry: '🌱', sad: '🥀', asleep: '💤', sick: '🥀' },
      adult: {
        bloom: { normal: '🌸', hungry: '🌷', sad: '🥀', asleep: '💤', sick: '🥀' },
        fruit: { normal: '🍑', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
        vine: { normal: '🍃', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
        evergreen: { normal: '🌲', hungry: '🍂', sad: '🥀', asleep: '💤', sick: '🥀' },
      },
    },
  },
  ember: {
    key: 'ember',
    name: 'Ember',
    defaultForm: 'hearth',
    forms: {
      balanced: 'hearth',
      fedHeavy: 'forge',
      playHeavy: 'wildfire',
      sleepHeavy: 'wildfire',
      efficient: 'hearth',
    },
    sprite: {
      baby: { normal: '🕯️', hungry: '🕯️', sad: '🕯️', asleep: '🕯️', sick: '🕯️' },
      child: { normal: '🔥', hungry: '🔥', sad: '💨', asleep: '💤', sick: '💨' },
      adult: {
        hearth: { normal: '🏮', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
        forge: { normal: '⚒️', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
        wildfire: { normal: '🌋', hungry: '🕯️', sad: '💨', asleep: '💤', sick: '💨' },
      },
    },
  },
};

export const DEFAULT_PET = 'blob';

export const petKeys = () => Object.keys(PETS);

export const getPetType = (key) => PETS[key] || PETS[DEFAULT_PET];

// A verdict is what the care tally concluded (species-independent, computed in
// simulation.js). A form is what this species calls that outcome. A species
// with fewer forms than verdicts maps several verdicts onto one form.
export const resolveForm = (petType, verdict) => petType.forms[verdict] || petType.defaultForm;

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
      ? petType.sprite.adult[adultForm] || petType.sprite.adult[petType.defaultForm]
      : petType.sprite[stage];
  return stageSprites[mood] || stageSprites.normal;
};
