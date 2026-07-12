export const REPETITION_MIN = 1;
export const REPETITION_MAX = 30;
export const REPETITION_RANGE = REPETITION_MAX - REPETITION_MIN + 1;

export function epleyRatio(reps) {
  if (reps < REPETITION_MIN) throw new Error("What's the point of 0 reps, get outta here")

  return 1 + (reps - 1) / 30;
}

export function calculateOneRmEpley(weight, reps) {
  return weight * epleyRatio(reps);
}

export function calculatePercentageOfOneRm(reps) {
  return 100 / epleyRatio(reps);
}

export function roundToNearestFivePercent(percentage) {
  return Math.round(percentage / 5) * 5;
}

export function calculateWeightFromOneRm(oneRm, reps) {
  return oneRm / epleyRatio(reps);
}

export function formatWeight(weight) {
  return Number.isFinite(weight) ? weight.toFixed(0) : '-';
}

export function buildPercentageTable(estimatedOneRm) {
  const percentages = [];

  for (let percentage = 100; percentage >= 50; percentage -= 5) {
    percentages.push({
      percentage,
      weight: (estimatedOneRm * percentage) / 100,
    });
  }

  return percentages;
}

export function buildRepMaxTable(estimatedOneRm) {
  return Array.from({ length: REPETITION_RANGE }, (_, index) => {
    const repCount = REPETITION_MIN + index;
    return {
      repCount,
      weight: calculateWeightFromOneRm(estimatedOneRm, repCount),
    };
  });
}

