---
paths:
  - "pages/fitness/**"
  - "lib/epley.js"
  - "lib/epley.test.js"
---

# Fitness (Rep-Max Calculator)

Estimates one-rep max (Epley formula) and builds rep-max / percentage-of-1RM reference tables from a working weight and rep count.

## Layout

- `pages/fitness/index.jsx` — page, monolithic (form, result tables, swipe-number inputs all in one file). `ResultTable` and `SwipeNumberField` are local sub-components defined in the same file, not extracted to `components/`.
- `lib/epley.js` — pure calculation functions: `calculateOneRmEpley`, `calculatePercentageOfOneRm`, `roundToNearestFivePercent`, `formatWeight`, `buildPercentageTable`, `buildRepMaxTable`, and the `REPETITION_MIN` constant. Keep all formula logic here, not inline in the page.
- `lib/useSwipeNumber.js`, `lib/usePageBackground.js` — shared hooks, not fitness-specific (also used by `random`).

## Conventions

- Inputs (`weight`, `repetitions`) persist to `localStorage` under `fitness-inputs`, read in a `useEffect` (not a lazy `useState` initializer) specifically to avoid SSR/client hydration mismatch — `localStorage` doesn't exist server-side.
- All derived values (1RM, tables, highlighted row/percent) are computed in a single `useMemo` keyed on `[repetitions, weight]` — add new derived fields there rather than separate `useMemo`/`useState` calls that could drift out of sync.
