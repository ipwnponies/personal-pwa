export const BAR_WEIGHT = { lb: 45, kg: 20 };

export const AVAILABLE_PLATES = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

const EPSILON = 1e-6;

export function calculatePlatesPerSide(targetWeight, unit) {
  const barWeight = BAR_WEIGHT[unit];
  const perSideWeight = (targetWeight - barWeight) / 2;

  // If target weight is at or below bar weight, no plates needed
  if (perSideWeight <= 0) {
    return { plates: [], remainder: 0 };
  }

  const availablePlates = AVAILABLE_PLATES[unit];
  const plates = [];
  let remaining = perSideWeight;

  // Greedily consume plates from largest to smallest
  for (const plateSize of availablePlates) {
    while (remaining >= plateSize - EPSILON) {
      plates.push(plateSize);
      remaining -= plateSize;
    }
  }

  // Round remainder to zero if it's smaller than epsilon
  const remainder = remaining < EPSILON ? 0 : remaining;

  return { plates, remainder };
}
