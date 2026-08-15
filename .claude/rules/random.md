---
paths:
  - "pages/random/**"
  - "lib/random.js"
  - "lib/random.test.js"
---

# Random (Dice Roller / Weighted Choices)

Two tools in one page, swipe-navigable tabs: dice roller (`DiceRoll`) and weighted random choice picker (`WeightedChoices`).

## Layout

- `pages/random/index.jsx` — monolithic: both tab components (`DiceRoll`, `WeightedChoices`), the shared `ChoiceRow` row component, and the horizontal-swipe gesture hook (`useHorizontalSwipe`) are all defined in this one file.
- `lib/random.js` — pure helpers: `weightedRandomChoice`, `generateId`, `clamp`. `clamp`/`generateId` are also reused by `aquarium` — check before adding near-duplicates elsewhere.
- Uses `react-tabs` for the tab UI (only page in the app that does).

## Conventions

- `WeightedChoices` persists its choice list to `localStorage` (`random-choices`); `DiceRoll` does not persist bounds/dice count — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.
- Route is `PWA CacheOnly` (see root AGENTS.md) — this page's route is fully offline-capable, no network dependency in its own logic.
