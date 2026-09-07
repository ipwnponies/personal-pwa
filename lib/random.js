export const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

export const weightedRandomChoice = (items, rng = Math.random) => {
  if (items.length === 0) return undefined;
  const validItems = items.filter((c) => c.weight > 0);
  if (validItems.length === 0) return undefined;
  const totalWeight = validItems.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * totalWeight;
  const idx = validItems.findIndex((c) => {
    r -= c.weight;
    return r <= 0;
  });
  return idx >= 0 ? validItems[idx] : validItems[validItems.length - 1];
};

export const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export const shuffle = (items, rng = Math.random) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const buildDeck = () => {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ suit, rank });
    });
  });
  return deck;
};

export const drawCards = (deck, n) => ({
  drawn: deck.slice(0, n),
  remaining: deck.slice(n),
});
