# Random Page: New Tools + Monolith Split

## Context

`pages/random/index.jsx` (573 lines) currently hosts two swipe-navigable tabs — `DiceRoll` and `WeightedChoices` — plus their shared pieces (`ChoiceRow`, `GroupHeader`, `useHorizontalSwipe`) all in one file, per `.claude/rules/random.md`. Adding four new tools to this file would push it past 900 lines. This spec splits the monolith into per-component files as part of adding the new tools, and covers five features agreed via brainstorming:

1. Coin Flip (new tab)
2. Magic 8-Ball (new tab)
3. Shuffle List (new tab)
4. Card Draw (new tab)
5. Spinner visual layer on the existing Weighted Choices tab (no data/logic change)

Route stays `PWA CacheOnly` (fully offline) — none of the new features have a network dependency.

## Architecture

### File split

```
pages/random/
  index.jsx            — tab shell only: Tabs/TabList/TabPanel wiring, TAB_COUNT=6, PageThemeScript/meta tags
  DiceRoll.jsx          — extracted verbatim, no behavior change
  WeightedChoices.jsx   — extracted, existing data/PICK logic unchanged + spinner visual layer
  CoinFlip.jsx          — new
  MagicEightBall.jsx    — new
  ShuffleList.jsx       — new
  CardDraw.jsx          — new
  shared.jsx            — useHorizontalSwipe, ChoiceRow, GroupHeader (used by WeightedChoices; useHorizontalSwipe also used by index.jsx for page-level swipe)
  index.module.css      — shared page/tab styles stay here; component-specific styles split into sibling `.module.css` files only where a component's styles don't overlap the shared ones

lib/
  useFlickGesture.js    — new, shared by CoinFlip and CardDraw
  useShakeDetection.js  — new, used only by MagicEightBall
```

`index.jsx` imports each tab component and renders it inside its `TabPanel`, matching the current pattern (`<TabPanel><DiceRoll /></TabPanel>`, etc.).

### New pure helpers (`lib/random.js`)

- `shuffle(items, rng = Math.random)` — Fisher-Yates, returns new array, doesn't mutate input.
- `buildDeck()` — returns array of 52 `{ suit, rank }` card objects.
- `drawCards(deck, n)` — returns `{ drawn, remaining }`, drawing without replacement from the front of a pre-shuffled deck.

Card draw uses `shuffle(buildDeck())` once per "new deck" action, then `drawCards` slices off `n` cards per draw. No new random primitive beyond what `shuffle` needs (uses existing `Math.random` default like `weightedRandomChoice`).

### New shared gesture/sensor primitives (`lib/`)

Coin Flip and Card Draw both want a physical-feeling touch trigger; Magic 8-Ball wants a physical shake. Both are genuinely new interaction patterns (distinct from the existing `useHorizontalSwipe`, which is a continuous drag-to-switch-tabs gesture, and `useSwipeNumber`, which is a continuous drag-to-adjust-a-value gesture) — these are one-shot "the user performed gesture X, fire a callback" detectors. Two new hooks, each usable standalone (no dependency between them):

- **`lib/useFlickGesture.js`** — `useFlickGesture(onFlick)` returns `{ onTouchStart, onTouchEnd }`. Tracks start position/time on `touchstart`; on `touchend`, if the touch traveled at least `FLICK_DISTANCE_THRESHOLD` px within `FLICK_MAX_DURATION_MS` ms, calls `onFlick({ dx, dy, distance, duration })`. Direction-agnostic by design — callers that care about direction (none currently do) can inspect `dx`/`dy` themselves. Used by both `CoinFlip` (flick the coin in any direction to flip) and `CardDraw` (flick the deck to draw one card).
- **`lib/useShakeDetection.js`** — `useShakeDetection(onShake)` is a `useEffect`-based hook with no return value. Attaches a `devicemotion` listener, computes the magnitude of `accelerationIncludingGravity` each event, and calls `onShake()` once when the frame-to-frame delta crosses `SHAKE_THRESHOLD`, debounced by `SHAKE_COOLDOWN_MS` so one physical shake fires once. On a browser/device with no accelerometer (most desktops), `devicemotion` simply never fires — this is a silent no-op, not an error. Used only by `MagicEightBall`.

**iOS permission gate:** iOS Safari (13+) requires an explicit user gesture to call `DeviceMotionEvent.requestPermission()` before `devicemotion` events are dispatched at all — a hook cannot request this itself on mount. `MagicEightBall`'s existing SHAKE button becomes that gesture: its click handler feature-detects `typeof DeviceMotionEvent?.requestPermission === 'function'` and, if present, awaits the permission request (ignoring rejection) before *also* directly revealing an answer. This means the button always works (permission granted, denied, or the API not present at all — e.g. Android, desktop), and real shakes work in addition once permission is granted. `useShakeDetection`'s listener is attached unconditionally on mount regardless of permission state; on iOS pre-permission it just doesn't receive events yet.

## Changes: per tab

### Coin Flip (`CoinFlip.jsx`)

- FLIP button (styled like existing `ROLL`/`PICK` buttons) **and** a flick gesture on the coin itself — both call the same `handleFlip` function, via `useFlickGesture(handleFlip)` wired to the coin element's `onTouchStart`/`onTouchEnd`.
- Result: "Heads" or "Tails", 50/50 via `Math.random() < 0.5`.
- Simple CSS flip animation on result change (rotateY transition), matching the touch-optimized feel of the page.
- No persistence — resets on reload, same as `DiceRoll` bounds.

### Magic 8-Ball (`MagicEightBall.jsx`)

- Fixed pool of the 20 classic Magic 8-Ball answers (hardcoded array in the component, no config UI).
- Two triggers for the same `handleShake` reveal function: tapping the SHAKE button, and a physical shake detected via `useShakeDetection(handleShake)`. The button's click handler also performs the iOS permission request (see above) before calling `handleShake` — so the very first tap on iOS both unlocks future real shakes and reveals an answer immediately.
- No persistence.

### Shuffle List (`ShuffleList.jsx`)

- `<textarea>` input, one item per line, placeholder like "One item per line".
- SHUFFLE button runs `shuffle()` on the non-empty trimmed lines, displays the reordered list below (same result-display pattern as `DiceRoll`'s `resultValues`).
- Persists the raw textarea text to `localStorage` (`random-shuffle-list`) so the list survives reload — mirrors the `random-choices` persistence pattern in `WeightedChoices`. Only the input list persists, not shuffle results.

### Card Draw (`CardDraw.jsx`)

- A persistent deck-face visual (card-back styling) is always shown, representing the current deck. Flicking it — `useFlickGesture` wired to its `onTouchStart`/`onTouchEnd` — draws exactly one card, via the same underlying draw logic as the bulk path (`drawCards(deck, 1)`). No-ops (does nothing) when the deck is empty.
- Swipe-number input (reuse `useSwipeNumber`, same as Dice's `numDice`) for "how many cards to draw," bounded 1–52, plus a DRAW button that draws that many cards at once. Both the flick-one path and the bulk-DRAW path replace whatever was previously displayed in the result area (matches the existing single-result-area convention used elsewhere on this page, e.g. `WeightedChoices`'s result resetting on group switch).
- DRAW button disabled when fewer than the configured count remain; flicking the deck-face when the deck is empty is silently ignored (no error, no visual feedback beyond nothing happening — consistent with the button's disabled-state precedent).
- NEW DECK button: reshuffles a fresh 52-card deck, re-enabling both draw paths.
- Deck state is session-only (component state), not persisted — consistent with `DiceRoll`'s existing no-persistence precedent for ephemeral game state.

### Weighted Choices spinner (`WeightedChoices.jsx`)

- Existing group/choice data model, persistence (`random-choices`), accordion (`GroupHeader`), and `handlePick` logic are unchanged.
- Adds a wheel visual (SVG or CSS conic-gradient wedges sized by each choice's weight) above the existing choice list.
- PICK button triggers the existing `weightedRandomChoice` call as today; the spinner animates to visually land on that same result (the animation is driven by the already-computed result, not an independent random source — avoids any risk of the visual and the actual pick disagreeing).
- Result display (label + percent) stays as-is, spinner is additive.

## Non-goals

- No new tools beyond the five listed (Random Color, Password Generator, Bracket Seeder were considered and explicitly declined).
- No persistence for Coin Flip, Magic 8-Ball, or Card Draw state.
- No change to `DiceRoll` behavior beyond moving it to its own file.
- No change to `WeightedChoices` data model, persistence, or pick algorithm — spinner is presentation-only.
- No shared "game" abstraction across tools — each tab stays a self-contained component per existing page convention.

## Testing

- Unit tests (vitest) for new `lib/random.js` helpers (`shuffle`, `buildDeck`, `drawCards`), same style as existing `random.test.js` (deterministic via injected `rng` where relevant).
- Unit tests for `lib/useFlickGesture.js` (fast/far touch sequence fires `onFlick`, slow/short one doesn't) and `lib/useShakeDetection.js` (dispatching a synthetic `devicemotion` event with a large acceleration delta fires `onShake` once, a second event within the cooldown window doesn't re-fire).
- Component tests (`__tests__/pages/random/`) for each new tab: `CoinFlip`, `MagicEightBall`, `ShuffleList`, `CardDraw`, matching existing testing-library conventions in that directory. `CoinFlip` and `CardDraw` tests cover both the button/DRAW path and the flick path (simulated via `fireEvent.touchStart`/`fireEvent.touchEnd`). `MagicEightBall` tests cover the button path directly; since `jsdom` has no real `DeviceMotionEvent`, the button-triggers-permission-request code path is exercised via feature-detection being absent (falls straight through to `handleShake`), and `useShakeDetection`'s own behavior is covered by its unit tests instead.
- `WeightedChoices` existing tests must keep passing unchanged (data/logic untouched); add a test confirming the spinner renders and doesn't alter `handlePick`'s result.
- After the extraction step (Dice/Choices → own files, no behavior change), run existing `__tests__/pages/random` suite to confirm no regression before adding new tabs.
- Manual check (`npm run dev`, `/random`): swipe/tap through all 6 tabs on a touch-emulated viewport; flick the coin and the card deck; shake a physical device (or use a browser's sensor emulation) to confirm the 8-Ball responds, and confirm the SHAKE/FLIP/DRAW buttons still work standalone.
