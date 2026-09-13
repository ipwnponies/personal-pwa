---
paths:
  - "pages/fitness/**"
  - "lib/epley.js"
  - "lib/epley.test.js"
  - "lib/plateMath.js"
  - "lib/plateMath.test.js"
  - "lib/warmup.js"
  - "lib/warmup.test.js"
scope: fitness
---

# Fitness (Rep-Max Calculator)

Estimates one-rep max (Epley formula) and builds rep-max / percentage-of-1RM reference tables from a working weight and rep count.

## Layout

- `pages/fitness/index.jsx` — page, monolithic (form, result tables, swipe-number inputs all in one file). `ResultTable` and `SwipeNumberField` are local sub-components defined in the same file, not extracted to `components/`.
- `lib/epley.js` — pure calculation functions: `calculateOneRmEpley`, `calculatePercentageOfOneRm`, `roundToNearestFivePercent`, `formatWeight`, `buildPercentageTable`, `buildRepMaxTable`, and the `REPETITION_MIN` constant. Keep all formula logic here, not inline in the page.
- `lib/useSwipeNumber.js`, `lib/usePageBackground.js` — shared hooks, not fitness-specific (also used by `random`).
- `lib/plateMath.js` — pure barbell-loading math: `BAR_WEIGHT`, `AVAILABLE_PLATES`, and `calculatePlatesPerSide(targetWeight, unit)` (greedy largest-to-smallest plate selection, returning `{ plates, remainder }`). `lib/warmup.js` — the warmup rep scheme: `WARMUP_SCHEME` (percentage/rep pairs) and `buildWarmupRamp(workingWeight)`, which scales the working weight by each scheme percentage. This lives separately from `lib/epley.js` because it isn't Epley-formula math at all — it's a training convention (a fixed set of warmup percentages/reps) laid on top of the working weight, so keeping it out of `epley.js` keeps that file scoped to the 1RM formula itself.

## Conventions

- Inputs (`weight`, `repetitions`, `unit`) persist to `localStorage` under `fitness-inputs`, read in a `useEffect` (not a lazy `useState` initializer) specifically to avoid SSR/client hydration mismatch — `localStorage` doesn't exist server-side.
- All derived values (1RM, tables, highlighted row/percent, warmup ramp) are computed in a single `useMemo` keyed on `[repetitions, weight, unit]` — add new derived fields there rather than separate `useMemo`/`useState` calls that could drift out of sync.
- The warmup ramp is derived from the working weight (`buildWarmupRamp(weight)`), not the estimated 1RM. Each step's weight is rounded to the nearest loadable increment for the current unit (5 for `lb`, 2.5 for `kg`) in the page's `useMemo`, before calling `calculatePlatesPerSide` — rounding is a page-level display concern, not something `lib/plateMath.js` or `lib/warmup.js` do internally.
