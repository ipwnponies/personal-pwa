# Fitness calculator touch input: bigger targets + swipe affordance

## Problem

The fitness calculator's weight and repetitions inputs are too small as touch
targets on phones, and nothing signals that the fields are swipeable. Two
concrete gaps:

1. `.input` in `pages/fitness/index.module.css` only gets a 44px min-height
   and larger font at `@media (min-width: 768px)`. Below that (phones), the
   field falls back to the browser's default `<input>` sizing.
2. `weightField` (from `useSwipeNumber`) has `onTouchStart`/`onTouchMove`/
   `onTouchEnd` handlers available but they are never attached to the weight
   `<input>` in `pages/fitness/index.jsx` — only the repetitions input wires
   them up. Swiping the weight field currently does nothing.

## Goals

- Both weight and repetitions inputs are comfortably touch-sized on phones,
  not just tablets.
- Weight is swipeable like repetitions already is, adjusting in 5-unit steps
  per swipe-step (matching realistic plate/weight increments) instead of 1.
- Both fields visually communicate "you can swipe this" via static chevron
  icons plus a one-time nudge animation on first load.

## Non-goals

- No change to typed-input behavior, validation, or persistence.
- No change to the repetitions swipe step size (stays 1 per swipe-step).
- No change to the results tables.

## Design

### 1. `useSwipeNumber` step parameter

`lib/useSwipeNumber.js` gains an optional 5th parameter, `step` (default
`1`). Inside `handleTouchMove`, the value delta becomes `steps * step`
instead of raw `steps`:

```js
export function useSwipeNumber(value, onChange, min, max, step = 1) {
  // ...
  const delta = (steps - accumulatedRef.current) * step;
  // accumulatedRef still tracks raw `steps` so PIXELS_PER_STEP threshold
  // behavior is unchanged; only the applied delta scales by `step`.
}
```

Repetitions call site is unchanged (`useSwipeNumber(repetitions, setRepetitions, REPETITION_MIN, Infinity)`,
step defaults to 1). Weight call site becomes:

```js
const weightField = useSwipeNumber(weight, setWeight, 0, Infinity, 5);
```

### 2. Wire weight input's touch handlers

In `pages/fitness/index.jsx`, add `onTouchStart={weightField.onTouchStart}`,
`onTouchMove={weightField.onTouchMove}`, `onTouchEnd={weightField.onTouchEnd}`
to the weight `<input>`, matching the reps input.

### 3. Remove the 768px gate on touch target size

In `index.module.css`, move the `.input` `min-height: 44px; font-size: 1.05rem;`
rule out of the `@media (min-width: 768px)` block and into the base `.input`
rule, so phones get the same 44px touch target as tablets. The
`@media (min-width: 768px)` block for `.th`/`.td` padding is untouched.

### 4. Swipe affordance: chevrons + one-time hint animation

Both `.field` wrappers for weight and reps get a new modifier class
(`styles.swipeField`) and a static chevron indicator element:

```jsx
<label className={`${styles.field} ${styles.swipeField}`}>
  <span>Weight used</span>
  <div className={styles.swipeInputWrap}>
    <input ... />
    <span className={styles.swipeChevrons} aria-hidden="true">▲▼</span>
  </div>
</label>
```

CSS:

- `.swipeInputWrap { position: relative; }`
- `.swipeChevrons { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.4; font-size: 0.75rem; line-height: 1; display: flex; flex-direction: column; }`
- A `.swipeHint` modifier class adds a one-shot CSS keyframe animation
  (`swipeNudge`) that translates the chevrons up/down a few px, `animation`
  running once (`animation-iteration-count: 1`) over ~1.2s.

The hint animation is gated by `sessionStorage`: a `useEffect` on mount
checks `sessionStorage.getItem('fitness-swipe-hint-shown')`; if absent, it
applies the `.swipeHint` class (via a small `showHint` state) and sets the
flag so the animation only plays once per browser session, not on every
mount/rerender. This is UI-teaching state only — separate from the
`fitness-inputs` localStorage key used for persisting actual field values.

## Testing

- `lib/useSwipeNumber.test.jsx`: new case asserting a 3-step swipe with
  `step=5` changes the value by 15 (e.g. initial 100, swipe past threshold
  for 3 steps → 115).
- `__tests__/pages/fitness/index.test.jsx`: replace the existing
  `'does not enable touch swipe on the weight input'` test (behavior is
  intentionally changing) with a test asserting a swipe on the weight input
  changes the estimated 1RM, rounded to a 5-unit step.
- No automated test for the chevron/animation visuals; verified manually in
  browser dev tools at mobile viewport widths.

## Files touched

- `lib/useSwipeNumber.js`
- `lib/useSwipeNumber.test.jsx`
- `pages/fitness/index.jsx`
- `pages/fitness/index.module.css`
- `__tests__/pages/fitness/index.test.jsx`
