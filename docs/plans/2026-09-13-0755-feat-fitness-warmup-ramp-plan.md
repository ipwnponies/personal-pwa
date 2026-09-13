---
title: Fitness Warmup Ramp - Plan
type: feat
date: 2026-09-13
topic: fitness-warmup-ramp
execution: code
---

# Fitness Warmup Ramp - Plan

## Goal Capsule

- **Objective:** Add a warmup-ramp generator to the fitness rep-max calculator: given the working weight, show 4 warmup steps (percentage/reps/weight/plates-per-side) below the existing result tables.
- **Means:** New `lib/plateMath.js` (plate-loading math) and `lib/warmup.js` (ramp step generation), wired into `pages/fitness/index.jsx` via a new `unit` setting (default `'lb'`) that also selects bar weight and plate inventory.
- **Product authority:** Design brainstormed and approved in chat this session (bounded path — extends an existing flow, not a new subsystem). No separate spec doc; this plan is the spec.
- **Open blockers:** None.

## Global Constraints (binding on every unit)

These exact values and decisions come from chat with the human partner. Do not
invent alternatives.

- `BAR_WEIGHT = { lb: 45, kg: 20 }`
- `AVAILABLE_PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] }`
- Plate inventory is a **hardcoded module constant** — no settings UI, no override parameter on `calculatePlatesPerSide`. Human partner explicitly chose this over configurability.
- `calculatePlatesPerSide(targetWeight, unit)` does greedy largest-to-smallest plate loading from `(targetWeight - barWeight) / 2` per side. It must return both the plates used per side AND any unloadable remainder — the remainder must never be silently dropped from the return value.
- Warmup weights are **rounded to the nearest loadable step (5 lb / 2.5 kg) before plate math runs** — human partner explicitly chose "round target to loadable step" over showing exact-percentage weights with a visible or hidden remainder. This rounding happens in the warmup-ramp path before calling `calculatePlatesPerSide`, not inside `calculatePlatesPerSide` itself (which stays a general-purpose function operating on whatever weight it's given).
- `buildWarmupRamp(workingWeight)` returns exactly 4 steps: `[{ percentage: 40, reps: 5 }, { percentage: 55, reps: 5 }, { percentage: 70, reps: 3 }, { percentage: 85, reps: 2 }]`, each with `weight = workingWeight * percentage / 100`. The rep scheme is a named constant (e.g. `WARMUP_SCHEME`), never a magic literal inline.
- `buildWarmupRamp` lives in a **new `lib/warmup.js`**, not `lib/epley.js`. Reason (document this in code/rule comment if useful): `.claude/rules/fitness.md` documents `epley.js` as pure Epley-formula logic; the 4-step/rep-scheme convention is a separate domain concern.
- Float precision: plate-sum comparisons in `plateMath.js` must use an epsilon comparison, not exact `===`, since 2.5/1.25 plate combinations can accumulate floating-point error.
- `unit` is a single piece of state in `pages/fitness/index.jsx`, default `'lb'`, persisted to the existing `fitness-inputs` localStorage key alongside `weight`/`repetitions`. This is plumbing only — no unit-toggle UI in this plan. Structure it so a later toggle UI just calls the same setter.
- Extend the existing single `useMemo` (keyed today on `[repetitions, weight]`) to also key on `unit`, and compute the warmup-ramp + per-step plate breakdown inside that same memo — do not add a second memo or separate state.
- Reuse the existing `ResultTable` component for the new warmup section; do not build a new table component.
- Do not touch the existing "units" label wording in the summary card — out of scope for this plan.
- No new dependencies.

## Implementation Units

### Task 1: Plate-loading math

- **Goal:** Pure greedy plate-loading calculator, unit-aware, with hardcoded bar weight and plate inventory.
- **Requirements:** see Global Constraints (`BAR_WEIGHT`, `AVAILABLE_PLATES`, `calculatePlatesPerSide` contract).
- **Dependencies:** none
- **Files:**
  - `lib/plateMath.js` (new)
  - `lib/plateMath.test.js` (new)
- **Approach:**
  1. Export `BAR_WEIGHT` and `AVAILABLE_PLATES` exactly as specified in Global Constraints.
  2. Export `calculatePlatesPerSide(targetWeight, unit)`:
     - `perSideWeight = (targetWeight - BAR_WEIGHT[unit]) / 2`. If `perSideWeight <= 0`, return an empty plates array and `remainder: 0` (nothing to load, bar alone covers it — treat as no error, not an unloadable state).
     - Greedily consume `AVAILABLE_PLATES[unit]` largest to smallest: for each plate size, take as many as fit (using epsilon-safe subtraction) before moving to the next size.
     - Return `{ plates: [...], remainder }` where `plates` is an array of the plate sizes used (largest to smallest, one entry per plate) and `remainder` is whatever per-side weight is left over that no plate combination can cover (0 when exact).
  3. Use an epsilon (e.g. `1e-6`) for all floating-point comparisons/subtractions in the greedy loop.
- **Patterns to follow:** `lib/epley.js`'s style — plain exported pure functions, no classes, no side effects.
- **Test scenarios:**
  - Exact fit in lb: e.g. target 225 lb → per side 90 → plates `[45, 35, 10]` (or equivalent exact combination), remainder 0.
  - Exact fit in kg: e.g. target 100 kg → per side 40 → exact plate combination from the kg set, remainder 0.
  - Remainder/unloadable case: a target whose per-side weight cannot be exactly built from the available plates (e.g. involves an odd fractional amount smaller than the smallest plate) returns a non-zero `remainder` and does not throw or silently drop it.
  - `targetWeight` at or below bar weight: returns empty `plates`, `remainder: 0`.
  - Both units produce correctly-scoped plate sets (lb target never pulls from the kg array or vice versa).
- **Verification:** `npx vitest run lib/plateMath.test.js` passes.

### Task 2: Warmup ramp generation

- **Goal:** Given a working weight, produce the 4-step warmup ramp (percentage/reps/weight).
- **Requirements:** see Global Constraints (`buildWarmupRamp` contract, `WARMUP_SCHEME` constant, file placement).
- **Dependencies:** none (independent of Task 1 — combines with it only at the page level in Task 3)
- **Files:**
  - `lib/warmup.js` (new)
  - `lib/warmup.test.js` (new)
- **Approach:**
  1. Define `export const WARMUP_SCHEME = [{ percentage: 40, reps: 5 }, { percentage: 55, reps: 5 }, { percentage: 70, reps: 3 }, { percentage: 85, reps: 2 }];` — the named constant Global Constraints requires.
  2. Export `buildWarmupRamp(workingWeight)`: maps `WARMUP_SCHEME` to `{ percentage, reps, weight: workingWeight * percentage / 100 }` for each step, preserving `WARMUP_SCHEME`'s order.
  3. Do not round or do plate math here — that's `plateMath.js`'s and the page's job (Global Constraints: rounding happens in the warmup-ramp *path*, i.e. at the page/derived-data level where the unit and rounding step are known, not inside this pure percentage/reps/weight function itself, and not inside `calculatePlatesPerSide`).
- **Patterns to follow:** `lib/epley.js`'s `buildPercentageTable`/`buildRepMaxTable` shape (array of step objects derived from one input value).
- **Test scenarios:**
  - Given a working weight (e.g. 155), returns exactly 4 steps in `WARMUP_SCHEME` order with correct `percentage`, `reps`, and `weight = workingWeight * percentage / 100` for each.
  - `WARMUP_SCHEME` is exported and has exactly the 4 documented steps.
- **Verification:** `npx vitest run lib/warmup.test.js` passes.

### Task 3: Wire unit + warmup section into the fitness page

- **Goal:** Add `unit` state (default `'lb'`), extend the derived-data `useMemo` to compute the warmup ramp with per-step rounded weight and plate breakdown, and render it as a new `ResultTable`-based section below the existing two tables.
- **Requirements:** see Global Constraints (unit plumbing, rounding-before-plate-math, single-memo convention, `ResultTable` reuse).
- **Dependencies:** Task 1, Task 2
- **Files:**
  - `pages/fitness/index.jsx`
  - `__tests__/pages/fitness/index.test.jsx`
  - `.claude/rules/fitness.md`
- **Approach:**
  1. Import `DEFAULT_UNIT` (or a literal `'lb'` if no such constant is exported — decide and note in the report) from `lib/plateMath.js`, plus `calculatePlatesPerSide` and `BAR_WEIGHT`/`AVAILABLE_PLATES` as needed, and `buildWarmupRamp` from `lib/warmup.js`.
  2. Add `const [unit, setUnit] = useState('lb')` (or restore from storage) alongside `weight`/`repetitions`. Include `unit` in the existing hydration `useEffect` (read from `loadStoredInputs()`) and the existing persistence `useEffect` (write to `localStorage` under `fitness-inputs`), matching how `weight`/`repetitions` already round-trip. No UI control changes `unit` in this plan — the setter exists for a later toggle to call.
  3. Extend the single `calculation` `useMemo`'s dependency array to `[repetitions, weight, unit]`. Inside it, after computing `estimatedOneRm`, `repMaxes`, `percentageBreakdown`:
     - Call `buildWarmupRamp(weight)` (ramp is based on the working weight, not the estimated 1RM — confirm this reading matches the task's example: "70% · 3 reps · 155 lb" implies 155 is the working weight and 70% of it is a warmup step, i.e. the example's "155 lb" is workingWeight itself feeding a *different* step's display — re-derive from the task spec's own wording if this differs; the binding rule is `weight = workingWeight * percentage / 100` from Global Constraints).
     - For each step, compute a step weight rounded to the nearest loadable increment for `unit` (5 for `lb`, 2.5 for `kg`) before calling `calculatePlatesPerSide(roundedWeight, unit)`.
     - Attach the rounded weight and `{ plates, remainder }` to each step, producing a `warmupSteps` array on the returned object.
  4. Render a third section below "Projected Rep Maxes" and "1RM Percentage Guide" using the existing `ResultTable` component, with rows built from `calculation.warmupSteps`. Row label/value format should read like the task's example: percentage, reps, rounded weight, plates-per-side (e.g. "70% · 3 reps · 155 lb · 45+10 per side"; when `remainder` is non-zero, surface it visibly rather than dropping it, e.g. append "(+2.5 not loadable)").
  5. In `__tests__/pages/fitness/index.test.jsx`, add a test asserting the warmup section renders a row derived from the default working weight, checking for the expected weight and plate text.
  6. In `.claude/rules/fitness.md`, add `lib/plateMath.js`, `lib/plateMath.test.js`, `lib/warmup.js`, `lib/warmup.test.js` to the `paths` frontmatter list, and add a short paragraph under Layout documenting the two new files and the "why warmup.js is separate from epley.js" reasoning from Global Constraints.
- **Patterns to follow:** existing `weightField`/`repsField` state handling; existing `ResultTable` prop shape (title/subtitle/columnLabels/rows/rowKey/rowLabel/rowValue); existing exact-string test assertions style in `__tests__/pages/fitness/index.test.jsx`.
- **Test scenarios:**
  - Warmup section renders 4 rows for the default/example working weight.
  - Each row shows percentage, reps, rounded weight, and plates-per-side text.
  - A step whose rounded weight has a non-zero plate remainder shows that remainder rather than hiding it.
  - Existing tests (exact-string assertions like `'113 units'`, `'227 units'`, `'Based on 5 reps'`, `'Based on 50 reps'`) still pass unmodified.
- **Verification:** `npm test` passes in full (not just the new test file) — this unit touches the page all other fitness tests exercise.

## Verification Contract

| Command | Applies to | Gate |
|---|---|---|
| `npm test` (vitest run) | All units | Full suite green, including new `lib/plateMath.test.js`, `lib/warmup.test.js`, and the extended `__tests__/pages/fitness/index.test.jsx` |

## Definition of Done

- All three units land; `npm test` passes clean.
- `.claude/rules/fitness.md` reflects the new files.
- No settings UI was added for plate inventory or unit toggle (explicitly out of scope — hardcoded default + plumbing only).
