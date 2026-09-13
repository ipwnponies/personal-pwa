export const WARMUP_SCHEME = [
  { percentage: 40, reps: 5 },
  { percentage: 55, reps: 5 },
  { percentage: 70, reps: 3 },
  { percentage: 85, reps: 2 },
];

export function buildWarmupRamp(workingWeight) {
  return WARMUP_SCHEME.map(step => ({
    percentage: step.percentage,
    reps: step.reps,
    weight: (workingWeight * step.percentage) / 100,
  }));
}
