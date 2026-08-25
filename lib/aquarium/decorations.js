// The theming layer for placeable tank decorations, mirroring creatures.js's
// species-as-data pattern. Game/UI logic references items by key only, so
// growing or re-skinning the catalog is an edit to this file alone. Object
// key insertion order doubles as the unlock order (R5/R7).
export const DECORATION_TYPES = {
  seaweed: { key: 'seaweed', name: 'Seaweed', emoji: '🌿' },
  coral: { key: 'coral', name: 'Coral', emoji: '🪸' },
  treasure: { key: 'treasure', name: 'Treasure Chest', emoji: '🎁' },
  castle: { key: 'castle', name: 'Castle', emoji: '🏰' },
  bubblerock: { key: 'bubblerock', name: 'Bubble Rock', emoji: '🪨' },
};

export const DEFAULT_DECORATION_TYPE = 'seaweed';

export const decorationKeys = () => Object.keys(DECORATION_TYPES);

export const getDecorationType = (key) =>
  DECORATION_TYPES[key] || DECORATION_TYPES[DEFAULT_DECORATION_TYPE];
