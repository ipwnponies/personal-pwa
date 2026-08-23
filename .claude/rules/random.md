---
paths:
  - "pages/random/**"
  - "lib/random.js"
  - "lib/random.test.js"
---

# Random (Dice Roller / Weighted Choices)

Two tools in one page, swipe-navigable tabs: dice roller (`DiceRoll`) and weighted random choice picker (`WeightedChoices`).

## Layout

- `pages/random/index.jsx` — monolithic: both tab components (`DiceRoll`, `WeightedChoices`), the shared `ChoiceRow` row component, the `GroupHeader` accordion component, and the horizontal-swipe gesture hook (`useHorizontalSwipe`) are all defined in this one file.
- `lib/random.js` — pure helpers: `weightedRandomChoice`, `generateId`, `clamp`. `clamp`/`generateId` are also reused by `aquarium` — check before adding near-duplicates elsewhere.
- Uses `react-tabs` for the tab UI (only page in the app that does).

## Conventions

- `WeightedChoices` persists its grouped choice structure to `localStorage` (`random-choices`); each group contains a name, an id, and an array of choices. Migration from old flat structure is automatic: on load, if old flat array is detected (items have `weight` field but no `choices` field), it's wrapped into a single "Default" group.
- Data shape: `[{ id, name, choices: [{ id, label, weight }] }]`
- Empty localStorage initializes with one default empty group for a sensible starting state.
- Accordion behavior: only one group is expanded at a time (tracked by `expandedGroupId`). Clicking a group header expands it and collapses the previous one.
- Result display (from PICK button) resets when switching to a different expanded group.
- `DiceRoll` does not persist bounds/dice count — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.
- Route is `PWA CacheOnly` (see root AGENTS.md) — this page's route is fully offline-capable, no network dependency in its own logic.
