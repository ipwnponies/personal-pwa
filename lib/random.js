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

export const pushHistoryEntry = (history, entry, maxEntries) =>
  [entry, ...history].slice(0, maxEntries);
