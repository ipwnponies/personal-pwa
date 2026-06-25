const REPETITION_MIN = 1;
const REPETITION_MAX = 30;
const REPETITION_RANGE = REPETITION_MAX - REPETITION_MIN + 1;

function epleyRatio(reps) {
  if (reps < REPETITION_MIN) throw new Error("What's the point of 0 reps, get outta here")

  return 1 + (reps - 1) / 30;
}

function calculateOneRmEpley(weight, reps) {
  return weight * epleyRatio(reps);
}

function calculateWeightFromOneRm(oneRm, reps) {
  return oneRm / epleyRatio(reps);
}

function formatWeight(weight) {
  return Number.isFinite(weight) ? weight.toFixed(0) : '-';
}

function buildPercentageTable(estimatedOneRm) {
  const percentages = [];

  for (let percentage = 100; percentage >= 50; percentage -= 5) {
    percentages.push({
      percentage,
      weight: (estimatedOneRm * percentage) / 100,
    });
  }

  return percentages;
}

function buildRepMaxTable(estimatedOneRm) {
  return Array.from({ length: REPETITION_RANGE }, (_, index) => {
    const repCount = REPETITION_MIN + index;
    return {
      repCount,
      weight: calculateWeightFromOneRm(estimatedOneRm, repCount),
    };
  });
}

module.exports = {
  REPETITION_MIN,
  REPETITION_MAX,
  REPETITION_RANGE,
  epleyRatio,
  calculateOneRmEpley,
  calculateWeightFromOneRm,
  formatWeight,
  buildPercentageTable,
  buildRepMaxTable,
};
