# Random Page: Share / Copy a Result

## Context

Every tab on `/random` produces a result the user often wants somewhere else — a dice
roll pasted into a group chat, a weighted pick dropped into a ticket. Today the only way
to move a result off the page is to select the text by hand, which is awkward on a phone,
and impossible for the badge layout without selecting surrounding chrome.

There is no existing share or clipboard code anywhere in the repository (`navigator.share`
and `clipboard` appear in no file and in no commit in history), so this is new ground
rather than an extension of an existing pattern.

Scope agreed during brainstorming: **Dice Roll and Weighted Choices only**, the two
tabs from the original request. The other four tabs (Coin Flip, Magic 8-Ball, Shuffle
List, Card Draw) are deliberately left out of this change. The shared pieces below are
built so that adding a later tab costs one format expression and one JSX line.

Payload is the **bare result text** — no tab-name prefix, no page URL. The text is meant
to paste cleanly into a conversation that already has context, and a `PAGES_BASE_PATH`
-dependent URL would differ between local dev and the deployed site.

Route stays `PWA CacheOnly`. Both the Web Share API and the async Clipboard API are
local browser capabilities with no network dependency, so the page remains fully
offline-capable.

## Architecture

```
lib/
  useShareResult.js       — new hook: share-with-clipboard-fallback + transient status
  useShareResult.test.js  — new

pages/random/
  ShareResultButton.jsx        — new shared presentational button, used by both tabs
  ShareResultButton.module.css — new
  DiceRoll.jsx                 — renders the button inside its existing result block
  WeightedChoices.jsx          — renders the button inside its existing result block

__tests__/pages/random/
  DiceRoll.test.jsx            — new file (the tab had no test file before)
  WeightedChoices.test.jsx     — extended
```

The hook lives in `lib/` beside the other random-page hooks (`useFlickGesture`,
`useShakeDetection`) because it is React-only and DOM-only, with no dependency on the
random page itself. The button lives under `pages/random/` because its styling is tied
to that page's dark result chrome, matching how the existing per-tab `.module.css` files
are organized.

### `lib/useShareResult.js`

```js
const { share, status } = useShareResult();
// status: 'idle' | 'shared' | 'copied' | 'error'
```

`share(text)` resolves an outcome in this order:

1. `navigator.share` is a function → `await navigator.share({ text })`, status becomes
   `shared`.
2. Otherwise `navigator.clipboard.writeText` is a function → await it, status becomes
   `copied`.
3. Neither is available, or the awaited call rejects → status becomes `error`.

A rejection whose `name` is `AbortError` is the user dismissing the OS share sheet. That
is a normal outcome, not a failure: status returns to `idle` and nothing is announced.
This is the one case where a rejected promise must not produce an error state.

Any non-`idle` status resets itself to `idle` after `SHARE_STATUS_RESET_MS` (2000). The
timer is stored in a ref, cleared before each new attempt so rapid presses do not stack
timers, and cleared on unmount so a late timer cannot set state on an unmounted component.

`share` is wrapped in `useCallback` with `[settle]` as its only dependency. `settle` is
itself memoized with an empty dependency list, so its identity never changes and `share`
does not churn children either. A second `share(text)` call while one is already in
flight is a no-op — a double-tap must not race the OS share sheet.

No capability detection happens during render. `navigator.share` is absent during static
export and present on a phone, so a render-time branch on it would produce a hydration
mismatch. Detection happens inside the click handler only.

### `pages/random/ShareResultButton.jsx`

Props:

| Prop | Type | Required | Purpose |
|------|------|----------|---------|
| `text` | `string` | yes | The exact payload handed to `share`. |
| `label` | `string` | no | Button label, default `SHARE`. |

Renders a `<button type="button">` with a fixed label plus a status line beneath it. The
status line is `role="status"` with `aria-live="polite"`, so the outcome is announced to
a screen reader without moving focus, and is rendered empty (not absent) while idle so the
live region exists before it has content to announce.

Status text: `shared` → "Shared", `copied` → "Copied", `error` → "Couldn't copy". The
button label itself never changes, because the component cannot know before the click
which of the two paths will run.

`prop-types` validation per repo style.

### Result text

Built at render from the same state the result block displays, so what is shared always
matches what is on screen.

- **Dice Roll** — one die: `4`. More than one: `4, 6 (sum: 10)`. This mirrors what the tab
  shows: the sum line is only rendered when `numDice > 1`, and the shared text carries the
  sum under exactly the same condition. `DiceRoll` recomputes its values on every render by
  design (the `forceUpdate` reducer); deriving share text in the same render pass keeps the
  two in step rather than snapshotting a stale value.
- **Weighted Choices** — `Pizza (35% chance)`, from `result.label` and `result.percent`,
  the two values already rendered in that block.

Both formats are plain expressions inside their own component. They are not extracted into
`lib/random.js`: they are presentation strings coupled to one tab's display, not reusable
random primitives, and they are covered end-to-end by the component tests below.

## Testing

Red-first, one behavior per test.

**`lib/useShareResult.test.js`** (`renderHook`, `navigator` stubbed per test since jsdom
provides neither API):

- `navigator.share` present → called with `{ text }`, status becomes `shared`
- `navigator.share` absent, clipboard present → `writeText` called with the text, status
  becomes `copied`
- share rejects with `AbortError` → status stays `idle`, clipboard is not used as a
  consolation path
- share rejects with any other error → status becomes `error`
- neither API present → status becomes `error`
- status returns to `idle` after `SHARE_STATUS_RESET_MS` (fake timers)
- unmount before the timer fires → no state update, no act warning

**`__tests__/pages/random/DiceRoll.test.jsx`** (new file):

- no share button before the first roll
- one die → share payload is the single value
- several dice → share payload includes the comma-joined values and the sum
- clipboard fallback path reaches `writeText` with the same payload
- outcome text renders after a successful share

**`__tests__/pages/random/WeightedChoices.test.jsx`** (extended):

- no share button before a pick
- after a pick, share payload is `label (percent% chance)` matching the rendered result

The component tests assert the payload through the stubbed API rather than through a
separate formatter unit test, which keeps the format and the rendered result verified as
one behavior.

## Out of scope

- The other four tabs. Adding one later is a format expression plus one JSX line.
- Sharing history entries or a whole Weighted Choices group; this is the current result only.
- Sharing images, URLs, or files (`navigator.share` `files`/`url` members).
- A textarea-select-and-`execCommand` fallback for browsers with neither API. Those
  browsers get the error status instead; every browser this PWA supports has at least the
  Clipboard API in a secure context.
- Any dependency change.
