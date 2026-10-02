# Random: Result History on Dice, Coin and Cards (Design Spec)

Date: 2026-09-27
Status: Draft, awaiting review

## Summary

Only the Choices tab keeps a history of results (per group, persisted,
last 20 picks). This spec adds history to three more tabs, each in the
shape that fits its use:

| Tab | What gets remembered | Display |
|---|---|---|
| Dice | Each roll, with its config | Time-stamped list (same as Choices) |
| Coin | Each flip | Compact H/T strip, plus totals and current streak |
| Cards | Every card drawn from the current deck | "Drawn (N)" pile |

All three survive a reload. Classified **architectural**: it adds shared
persistence code, extracts a shared component out of `WeightedChoices`,
and changes a documented convention (Cards deck becomes persistent).

## Out of scope, and why

- **Magic 8-Ball.** An answer without its question is noise. Recording
  questions would need a new input, a separate feature.
- **Shuffle.** You shuffle once and read the result. Old orders are rarely
  useful. The input text is already persisted.
- **Choices data model.** Its history stays a per-group keyed object in
  `random-choices-history`. Moving it onto the new hook would mean
  reworking group delete/undo and raffle handling for no user-visible gain.
  Choices only swaps its inline list markup for the shared `HistoryList`.
- Sharing history, exporting it, syncing between browser tabs, confirming
  a clear. Not requested.

## Components

### `lib/usePersistentState.js`

`usePersistentState(key, fallback, isValid)` returns `[value, setValue]`.

- Initial render always returns `fallback`. Stored value is read in a
  mount effect, then applied if it parses and `isValid(parsed)` is true.
- Writes back to `localStorage` on every change, **but only after the
  mount read has happened**, so the empty initial value never overwrites
  saved data.
- All storage access wrapped in try/catch (private mode, quota, corrupt
  JSON). Failure means "behave as if nothing was saved", never a crash.

Why read in an effect instead of the lazy `useState` initializer used by
Choices and Shuffle: Dice is tab 0, the only tab rendered during
hydration of the static export. Reading `localStorage` in the initializer
there would make the first client render differ from the prerendered
HTML and trigger a React hydration mismatch. Choices and Shuffle get
away with it only because `react-tabs` does not render hidden panels.
The cost is one frame showing no history on load, which is acceptable.

### `lib/usePersistentHistory.js`

`usePersistentHistory(key, max)` returns `{ entries, push, clear }`.

- Built on `usePersistentState` with fallback `[]` and `Array.isArray` as
  the validator.
- `push(entry)` adds `id` (via `generateId`) and `timestamp`
  (`Date.now()`) and prepends using the existing `pushHistoryEntry`
  from `lib/random.js`, so the cap logic lives in one place.
- `clear()` sets `[]`.

### `components/random/HistoryList.jsx`

Props: `title`, `entries` (`[{ id, label, timestamp }]`). Renders
nothing when `entries` is empty. Markup and CSS classes lifted verbatim
from `WeightedChoices.jsx` (`.historyList`, `.historyTitle`,
`.historyRow`, `.historyLabel`, `.historyTime`, which stay in
`pages/random/index.module.css`). Imports that stylesheet the same way
`components/random/SoundContext.jsx` already does. Lives under
`components/` because files under `pages/` must default-export a page.

## Per-tab behavior

### Dice

- Key `random-dice-history`, cap 20.
- `handleRoll` pushes `label` built at roll time from the values it just
  rolled, e.g. `3d6 (1-6): 2, 4, 5 = 11`; single die: `1d6 (1-6): 4`.
  Config is baked into the label, so changing bounds later neither
  rewrites nor resets old entries.
- `HistoryList` titled "Recent rolls" below the result block, with a
  CLEAR button that calls `clear()`.
- Current roll display and share text are unchanged.

### Coin

- Key `random-coin-history`, cap 50. Entries store `label: 'H' | 'T'`.
- `handleFlip` pushes after setting the result, so the flick gesture and
  the FLIP button both record.
- Below the button: a row of H/T chips, newest on the left, wrapping;
  then a line `H 12 · T 9 · Streak: 3 T`. Counts and streak are derived
  from the stored (capped) 50, not all-time. Streak is the run length of
  the newest entry's side.
- CLEAR button resets the strip. Hidden when empty.

### Cards

- Replace the two in-memory states (`deck`, `drawn`) with one
  `usePersistentState('random-cards', ...)` holding
  `{ remaining: Card[], draws: Card[][] }`, `draws` newest first.
- One key rather than two so remaining deck and drawn pile can never
  disagree after a partial write. Validator checks both are arrays and
  their card total is 52; anything else falls back to a fresh shuffle.
- The current result block shows `draws[0]` (so the last draw also
  survives reload). Below it, "Drawn (N)" lists every drawn card,
  newest draw first, flattened.
- NEW DECK resets to a fresh shuffled deck and empty `draws`, same as
  today's reset. No separate clear button.
- Fallback when nothing is stored: `shuffle(buildDeck())` computed once
  on mount (not at module load or during prerender).

## Conventions doc update

`.claude/rules/random.md` currently says "`CardDraw`'s deck state is
session-only". Update it to describe the persisted `random-cards` key
and the three new history keys, and add a line on the effect-based load
rule (tab 0 hydration) so future tabs follow it.

## Testing

- `lib/usePersistentState.test.jsx`: returns fallback first, then stored
  value; invalid JSON and failing validator keep fallback; does not
  write fallback over existing data before the load; writes changes.
- `lib/usePersistentHistory.test.jsx`: push prepends with id and
  timestamp; cap respected; clear empties and persists.
- `components/random/HistoryList.test.jsx`: renders title and rows;
  renders nothing when empty.
- `__tests__/pages/random/DiceRoll.test.jsx`: roll adds an entry with
  config and values; CLEAR empties; history restored from storage.
- `__tests__/pages/random/CoinFlip.test.jsx`: flip adds a chip; counts
  and streak correct for a seeded history; CLEAR empties.
- `__tests__/pages/random/CardDraw.test.jsx`: draw moves cards into the
  pile; state restored from storage; corrupt or 51-card stored state
  falls back to a full deck; NEW DECK clears the pile.
- Existing `WeightedChoices` tests must still pass unchanged after the
  `HistoryList` swap.
- `npm test`, `npm run lint`, and `npm run build` (confirms no
  prerender or hydration issue from tab 0).

## Risks

- **Storage growth:** bounded. Worst case about 20 dice labels, 50 coin
  entries, one 52-card deck. A few kB.
- **Clear with no confirm** loses history on a mis-tap. Accepted: low
  stakes, and the Choices undo-toast pattern is internal to that
  component. Revisit if it bites.
- **Two browser tabs open** will overwrite each other's history. Same
  behavior as Choices today.
