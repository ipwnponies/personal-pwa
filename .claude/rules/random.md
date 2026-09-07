---
paths:
  - "pages/random/**"
  - "lib/random.js"
  - "lib/useFlickGesture.js"
  - "lib/useShakeDetection.js"
---

# Random (Dice Roller / Weighted Choices / Coin Flip / Magic 8-Ball / Shuffle List / Card Draw)

Six tools in one page, swipe-navigable tabs.

## Layout

- `pages/random/index.jsx` — tab shell only: `Tabs`/`TabList`/`TabPanel` wiring, the horizontal-swipe gesture hook (`useHorizontalSwipe`, page-level swipe between tabs), `TAB_COUNT`. Imports each tab component from a sibling file.
- `pages/random/DiceRoll.jsx` — dice roller.
- `pages/random/WeightedChoices.jsx` — weighted random choice picker, including the private `ChoiceRow`/`GroupHeader` components and the spinner-wheel visual layer.
- `pages/random/CoinFlip.jsx` — coin flip. FLIP button and a flick gesture on the coin (`lib/useFlickGesture.js`) both trigger the same flip.
- `pages/random/MagicEightBall.jsx` — Magic 8-Ball, fixed 20-answer pool (`EIGHT_BALL_ANSWERS`). SHAKE button and a physical shake (`lib/useShakeDetection.js`) both reveal an answer.
- `pages/random/ShuffleList.jsx` — paste a list, shuffle its order.
- `pages/random/CardDraw.jsx` — draw cards from a 52-card deck without replacement. Bulk DRAW button (configurable count) and flicking the deck-face (always draws exactly one, via `lib/useFlickGesture.js`) both trigger a draw.
- `pages/random/index.module.css` — shared page/tab chrome (`.container`, `.rollButton`, `.result`, `.resultBadge`, `.settingRow`, etc.) used by every tab. Each new tab also has its own sibling `.module.css` for styles that don't overlap the shared ones (`CoinFlip.module.css`, `MagicEightBall.module.css`, `ShuffleList.module.css`, `CardDraw.module.css`, `WeightedChoices.module.css`).
- `lib/random.js` — pure helpers: `weightedRandomChoice`, `generateId`, `clamp`, `shuffle`, `buildDeck`, `drawCards`. `clamp`/`generateId` are also reused by `aquarium` — check before adding near-duplicates elsewhere.
- `lib/useFlickGesture.js` — one-shot flick detector (fast + far touch), shared by `CoinFlip` and `CardDraw`.
- `lib/useShakeDetection.js` — physical shake detector via `devicemotion`, used only by `MagicEightBall`. On iOS, `MagicEightBall`'s SHAKE button click handler is also where `DeviceMotionEvent.requestPermission()` gets called (must happen from a direct user gesture) — don't move that call into a `useEffect` or it silently stops working on iOS.
- Uses `react-tabs` for the tab UI (only page in the app that does).

## Conventions

- `WeightedChoices` persists its grouped choice structure to `localStorage` (`random-choices`); each group contains a name, an id, and an array of choices. Migration from old flat structure is automatic: on load, if old flat array is detected (items have `weight` field but no `choices` field), it's wrapped into a single "Default" group.
- Data shape: `[{ id, name, choices: [{ id, label, weight }] }]`
- Empty localStorage initializes with one default empty group for a sensible starting state.
- Accordion behavior: only one group is expanded at a time (tracked by `expandedGroupId`). Clicking a group header expands it and collapses the previous one.
- Result display (from PICK button) resets when switching to a different expanded group.
- The Weighted Choices spinner wheel (`wheelRotation` state, `buildWheelSegments`) is purely presentational — it visualizes the result `weightedRandomChoice` already produced inside `handlePick`, and is never an independent source of randomness.
- `DiceRoll` does not persist bounds/dice count — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.
- `ShuffleList` persists only the raw input text to `localStorage` (`random-shuffle-list`), not shuffle results — each SHUFFLE draws fresh from the current text.
- `CardDraw`'s deck state is session-only (component state, no persistence) — same precedent as `DiceRoll`.
- Every "physical gesture" trigger (coin flick, deck flick, ball shake) always has a plain-tap fallback (FLIP/DRAW/SHAKE button) that does the exact same thing — gestures are additive, never the only way to use a tool. `jsdom` (tests) and desktop browsers have no touch/motion support, so the fallback is also what most of the test suite exercises.
- Route is `PWA CacheOnly` (see root AGENTS.md) — this page's route is fully offline-capable, no network dependency in its own logic.
