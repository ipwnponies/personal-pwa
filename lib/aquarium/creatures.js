// The theming layer. Game logic references species by key only, so swapping
// fish for shrimp/chicks/puppies/bunnies later is an edit to this file alone.
export const SPECIES = {
  clownfish: {
    key: 'clownfish',
    name: 'Clownfish',
    emoji: { baby: '🐠', child: '🐠', adult: '🐡' },
    hueDeg: 20,
    sizePx: { baby: 28, child: 40, adult: 56 },
  },
  tropicalfish: {
    key: 'tropicalfish',
    name: 'Tropical Fish',
    emoji: { baby: '🐟', child: '🐟', adult: '🐠' },
    hueDeg: 200,
    sizePx: { baby: 28, child: 40, adult: 56 },
  },
  blowfish: {
    key: 'blowfish',
    name: 'Blowfish',
    emoji: { baby: '🐟', child: '🐡', adult: '🐡' },
    hueDeg: 280,
    sizePx: { baby: 28, child: 42, adult: 60 },
  },
};

export const DEFAULT_SPECIES = 'clownfish';

export const speciesKeys = () => Object.keys(SPECIES);

export const getSpecies = (key) => SPECIES[key] || SPECIES[DEFAULT_SPECIES];
