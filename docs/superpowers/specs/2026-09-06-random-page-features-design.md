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
```

`index.jsx` imports each tab component and renders it inside its `TabPanel`, matching the current pattern (`<TabPanel><DiceRoll /></TabPanel>`, etc.).

### New pure helpers (`lib/random.js`)

- `shuffle(items, rng = Math.random)` — Fisher-Yates, returns new array, doesn't mutate input.
- `buildDeck()` — returns array of 52 `{ suit, rank }` card objects.
- `drawCards(deck, n)` — returns `{ drawn, remaining }`, drawing without replacement from the front of a pre-shuffled deck.

Card draw uses `shuffle(buildDeck())` once per "new deck" action, then `drawCards` slices off `n` cards per draw. No new random primitive beyond what `shuffle` needs (uses existing `Math.random` default like `weightedRandomChoice`).

## Changes: per tab

### Coin Flip (`CoinFlip.jsx`)

- Single FLIP button (styled like existing `ROLL`/`PICK` buttons).
- Result: "Heads" or "Tails", 50/50 via `Math.random() < 0.5`.
- Simple CSS flip animation on result change (rotateY transition), matching the touch-optimized feel of the page.
- No persistence — resets on reload, same as `DiceRoll` bounds.

### Magic 8-Ball (`MagicEightBall.jsx`)

- Fixed pool of the 20 classic Magic 8-Ball answers (hardcoded array in the component, no config UI).
- Tap/SHAKE button reveals one random answer via `Math.random()` index pick.
- No persistence.

### Shuffle List (`ShuffleList.jsx`)

- `<textarea>` input, one item per line, placeholder like "One item per line".
- SHUFFLE button runs `shuffle()` on the non-empty trimmed lines, displays the reordered list below (same result-display pattern as `DiceRoll`'s `resultValues`).
- Persists the raw textarea text to `localStorage` (`random-shuffle-list`) so the list survives reload — mirrors the `random-choices` persistence pattern in `WeightedChoices`. Only the input list persists, not shuffle results.

### Card Draw (`CardDraw.jsx`)

- Swipe-number input (reuse `useSwipeNumber`, same as Dice's `numDice`) for "how many cards to draw," bounded 1–52.
- DRAW button: draws N cards from the current shuffled deck (without replacement) and displays them (rank + suit, e.g. "K♠"). Disabled when fewer than N cards remain.
- NEW DECK button: reshuffles a fresh 52-card deck, re-enabling DRAW.
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
- Component tests (`__tests__/pages/random/`) for each new tab: `CoinFlip`, `MagicEightBall`, `ShuffleList`, `CardDraw`, matching existing testing-library conventions in that directory.
- `WeightedChoices` existing tests must keep passing unchanged (data/logic untouched); add a test confirming the spinner renders and doesn't alter `handlePick`'s result.
- After the extraction step (Dice/Choices → own files, no behavior change), run existing `__tests__/pages/random` suite to confirm no regression before adding new tabs.
- Manual check (`npm run dev`, `/random`): swipe/tap through all 6 tabs on a touch-emulated viewport.
