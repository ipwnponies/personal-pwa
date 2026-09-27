# Random: Result History on Dice, Coin and Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted result history to the Dice, Coin and Cards tabs of `/random`, sharing one persistence hook and one history list component.

**Architecture:** A generic `usePersistentState` hook loads from `localStorage` in a mount effect (hydration-safe for tab 0) and writes back only after that load. `usePersistentHistory` wraps it for capped, time-stamped entry lists. `HistoryList` is the list markup lifted out of `WeightedChoices`. Dice and Coin use the history hook; Cards replaces its two in-memory states with one persisted `{ remaining, draws }` object.

**Tech Stack:** Next.js pages router (static export), React 18, react-tabs, CSS Modules, Vitest + React Testing Library (`renderHook` available, RTL 16).

**Spec:** `docs/superpowers/specs/2026-09-27-random-history-tabs-design.md`

## Global Constraints

- JavaScript only. Airbnb ESLint + Prettier. `prop-types` on components.
- No new dependencies. Do not touch `package.json` or the lockfile.
- Never co-locate tests under `pages/`. Tests for `pages/random/X.jsx` live in `__tests__/pages/random/X.test.jsx`. Tests with JSX use `.jsx`.
- Storage keys, exactly: `random-dice-history` (cap 20), `random-coin-history` (cap 50), `random-cards` (`{ remaining: Card[], draws: Card[][] }`, `draws` newest first).
- Existing `random-choices-history` data model is unchanged. `WeightedChoices` only swaps its inline list markup for `HistoryList`.
- Never read `localStorage` during render in a component that can render during hydration (Dice is tab 0).
- All storage access wrapped in try/catch. Failure means "nothing saved", never a crash.
- Commit messages: Conventional Commits, scope `random`, ending with the trailers:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EbaDXZss366LpYd3uzmGSz
  ```
- Out of scope: 8-Ball, Shuffle, share/export/sync of history, confirm on clear.

## Deliberate refinements of the spec

These are small tightenings made while planning. Each is marked in its task.

1. `usePersistentHistory` validates each entry (`id` string, `label` string, `timestamp` number), not just `Array.isArray`. A stored `[1, 2]` would otherwise render rows with `undefined` keys.
2. The Cards validator also checks each card has string `suit`/`rank` and that the 52 cards are distinct. Duplicate cards would give duplicate React keys and an impossible deck.
3. Cards passes its fresh-shuffle fallback as a lazy `useState` initializer (a function). That runs on first render, not at module load. It is safe because Cards is tab 5 and `react-tabs` does not render hidden panels during prerender or hydration. The current code already does exactly this.
4. Dice label die size is the face count `upper - lower + 1`, so bounds 1-6 give `d6` and 0-9 give `d10`.
5. Hook modules are `.js` and their tests are `.test.js` (no JSX, `renderHook` only).

## Review Focus

1. **Saved data clobbered on mount.** A naive "loaded" ref lets the write effect store the fallback in the same commit as the load. Expect: the fallback is never written while saved data exists. Test in Task 1 (spy on `setItem`).
2. **Storage unavailable** (Safari private mode, quota, blocked site data): `getItem`/`setItem` throw. Expect: tabs work, history is just not kept. Test in Task 1.
3. **Corrupt or hand-edited stored cards** (not JSON, 51 cards, 52 `{}` objects, duplicates). Expect: fresh 52-card deck, no crash, storage healed. Test in Task 6.
4. **Reload mid-deck and after NEW DECK.** Expect: remaining count, last draw and pile survive a remount. A NEW DECK survives a remount as a full deck with no pile. Test in Task 6.
5. **CLEAR then reload.** Expect: history stays empty after remount (clear is persisted, not just visual). Tests in Tasks 4 and 5.

---

### Task 1: `usePersistentState` hook

**Files:**
- Create: `lib/usePersistentState.js`
- Test: `lib/usePersistentState.test.js`
- Modify: `.claude/rules/random.md` frontmatter `paths` (so the `random` commit scope covers the new lib files)

**Interfaces:**
- Consumes: nothing.
- Produces: `usePersistentState(key: string, fallback: T | () => T, isValid: (parsed: unknown) => boolean): [T, setState]`. `setState` is React's setter (accepts a value or an updater function). `isValid` must be a stable (module-level) function.

- [ ] **Step 1: Add the new lib paths to the rules frontmatter**

In `.claude/rules/random.md`, add after the `lib/useShareResult.test.js` line:

```yaml
  - "lib/usePersistentState.js"
  - "lib/usePersistentState.test.js"
  - "lib/usePersistentHistory.js"
  - "lib/usePersistentHistory.test.js"
```

- [ ] **Step 2: Write the failing tests**

`lib/usePersistentState.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

const KEY = 'test-persistent-state';
const isString = (value) => typeof value === 'string';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentState', () => {
  it('renders the fallback first, then the stored value', () => {
    localStorage.setItem(KEY, JSON.stringify('saved'));
    const seen = [];
    const { result } = renderHook(() => {
      const state = usePersistentState(KEY, 'fallback', isString);
      seen.push(state[0]);
      return state;
    });

    expect(seen[0]).toBe('fallback');
    expect(result.current[0]).toBe('saved');
  });

  it('keeps the fallback when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('accepts a lazy fallback function', () => {
    const { result } = renderHook(() => usePersistentState(KEY, () => 'lazy', isString));
    expect(result.current[0]).toBe('lazy');
  });

  it('keeps the fallback when stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('keeps the fallback when the validator rejects the stored value', () => {
    localStorage.setItem(KEY, JSON.stringify(42));
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('never writes the fallback over saved data during mount', () => {
    localStorage.setItem(KEY, JSON.stringify('saved'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    renderHook(() => usePersistentState(KEY, 'fallback', isString));

    expect(setItem).not.toHaveBeenCalledWith(KEY, JSON.stringify('fallback'));
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('saved'));
  });

  it('writes updates to storage', () => {
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    act(() => result.current[1]('next'));
    expect(result.current[0]).toBe('next');
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('next'));
  });

  it('keeps working in memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');

    act(() => result.current[1]('next'));
    expect(result.current[0]).toBe('next');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/usePersistentState.test.js`
Expected: FAIL, cannot resolve `./usePersistentState`.

- [ ] **Step 4: Implement**

`lib/usePersistentState.js`:

```js
import { useEffect, useState } from 'react';

// Loads from localStorage in a mount effect, never during render, so the
// first client render matches the prerendered HTML (the Dice tab renders
// during hydration). `loaded` is state rather than a ref on purpose: with a
// ref, the write effect would run in the same commit as the load and store
// the fallback over saved data before the loaded value is applied.
export function usePersistentState(key, fallback, isValid) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      // Storage unavailable or corrupt JSON: behave as if nothing was saved.
    }
    setLoaded(true);
  }, [key, isValid]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable or full: keep the value in memory only.
    }
  }, [key, value, loaded]);

  return [value, setValue];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/usePersistentState.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/usePersistentState.js lib/usePersistentState.test.js .claude/rules/random.md
git commit -m "feat(random): add hydration-safe usePersistentState hook"
```
(Append the trailers from Global Constraints to every commit body.)

---

### Task 2: `usePersistentHistory` hook

**Files:**
- Create: `lib/usePersistentHistory.js`
- Test: `lib/usePersistentHistory.test.js`

**Interfaces:**
- Consumes: `usePersistentState` (Task 1); `generateId`, `pushHistoryEntry(history, entry, max)` from `lib/random.js`.
- Produces: `usePersistentHistory(key: string, max: number): { entries: Array<{ id: string, label: string, timestamp: number }>, push(entry: { label: string }): void, clear(): void }`. Also exports `isHistory(value): boolean`.

- [ ] **Step 1: Write the failing tests**

`lib/usePersistentHistory.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentHistory, isHistory } from './usePersistentHistory';

const KEY = 'test-history';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentHistory', () => {
  it('prepends entries with an id and timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { result } = renderHook(() => usePersistentHistory(KEY, 5));

    act(() => result.current.push({ label: 'first' }));
    act(() => result.current.push({ label: 'second' }));

    const [newest, oldest] = result.current.entries;
    expect(newest.label).toBe('second');
    expect(oldest.label).toBe('first');
    expect(typeof newest.id).toBe('string');
    expect(newest.id).not.toBe(oldest.id);
    expect(newest.timestamp).toBe(1000);
  });

  it('keeps at most max entries, dropping the oldest', () => {
    const { result } = renderHook(() => usePersistentHistory(KEY, 2));

    act(() => result.current.push({ label: 'a' }));
    act(() => result.current.push({ label: 'b' }));
    act(() => result.current.push({ label: 'c' }));

    expect(result.current.entries.map((e) => e.label)).toEqual(['c', 'b']);
  });

  it('persists and restores entries', () => {
    const first = renderHook(() => usePersistentHistory(KEY, 5));
    act(() => first.result.current.push({ label: 'kept' }));
    first.unmount();

    const second = renderHook(() => usePersistentHistory(KEY, 5));
    expect(second.result.current.entries.map((e) => e.label)).toEqual(['kept']);
  });

  it('clear empties the list and the empty list persists', () => {
    const first = renderHook(() => usePersistentHistory(KEY, 5));
    act(() => first.result.current.push({ label: 'gone' }));
    act(() => first.result.current.clear());
    expect(first.result.current.entries).toEqual([]);
    first.unmount();

    const second = renderHook(() => usePersistentHistory(KEY, 5));
    expect(second.result.current.entries).toEqual([]);
  });

  it('ignores stored arrays whose items are not history entries', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2]));
    const { result } = renderHook(() => usePersistentHistory(KEY, 5));
    expect(result.current.entries).toEqual([]);
  });
});

describe('isHistory', () => {
  it('accepts well-formed entries and rejects anything else', () => {
    expect(isHistory([{ id: 'a', label: 'x', timestamp: 1 }])).toBe(true);
    expect(isHistory([])).toBe(true);
    expect(isHistory({})).toBe(false);
    expect(isHistory([null])).toBe(false);
    expect(isHistory([{ id: 'a', label: 'x' }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/usePersistentHistory.test.js`
Expected: FAIL, cannot resolve `./usePersistentHistory`.

- [ ] **Step 3: Implement** (refinement 1: per-entry validation)

`lib/usePersistentHistory.js`:

```js
import { useCallback } from 'react';
import { generateId, pushHistoryEntry } from './random';
import { usePersistentState } from './usePersistentState';

const isHistoryEntry = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.id === 'string' &&
  typeof entry.label === 'string' &&
  typeof entry.timestamp === 'number';

export const isHistory = (value) => Array.isArray(value) && value.every(isHistoryEntry);

export function usePersistentHistory(key, max) {
  const [entries, setEntries] = usePersistentState(key, [], isHistory);

  // id and timestamp are made outside the updater so a re-run updater
  // (StrictMode) cannot produce a different entry.
  const push = useCallback(
    (entry) => {
      const stamped = { ...entry, id: generateId(), timestamp: Date.now() };
      setEntries((previous) => pushHistoryEntry(previous, stamped, max));
    },
    [setEntries, max],
  );

  const clear = useCallback(() => setEntries([]), [setEntries]);

  return { entries, push, clear };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/usePersistentHistory.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/usePersistentHistory.js lib/usePersistentHistory.test.js
git commit -m "feat(random): add capped usePersistentHistory hook"
```

---

### Task 3: `HistoryList` component, swapped into Choices

**Files:**
- Create: `components/random/HistoryList.jsx`
- Test: `components/random/HistoryList.test.jsx`
- Modify: `pages/random/WeightedChoices.jsx` (imports near line 18; list block near lines 767-782)

**Interfaces:**
- Consumes: CSS classes `.historyList`, `.historyTitle`, `.historyRow`, `.historyLabel`, `.historyTime` in `pages/random/index.module.css` (unchanged).
- Produces: default export `HistoryList({ title: string, entries: Array<{ id, label, timestamp }> })`. Renders `null` for an empty list.

- [ ] **Step 1: Write the failing tests**

`components/random/HistoryList.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryList from './HistoryList';

describe('HistoryList', () => {
  it('renders the title and one row per entry', () => {
    render(
      <HistoryList
        title="Recent rolls"
        entries={[
          { id: 'b', label: '1d6 (1-6): 4', timestamp: 2000 },
          { id: 'a', label: '1d6 (1-6): 2', timestamp: 1000 },
        ]}
      />,
    );

    expect(screen.getByText('Recent rolls')).toBeInTheDocument();
    expect(screen.getByText('1d6 (1-6): 4')).toBeInTheDocument();
    expect(screen.getByText('1d6 (1-6): 2')).toBeInTheDocument();
  });

  it('renders nothing when there are no entries', () => {
    const { container } = render(<HistoryList title="Recent rolls" entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/random/HistoryList.test.jsx`
Expected: FAIL, cannot resolve `./HistoryList`.

- [ ] **Step 3: Implement**

`components/random/HistoryList.jsx` (markup lifted verbatim from `WeightedChoices`):

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../pages/random/index.module.css';

export default function HistoryList({ title, entries }) {
  if (entries.length === 0) return null;

  return (
    <div className={styles.historyList}>
      <span className={styles.historyTitle}>{title}</span>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.historyRow}>
          <span className={styles.historyLabel}>{entry.label}</span>
          <span className={styles.historyTime}>
            {new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

HistoryList.propTypes = {
  title: PropTypes.string.isRequired,
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired,
    }),
  ).isRequired,
};
```

- [ ] **Step 4: Swap it into `WeightedChoices`**

In `pages/random/WeightedChoices.jsx`, add after `import ShareResultButton from './ShareResultButton';`:

```js
import HistoryList from '../../components/random/HistoryList';
```

Replace this block:

```jsx
      {expandedHistory.length > 0 && (
        <div className={styles.historyList}>
          <span className={styles.historyTitle}>Recent picks</span>
          {expandedHistory.map((entry) => (
            <div key={entry.id} className={styles.historyRow}>
              <span className={styles.historyLabel}>{entry.label}</span>
              <span className={styles.historyTime}>
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      )}
```

with:

```jsx
      <HistoryList title="Recent picks" entries={expandedHistory} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run components/random/HistoryList.test.jsx __tests__/pages/random/WeightedChoices.test.jsx`
Expected: PASS. `WeightedChoices.test.jsx` is not edited and must stay green.

- [ ] **Step 6: Commit**

```bash
git add components/random/HistoryList.jsx components/random/HistoryList.test.jsx pages/random/WeightedChoices.jsx
git commit -m "refactor(random): extract HistoryList from WeightedChoices"
```

---

### Task 4: Dice roll history

**Files:**
- Modify: `pages/random/DiceRoll.jsx`
- Modify: `pages/random/index.module.css` (add `.clearButton` after the `.historyTime` rule)
- Test: `__tests__/pages/random/DiceRoll.test.jsx`

**Interfaces:**
- Consumes: `usePersistentHistory` (Task 2), `HistoryList` (Task 3).
- Produces: `.clearButton` class in `pages/random/index.module.css`, reused by Task 5.

- [ ] **Step 1: Write the failing tests**

In `__tests__/pages/random/DiceRoll.test.jsx`, extend the top-level `afterEach` so stored history cannot leak between tests:

```js
afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
  localStorage.clear();
});
```

Append a new `describe` at the end of the file:

```jsx
describe('DiceRoll history', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no history before the first roll', () => {
    render(<DiceRoll />);
    expect(screen.queryByText('Recent rolls')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^CLEAR$/ })).not.toBeInTheDocument();
  });

  it('records a single-die roll with its config', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<DiceRoll />);

    fireEvent.click(screen.getByRole('button', { name: /^ROLL$/i }));

    expect(screen.getByText('Recent rolls')).toBeInTheDocument();
    expect(screen.getByText('1d6 (1-6): 1')).toBeInTheDocument();
  });

  it('records every value and the total for several dice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<DiceRoll />);
    setDiceCount(3);

    fireEvent.click(screen.getByRole('button', { name: /^ROLL$/i }));

    expect(screen.getByText('3d6 (1-6): 1, 1, 1 = 3')).toBeInTheDocument();
  });

  it('restores stored history on mount', () => {
    localStorage.setItem(
      'random-dice-history',
      JSON.stringify([{ id: 'a', label: '2d6 (1-6): 3, 4 = 7', timestamp: 0 }]),
    );
    render(<DiceRoll />);
    expect(screen.getByText('2d6 (1-6): 3, 4 = 7')).toBeInTheDocument();
  });

  it('CLEAR empties the history and it stays empty after a remount', () => {
    const { unmount } = render(<DiceRoll />);
    fireEvent.click(screen.getByRole('button', { name: /^ROLL$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^CLEAR$/ }));

    expect(screen.queryByText('Recent rolls')).not.toBeInTheDocument();
    unmount();

    render(<DiceRoll />);
    expect(screen.queryByText('Recent rolls')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pages/random/DiceRoll.test.jsx`
Expected: the new `DiceRoll history` tests FAIL (no "Recent rolls"); the existing tests still PASS.

- [ ] **Step 3: Implement**

In `pages/random/DiceRoll.jsx`, add imports after `import ShareResultButton from './ShareResultButton';`:

```js
import HistoryList from '../../components/random/HistoryList';
import { usePersistentHistory } from '../../lib/usePersistentHistory';
```

After the `rollDice` helper, add (refinement 4: die size is the face count):

```js
const DICE_HISTORY_KEY = 'random-dice-history';
const MAX_DICE_HISTORY = 20;

// Config is baked into the label so later bound changes never rewrite old
// entries: "3d6 (1-6): 2, 4, 5 = 11", or "1d6 (1-6): 4" for a single die.
const formatRollLabel = (values, lowerBound, upperBound) => {
  const config = `${values.length}d${upperBound - lowerBound + 1} (${lowerBound}-${upperBound})`;
  if (values.length === 1) return `${config}: ${values[0]}`;
  const total = values.reduce((sum, value) => sum + value, 0);
  return `${config}: ${values.join(', ')} = ${total}`;
};
```

Inside the component, after `const play = useSoundCue();`:

```js
  const history = usePersistentHistory(DICE_HISTORY_KEY, MAX_DICE_HISTORY);
```

Replace `handleRoll` with:

```js
  const handleRoll = () => {
    const values = [...Array(numDice).keys()].map(() => rollDice(lowerBound, upperBound));
    setRandomValues(values);
    history.push({ label: formatRollLabel(values, lowerBound, upperBound) });
    play('roll');
  };
```

After the closing `)}` of the `hasRolled && (...)` result block, before the container's closing `</div>`:

```jsx
      <HistoryList title="Recent rolls" entries={history.entries} />
      {history.entries.length > 0 && (
        <button type="button" className={styles.clearButton} onClick={history.clear}>
          CLEAR
        </button>
      )}
```

In `pages/random/index.module.css`, directly after the `.historyTime { ... }` rule:

```css
.clearButton {
  display: block;
  margin: 12px 0 0 auto;
  background: none;
  border: 1px solid #444;
  color: #ccc;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.clearButton:hover {
  border-color: #666;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pages/random/DiceRoll.test.jsx __tests__/pages/random/index.test.jsx __tests__/pages/random/index.module.css.test.js`
Expected: PASS, including the existing share and sound-toggle regression tests.

- [ ] **Step 5: Commit**

```bash
git add pages/random/DiceRoll.jsx pages/random/index.module.css __tests__/pages/random/DiceRoll.test.jsx
git commit -m "feat(random): keep a persisted history of dice rolls"
```

---

### Task 5: Coin flip strip, totals and streak

**Files:**
- Modify: `pages/random/CoinFlip.jsx`
- Modify: `pages/random/CoinFlip.module.css`
- Test: `__tests__/pages/random/CoinFlip.test.jsx`

**Interfaces:**
- Consumes: `usePersistentHistory` (Task 2); `.clearButton` from `pages/random/index.module.css` (Task 4).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the failing tests**

In `__tests__/pages/random/CoinFlip.test.jsx`, change the vitest import to include `afterEach`, and add at the top of the `describe('CoinFlip', ...)` body:

```js
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
```

Append a new `describe` at the end of the file:

```jsx
describe('CoinFlip history', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const seed = (labels) =>
    localStorage.setItem(
      'random-coin-history',
      JSON.stringify(labels.map((label, i) => ({ id: `id${i}`, label, timestamp: i }))),
    );

  it('shows no strip, totals or CLEAR before the first flip', () => {
    render(<CoinFlip />);
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^CLEAR$/ })).not.toBeInTheDocument();
  });

  it('adds a chip for every flip, newest first', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    render(<CoinFlip />);
    // Unmocked calls fall through to the real Math.random (generateId).
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));

    const chips = within(screen.getByRole('list', { name: 'Flip history' })).getAllByRole(
      'listitem',
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(['T', 'H']);
  });

  it('shows totals and the current streak from stored history', () => {
    seed(['T', 'T', 'T', 'H', 'T', 'H']);
    render(<CoinFlip />);
    expect(screen.getByText('H 2 · T 4 · Streak: 3 T')).toBeInTheDocument();
  });

  it('counts a streak that covers the whole history', () => {
    seed(['H', 'H']);
    render(<CoinFlip />);
    expect(screen.getByText('H 2 · T 0 · Streak: 2 H')).toBeInTheDocument();
  });

  it('CLEAR empties the strip and it stays empty after a remount', () => {
    seed(['H', 'T']);
    const { unmount } = render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /^CLEAR$/ }));
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
    unmount();

    render(<CoinFlip />);
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
  });
});
```

Also add `within` to the `@testing-library/react` import.

Note: `mockReturnValueOnce` only overrides the next call. The flip consumes it before `generateId` runs, so ids stay unique. A permanent `mockReturnValue` across two pushes in the same millisecond would produce duplicate ids.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pages/random/CoinFlip.test.jsx`
Expected: the new `CoinFlip history` tests FAIL (no "Flip history" list); existing tests PASS.

- [ ] **Step 3: Implement**

`pages/random/CoinFlip.jsx` becomes:

```jsx
import React, { useState } from 'react';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { usePersistentHistory } from '../../lib/usePersistentHistory';
import { useSoundCue } from '../../components/random/SoundContext';
import indexStyles from './index.module.css';
import styles from './CoinFlip.module.css';

const COIN_HISTORY_KEY = 'random-coin-history';
const MAX_COIN_HISTORY = 50;

const flipCoin = () => (Math.random() < 0.5 ? 'Heads' : 'Tails');

// Totals and streak cover only the stored (capped) entries, not all time.
const summarize = (entries) => {
  const heads = entries.filter((entry) => entry.label === 'H').length;
  const tails = entries.length - heads;
  const newest = entries[0].label;
  const breakAt = entries.findIndex((entry) => entry.label !== newest);
  const streak = breakAt === -1 ? entries.length : breakAt;
  return `H ${heads} · T ${tails} · Streak: ${streak} ${newest}`;
};

export default function CoinFlip() {
  const [result, setResult] = useState(null);
  const [flipCount, setFlipCount] = useState(0);
  const history = usePersistentHistory(COIN_HISTORY_KEY, MAX_COIN_HISTORY);
  const play = useSoundCue();

  const handleFlip = () => {
    const side = flipCoin();
    setResult(side);
    setFlipCount((count) => count + 1);
    history.push({ label: side === 'Heads' ? 'H' : 'T' });
    play('flip');
  };

  const flick = useFlickGesture(handleFlip);

  return (
    <div className={indexStyles.container}>
      <div
        key={flipCount}
        data-testid="coin"
        className={styles.coin}
        onTouchStart={flick.onTouchStart}
        onTouchEnd={flick.onTouchEnd}
      >
        {result || '?'}
      </div>
      <button type="button" className={indexStyles.rollButton} onClick={handleFlip}>
        FLIP
      </button>

      {history.entries.length > 0 && (
        <>
          <ol className={styles.chipStrip} aria-label="Flip history">
            {history.entries.map((entry) => (
              <li
                key={entry.id}
                className={`${styles.chip} ${entry.label === 'T' ? styles.chipTails : ''}`}
              >
                {entry.label}
              </li>
            ))}
          </ol>
          <p className={styles.stats}>{summarize(history.entries)}</p>
          <button type="button" className={indexStyles.clearButton} onClick={history.clear}>
            CLEAR
          </button>
        </>
      )}
    </div>
  );
}
```

Append to `pages/random/CoinFlip.module.css`:

```css
.chipStrip {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
}

.chip {
  width: 28px;
  height: 28px;
  margin: 0;
  border-radius: 50%;
  background: #2a2a3d;
  color: #4fc3f7;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chipTails {
  color: #e0e0e0;
}

.stats {
  margin: 12px 0 0;
  text-align: center;
  font-size: 0.85rem;
  color: #999;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pages/random/CoinFlip.test.jsx __tests__/pages/random/soundCues.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pages/random/CoinFlip.jsx pages/random/CoinFlip.module.css __tests__/pages/random/CoinFlip.test.jsx
git commit -m "feat(random): show a persisted flip strip with totals and streak"
```

---

### Task 6: Cards persisted deck and drawn pile

**Files:**
- Modify: `pages/random/CardDraw.jsx`
- Modify: `pages/random/CardDraw.module.css`
- Test: `__tests__/pages/random/CardDraw.test.jsx`

**Interfaces:**
- Consumes: `usePersistentState` (Task 1); `buildDeck`, `drawCards`, `shuffle` from `lib/random.js`.
- Produces: nothing used by later tasks. Storage shape `random-cards = { remaining: Card[], draws: Card[][] }`, where `Card = { suit: string, rank: string }` and `draws` is newest first.

- [ ] **Step 1: Write the failing tests**

In `__tests__/pages/random/CardDraw.test.jsx`, change imports to:

```js
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildDeck } from '../../../lib/random';
import CardDraw from '../../../pages/random/CardDraw';
```

Add at the top of the `describe('CardDraw', ...)` body (the deck now persists, so tests would leak state without it):

```js
  afterEach(() => {
    localStorage.clear();
  });
```

Append a new `describe` at the end of the file:

```jsx
describe('CardDraw persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  const KEY = 'random-cards';
  const draw = () => fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
  const stored = () => JSON.parse(localStorage.getItem(KEY));

  it('adds drawn cards to a Drawn pile', () => {
    render(<CardDraw />);
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
    draw();
    draw();
    expect(screen.getByText('Drawn (2)')).toBeInTheDocument();
  });

  it('restores the deck, the last draw and the pile from storage', () => {
    const deck = buildDeck(); // A♠, 2♠, ...
    localStorage.setItem(
      KEY,
      JSON.stringify({ remaining: deck.slice(2), draws: [[deck[1]], [deck[0]]] }),
    );
    render(<CardDraw />);

    expect(screen.getByText('50 cards left')).toBeInTheDocument();
    expect(screen.getByText('Drawn (2)')).toBeInTheDocument();
    // 2♠ is the last draw: shown in the result block and in the pile.
    expect(screen.getAllByText('2♠')).toHaveLength(2);
    // A♠ was an earlier draw: pile only.
    expect(screen.getAllByText('A♠')).toHaveLength(1);
  });

  it('keeps the deck across a remount', () => {
    const { unmount } = render(<CardDraw />);
    draw();
    unmount();

    render(<CardDraw />);
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
    expect(screen.getByText('Drawn (1)')).toBeInTheDocument();
  });

  it('NEW DECK clears the pile and the reset survives a remount', () => {
    const { unmount } = render(<CardDraw />);
    draw();
    fireEvent.click(screen.getByRole('button', { name: /NEW DECK/i }));
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
    unmount();

    render(<CardDraw />);
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['a 51-card state', JSON.stringify({ remaining: buildDeck().slice(1), draws: [] })],
    ['52 empty objects', JSON.stringify({ remaining: Array(52).fill({}), draws: [] })],
    [
      'duplicate cards',
      JSON.stringify({ remaining: Array(52).fill({ suit: '♠', rank: 'A' }), draws: [] }),
    ],
    ['draws that are not arrays', JSON.stringify({ remaining: buildDeck(), draws: [1] })],
  ])('falls back to a fresh full deck for %s and heals storage', (_name, value) => {
    localStorage.setItem(KEY, value);
    render(<CardDraw />);

    expect(screen.getByText('52 cards left')).toBeInTheDocument();
    expect(stored().remaining).toHaveLength(52);
    expect(stored().draws).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/pages/random/CardDraw.test.jsx`
Expected: the new `CardDraw persistence` tests FAIL (no "Drawn" pile, nothing restored); existing tests PASS.

- [ ] **Step 3: Implement** (refinements 2 and 3)

`pages/random/CardDraw.jsx`: replace the imports and the state/handler section down to `const canDraw = ...` with:

```jsx
import React, { useState } from 'react';
import { buildDeck, drawCards, shuffle } from '../../lib/random';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { usePersistentState } from '../../lib/usePersistentState';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { useSoundCue } from '../../components/random/SoundContext';
import indexStyles from './index.module.css';
import styles from './CardDraw.module.css';

const CARDS_STORAGE_KEY = 'random-cards';
const DECK_SIZE = 52;

// Lazy fallback: shuffles on first render. Safe because this tab is never
// rendered during prerender or hydration (react-tabs renders only tab 0).
const freshCards = () => ({ remaining: shuffle(buildDeck()), draws: [] });

const isCard = (card) =>
  card !== null &&
  typeof card === 'object' &&
  typeof card.suit === 'string' &&
  typeof card.rank === 'string';

// Remaining deck and drawn pile live under one key so they can never
// disagree; together they must be exactly one full deck.
const isCardState = (value) => {
  if (value === null || typeof value !== 'object') return false;
  if (!Array.isArray(value.remaining) || !Array.isArray(value.draws)) return false;
  if (!value.draws.every(Array.isArray)) return false;
  const all = [...value.remaining, ...value.draws.flat()];
  return (
    all.length === DECK_SIZE &&
    all.every(isCard) &&
    new Set(all.map((card) => `${card.rank}${card.suit}`)).size === DECK_SIZE
  );
};

export default function CardDraw() {
  const [cards, setCards] = usePersistentState(CARDS_STORAGE_KEY, freshCards, isCardState);
  const [drawCount, setDrawCount] = useState(1);
  const play = useSoundCue();

  const { remaining, draws } = cards;
  const lastDraw = draws.length > 0 ? draws[0] : [];
  const pile = draws.flat();

  const count = useSwipeNumber(drawCount, setDrawCount, 1, 52);

  const performDraw = (n) => {
    if (remaining.length < n) return;
    const result = drawCards(remaining, n);
    setCards({ remaining: result.remaining, draws: [result.drawn, ...draws] });
    play('draw');
  };

  const handleDraw = () => performDraw(drawCount);
  const handleFlickDraw = () => performDraw(1);

  const flick = useFlickGesture(handleFlickDraw);

  const handleNewDeck = () => {
    setCards(freshCards());
  };

  const canDraw = remaining.length >= drawCount;
```

In the JSX:
- Replace `{deck.length} cards left` with `{remaining.length} cards left`.
- Replace the result block `{drawn.length > 0 && ( ... drawn.map(...) ... )}` with the block below, followed by the pile:

```jsx
      {lastDraw.length > 0 && (
        <div className={indexStyles.result}>
          <div className={styles.cardsRow}>
            {lastDraw.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.card}>
                {card.rank}
                {card.suit}
              </span>
            ))}
          </div>
        </div>
      )}

      {pile.length > 0 && (
        <div className={styles.pile}>
          <span className={styles.pileTitle}>Drawn ({pile.length})</span>
          <div className={styles.pileCards}>
            {pile.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.pileCard}>
                {card.rank}
                {card.suit}
              </span>
            ))}
          </div>
        </div>
      )}
```

Append to `pages/random/CardDraw.module.css`:

```css
.pile {
  margin-top: 32px;
  border-radius: 12px;
  background: #2a2a3d;
  padding: 12px 16px;
}

.pileTitle {
  display: block;
  margin-bottom: 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #999;
}

.pileCards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pileCard {
  min-width: 36px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 0.85rem;
  text-align: center;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/pages/random/CardDraw.test.jsx __tests__/pages/random/soundCues.test.jsx`
Expected: PASS, including the existing flick and empty-deck tests.

- [ ] **Step 5: Commit**

```bash
git add pages/random/CardDraw.jsx pages/random/CardDraw.module.css __tests__/pages/random/CardDraw.test.jsx
git commit -m "feat(random): persist the card deck and show the drawn pile"
```

---

### Task 7: Rules doc and full verification

**Files:**
- Modify: `.claude/rules/random.md` (Layout list and Conventions)

**Interfaces:**
- Consumes: everything above.
- Produces: the updated conventions future tabs follow.

- [ ] **Step 1: Update the Layout list**

In `.claude/rules/random.md`, after the `lib/useShareResult.js` bullet, add:

```markdown
- `lib/usePersistentState.js`: `usePersistentState(key, fallback, isValid)` returns `[value, setValue]`. Reads `localStorage` in a mount effect and writes back only after that load (tracked as state, not a ref, so the fallback is never written over saved data). All storage access is try/catch.
- `lib/usePersistentHistory.js`: `usePersistentHistory(key, max)` returns `{ entries, push, clear }` on top of `usePersistentState`. `push({ label })` adds `id`/`timestamp` and caps via `pushHistoryEntry`.
- `components/random/HistoryList.jsx`: shared "Recent ..." list (`title`, `entries`), used by `WeightedChoices` and `DiceRoll`. Renders nothing when empty.
```

- [ ] **Step 2: Update the Conventions**

Replace:

```markdown
- `CardDraw`'s deck state is session-only (component state, no persistence) — same precedent as `DiceRoll`.
```

with:

```markdown
- `CardDraw` persists its deck under one key, `random-cards` = `{ remaining, draws }` (`draws` newest first; the result block shows `draws[0]`, the "Drawn (N)" pile shows all draws flattened). One key so the remaining deck and drawn pile can never disagree. A stored value that is not exactly 52 distinct valid cards falls back to a fresh shuffle. NEW DECK is the only reset.
- `DiceRoll` keeps a history of rolls (`random-dice-history`, last 20) with the config baked into each label (`3d6 (1-6): 2, 4, 5 = 11`). `CoinFlip` keeps `random-coin-history` (last 50, labels `H`/`T`) and derives its totals and streak from those stored entries only. Both have a CLEAR button with no confirm.
- New persisted state in a tab goes through `usePersistentState`, not a lazy `useState` initializer that reads `localStorage`. The initializer pattern in `WeightedChoices`/`ShuffleList` only works because those tabs never render during hydration; tab 0 (`DiceRoll`) does, and reading storage during its render causes a hydration mismatch.
```

Also change the `DiceRoll` bullet from "does not persist bounds/dice count" to keep that fact and add "(it does persist its roll history, see below)". Exact replacement:

```markdown
- `DiceRoll` does not persist bounds/dice count (only its roll history, below) — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, including the unchanged `WeightedChoices.test.jsx`.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files. CI does not gate on lint, but fix anything reported in files this plan created or edited.

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: build and static export succeed. This confirms the Dice tab prerenders with the hook in place.

- [ ] **Step 6: Manual hydration check**

Run: `npx serve out` and open `/random` with the browser console open. Roll dice, reload.
Expected: the roll history reappears after reload, and the console shows no hydration warning. If a browser is not available, say so in the handoff instead of claiming this step.

- [ ] **Step 7: Commit**

```bash
git add .claude/rules/random.md
git commit -m "docs(random): document persisted history for dice, coin and cards"
```

- [ ] **Step 8: Push**

```bash
git push -u origin claude/random-app-history-tabs-qqbr07
```
