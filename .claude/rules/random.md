---
paths:
  - "pages/random/**"
  - "lib/random.js"
  - "lib/random.test.js"
  - "lib/useFlickGesture.js"
  - "lib/useFlickGesture.test.js"
  - "lib/useShakeDetection.js"
  - "lib/useShakeDetection.test.js"
scope: random
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
- `lib/random.js` — pure helpers: `weightedRandomChoice`, `generateId`, `clamp`, `shuffle`, `buildDeck`, `drawCards`, `reorderById`. `clamp`/`generateId` are also reused by `aquarium` — check before adding near-duplicates elsewhere.
- `lib/useFlickGesture.js` — one-shot flick detector (fast + far touch), shared by `CoinFlip` and `CardDraw`.
- `lib/useShakeDetection.js` — physical shake detector via `devicemotion`, used only by `MagicEightBall`. On iOS, `MagicEightBall`'s SHAKE button click handler is also where `DeviceMotionEvent.requestPermission()` gets called (must happen from a direct user gesture) — don't move that call into a `useEffect` or it silently stops working on iOS.
- Uses `react-tabs` for the tab UI (only page in the app that does).

## Conventions

- `WeightedChoices` persists its grouped choice structure to `localStorage` (`random-choices`); each group contains a name, an id, and an array of choices. Migration from old flat structure is automatic: on load, if old flat array is detected (items have `weight` field but no `choices` field), it's wrapped into a single "Default" group.
- Data shape: `[{ id, name, choices: [{ id, label, weight }], noReplacement? }]`
- Empty localStorage initializes with one default empty group for a sensible starting state.
- Accordion behavior: only one group is expanded at a time (tracked by `expandedGroupId`). Clicking a group header expands it and collapses the previous one.
- Result display (from PICK button) resets when switching to a different expanded group.
- The Weighted Choices spinner wheel (`wheelRotation` state, `buildWheelSegments`) is purely presentational — it visualizes the result `weightedRandomChoice` already produced inside `handlePick`, and is never an independent source of randomness.
- `DiceRoll` does not persist bounds/dice count — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.
- `ShuffleList` persists only the raw input text to `localStorage` (`random-shuffle-list`), not shuffle results — each SHUFFLE draws fresh from the current text.
- `CardDraw`'s deck state is session-only (component state, no persistence) — same precedent as `DiceRoll`.
- Every "physical gesture" trigger (coin flick, deck flick, ball shake) always has a plain-tap fallback (FLIP/DRAW/SHAKE button) that does the exact same thing — gestures are additive, never the only way to use a tool. `jsdom` (tests) and desktop browsers have no touch/motion support, so the fallback is also what most of the test suite exercises.
- Groups and in-group choices support drag-reorder via `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`. Choice drag is scoped to the currently-expanded group only — no cross-group moves. Reordering itself goes through `reorderById` in `lib/random.js`, which inlines dnd-kit's `arrayMove` so that module stays React/DOM-free (it is also imported by `aquarium` and `doodle`).
- Drag activates on a 200ms long-press (mouse or touch, one `PointerSensor`) of a row's dedicated `DragHandle` — **never** the row itself. `useSortable`'s `listeners`, `attributes` and `setActivatorNodeRef` are all bound to that handle, and `touch-action: none` lives on `.dragHandle` only. Do not move any of them onto a `GroupHeader`/`ChoiceRow` root: `attributes` stamps `role="button"`/`tabIndex` (invalid ARIA around the row's real controls, and `closest()` is self-inclusive so the sensor would refuse every drag), `listeners` puts the `KeyboardSensor`'s `onKeyDown` above the row's inputs where it `preventDefault`s Space and Enter, and row-level `touch-action: none` blocks list scrolling.
- `RowPointerSensor` in `pages/random/WeightedChoices.jsx` additionally refuses activation from `input, button` (defence in depth — the weight input owns its own swipe-to-adjust gesture). The selector must not include `[role="button"]`; the handle carries that role. Its `activators` are assigned after the class body, not as a `static` class field — ESLint runs at `ecmaVersion: 12` and an unparseable file silently loses all rule coverage.
- The drag handle stops `touchmove` propagation so a drag never reaches `useHorizontalSwipe`'s tab-swipe classifier, mirroring `lib/useSwipeNumber.js`. The `restrictToVerticalAxis` modifier only affects dnd-kit's rendered transform and does **not** guard against this on its own.
- Route is `PWA CacheOnly` (see root AGENTS.md) — this page's route is fully offline-capable, no network dependency in its own logic.
- No-replacement ("raffle") mode: a per-group `noReplacement` boolean on the group object (persisted in `random-choices`, absent/falsy for existing groups — no migration needed), toggled by a "No repeats" checkbox in the expanded group's panel. The ids it has drawn so far live separately, in `localStorage` under `random-choices-drawn` (`{ [groupId]: [choiceId, ...] }`), mirroring how `random-choices-history` is kept apart from the choice config it doesn't belong in. `handlePick` draws from `valid` minus already-drawn ids when the group's `noReplacement` is on; the wheel, per-row percentages, and the PICK-disabled guard all read that same shrunken pool (`remainingChoices`/`remainingValidChoices`), so displayed odds stay honest as it drains. A drawn row stays visible (dimmed via `.choiceDrawn`, its own `%` replaced with `—`), stays editable/deletable, and a deleted drawn choice just drops out of the pool — no special-casing needed since the pool is always recomputed from current choices ∩ not-drawn. Reset is manual only (a "Reset pool" button, shown only when `noReplacement` is on, disabled when nothing's drawn yet) — re-expanding a group does **not** reset it, so switching groups can't silently erase raffle progress. Turning the toggle off clears that group's drawn ids (no "resume where you left off" on re-enabling — a hidden exclusion set surviving invisibly would be worse). Group delete/undo carries `random-choices-drawn` the same way it already carries `random-choices-history`. `isDrawn` (and every other pool computation) is gated on `group.noReplacement` — drawn ids left over from a group that's since had the toggle turned off (or from a stale multi-tab write) must never visually mark a row or shrink the pool once replacement mode is back on.
- The wheel holds a frozen `spinSegments` snapshot (taken from the pool at pick time, before the drawn id is added) for the duration of the 3s spin transition, clearing it on the wheel's `onTransitionEnd` or on switching the expanded group. Without this, a raffle pick's gradient (built from `remainingValidChoices`, which shrinks the instant the pick lands) would jump to its post-pick layout while the transform is still animating toward an angle computed against the pre-pick layout — landing the pointer on the wrong wedge, or on a blank disc after the last pick. This is the raffle-mode instance of the invariant that the wheel never shows anything other than the pick `weightedRandomChoice` actually produced.
