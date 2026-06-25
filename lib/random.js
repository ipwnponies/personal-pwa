export const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

export const weightedRandomChoice = (items, rng = Math.random) => {
  if (items.length === 0) return undefined;
  const totalWeight = items.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * totalWeight;
  const idx = items.findIndex((c) => {
    r -= c.weight;
    return r <= 0;
  });
  return idx >= 0 ? items[idx] : items[items.length - 1];
};

export const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);
