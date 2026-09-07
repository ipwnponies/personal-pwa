# Random Page: New Tools + Monolith Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `pages/random/index.jsx` into per-tab files, then add four new offline mini-tools (Coin Flip, Magic 8-Ball, Shuffle List, Card Draw) and a purely-visual spinner wheel on top of the existing Weighted Choices tab.

**Architecture:** `pages/random/index.jsx` becomes a thin tab shell (Tabs/TabList/TabPanel wiring + the page-level swipe hook) that imports one component per tab from sibling files. Each tab component owns its own state and, where it needs styling beyond what's already in the shared `index.module.css`, its own `.module.css` file. Two new pure helpers (`shuffle`, `buildDeck`/`drawCards`) are added to `lib/random.js` alongside the existing `weightedRandomChoice`/`generateId`/`clamp`. The Weighted Choices spinner is a presentation-only layer computed from the *existing* `weightedRandomChoice` result — it never becomes a second source of randomness.

**Tech Stack:** Next.js (pages router), React 18, JavaScript only, CSS Modules, `react-tabs`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-06-random-page-features-design.md`

## Global Constraints

- No dependency changes. No changes to `package.json`/lockfile.
- JavaScript only — no TypeScript.
- Follow this repo's ESLint config exactly: `.eslintrc.yml` extends `plugin:react/recommended`, `airbnb`, `prettier`; plugins: `[react]` only. Components that take props but skip PropTypes use `// eslint-disable-next-line react/prop-types` immediately above, matching the existing `ChoiceRow`/`GroupHeader` convention. Array-index React keys use `// eslint-disable-next-line react/no-array-index-key` immediately above, matching the existing `DiceRoll` result-badge convention.
- Route stays `PWA CacheOnly` (see root `AGENTS.md`) — no network calls in any new code.
- `lib/random.js`'s `clamp`/`generateId` are reused by `aquarium` — do not rename or change their signatures.
- localStorage key for the new Shuffle List feature is exactly `random-shuffle-list` (string value = raw textarea text, not JSON).
- The Weighted Choices spinner must never compute its own random outcome — it only visualizes the result `weightedRandomChoice` already produced inside `handlePick`.
- `lib/useFlickGesture.js`'s `FLICK_DISTANCE_THRESHOLD` is **40** (px) and `FLICK_MAX_DURATION_MS` is **400**. `lib/useShakeDetection.js`'s `SHAKE_THRESHOLD` is **15** and `SHAKE_COOLDOWN_MS` is **1000**. Both hooks export these as named constants (not inlined) so tests can reference them instead of duplicating magic numbers.
- `jsdom` (the test environment) has no real `DeviceMotionEvent`/accelerometer. Any code path that calls `DeviceMotionEvent.requestPermission()` must feature-detect first (`typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'`) so it degrades to a no-op under test and on non-iOS devices, never throwing.
- After every task, run `npm run test` (whole suite) and `npm run lint` before committing.

---

## File Structure

- `pages/random/index.jsx` (rewritten) — tab shell only: `Tabs`/`TabList`/`TabPanel` wiring, `useHorizontalSwipe` hook (page-level swipe between tabs), `TAB_COUNT`, `Head`/PWA meta tags. Imports each tab component.
- `pages/random/DiceRoll.jsx` (new) — extracted verbatim from the current `index.jsx`, no behavior change.
- `pages/random/WeightedChoices.jsx` (new) — extracted verbatim (including private `ChoiceRow`/`GroupHeader`), plus the spinner layer added in Task 9.
- `pages/random/WeightedChoices.module.css` (new, added in Task 9) — spinner-only styles (`.wheelWrap`, `.wheel`, `.wheelPointer`). Existing Weighted Choices styles stay in `index.module.css`, imported alongside.
- `pages/random/CoinFlip.jsx` (new) + `pages/random/CoinFlip.module.css` (new) — button **and** flick-gesture trigger.
- `pages/random/MagicEightBall.jsx` (new) + `pages/random/MagicEightBall.module.css` (new) — button **and** physical shake trigger.
- `pages/random/ShuffleList.jsx` (new) + `pages/random/ShuffleList.module.css` (new)
- `pages/random/CardDraw.jsx` (new) + `pages/random/CardDraw.module.css` (new) — bulk DRAW button **and** flick-the-deck-face draws one card.
- `lib/random.js` (modified) — add `shuffle`, `buildDeck`, `drawCards`.
- `lib/random.test.js` (modified) — tests for the three new helpers.
- `lib/useFlickGesture.js` (new) — shared one-shot flick detector, used by `CoinFlip` and `CardDraw`.
- `lib/useFlickGesture.test.js` (new)
- `lib/useShakeDetection.js` (new) — shared shake detector, used by `MagicEightBall`.
- `lib/useShakeDetection.test.js` (new)
- `__tests__/pages/random/index.test.jsx` (modified) — keeps page-level tests (head, background); the `WeightedChoices grouped structure` describe block moves out to its own file; a new describe block asserts all 6 tabs render.
- `__tests__/pages/random/WeightedChoices.test.jsx` (new) — the migrated Weighted Choices tests (now rendering `<WeightedChoices />` directly, no tab-click needed), plus new spinner tests (Task 9).
- `__tests__/pages/random/DiceRoll.test.jsx`, `CoinFlip.test.jsx`, `MagicEightBall.test.jsx`, `ShuffleList.test.jsx`, `CardDraw.test.jsx` (new).
- `.claude/rules/random.md` (modified, Task 10) — reflects the new file layout, the four new tools, and the two new gesture/sensor hooks.

**Design decision — every new component imports `index.module.css` for shared chrome, plus its own `.module.css` only for what's genuinely new** (per the spec's file-split note). This means `.container`, `.rollButton`, `.result`, `.resultBadge`, `.settingRow`, `.settingLabel`, `.settingInput` are reused as-is by the new tools — no duplicate button/layout CSS. `index.module.css`'s content is otherwise untouched, so the existing `__tests__/pages/random/index.module.css.test.js` (which asserts exact breakpoint text) keeps passing unmodified.

**Design decision — no `shared.jsx` file.** The spec's draft file list included one for `useHorizontalSwipe`/`ChoiceRow`/`GroupHeader`. On inspection, `useHorizontalSwipe` is only ever used by `index.jsx` itself (page-level tab-swipe), and `ChoiceRow`/`GroupHeader` are only used inside `WeightedChoices`. Neither needs to be shared across files, so both stay exactly where the spec's per-component split already puts them — this removes a file with no consumers to justify it (YAGNI).

---

### Task 1: Extract `DiceRoll` into its own file

**Files:**
- Create: `pages/random/DiceRoll.jsx`
- Modify: `pages/random/index.jsx`

**Interfaces:**
- Produces: `export default function DiceRoll()` — a self-contained component, no props.

- [ ] **Step 1: Create `pages/random/DiceRoll.jsx`**

```jsx
import React, { useReducer, useState } from 'react';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import styles from './index.module.css';

const rollDice = (lowerBound, upperBound) =>
  Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;

export default function DiceRoll() {
  const [lowerBound, setLowerBound] = useState(1);
  const [upperBound, setUpperBound] = useState(6);
  const [numDice, setNumDice] = useState(1);
  const [hasRolled, setHasRolled] = useState(false);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const lower = useSwipeNumber(lowerBound, setLowerBound, 0, 100);
  const upper = useSwipeNumber(upperBound, setUpperBound, 1, 100);
  const dice = useSwipeNumber(numDice, setNumDice, 1, 20);

  const randomValues = [...Array(numDice).keys()].map(() =>
    rollDice(lowerBound, upperBound),
  );
  const sum = randomValues.reduce((previousValue, i) => previousValue + i);

  const handleRoll = () => {
    setHasRolled(true);
    forceUpdate();
  };

  return (
    <div className={styles.container}>
      <div className={styles.boundsRow}>
        <div className={styles.boundCard}>
          <span className={styles.boundLabel}>Minimum</span>
          <input
            id="lowerBound"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={100}
            className={styles.boundInput}
            value={lower.inputValue}
            placeholder={lower.placeholder}
            onChange={lower.onChange}
            onFocus={lower.onFocus}
            onBlur={lower.onBlur}
            onKeyDown={lower.onKeyDown}
            onTouchStart={lower.onTouchStart}
            onTouchMove={lower.onTouchMove}
            onTouchEnd={lower.onTouchEnd}
          />
        </div>
        <div className={styles.boundCard}>
          <span className={styles.boundLabel}>Maximum</span>
          <input
            id="upperBound"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            max={100}
            className={styles.boundInput}
            value={upper.inputValue}
            placeholder={upper.placeholder}
            onChange={upper.onChange}
            onFocus={upper.onFocus}
            onBlur={upper.onBlur}
            onKeyDown={upper.onKeyDown}
            onTouchStart={upper.onTouchStart}
            onTouchMove={upper.onTouchMove}
            onTouchEnd={upper.onTouchEnd}
          />
        </div>
      </div>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>How many dice?</span>
        <input
          id="numDice"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={20}
          className={styles.settingInput}
          value={dice.inputValue}
          placeholder={dice.placeholder}
          onChange={dice.onChange}
          onFocus={dice.onFocus}
          onBlur={dice.onBlur}
          onKeyDown={dice.onKeyDown}
          onTouchStart={dice.onTouchStart}
          onTouchMove={dice.onTouchMove}
          onTouchEnd={dice.onTouchEnd}
        />
      </div>

      <button type="button" className={styles.rollButton} onClick={handleRoll}>
        ROLL
      </button>

      {hasRolled && (
        <div className={styles.result}>
          <div className={styles.resultValues}>
            {randomValues.map((val, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={idx} className={styles.resultBadge}>
                {val}
              </span>
            ))}
          </div>
          {numDice > 1 && (
            <div className={styles.resultSum}>
              Sum: <strong>{sum}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `pages/random/index.jsx`** — remove the `rollDice` function and the entire `DiceRoll` component definition (everything from `const rollDice = ...` through the closing `}` of `function DiceRoll() { ... }`). Add this import near the top, with the other local imports:

```js
import DiceRoll from './DiceRoll';
```

Remove `useReducer` from the `react` import (no longer used in this file once `DiceRoll` is gone) — the import line changes from:

```js
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
```

to:

```js
import React, { useCallback, useEffect, useRef, useState } from 'react';
```

(`useSwipeNumber` stays imported in `index.jsx` for now — `WeightedChoices` still uses it until Task 2.)

- [ ] **Step 3: Run the full test suite to confirm no regression**

Run: `npm run test`
Expected: PASS — same test count/results as before this change (no test exercised `DiceRoll` directly, so this step is a smoke check that the extraction didn't break the page).

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: no errors (no unused imports, no missing PropTypes warnings — `DiceRoll` takes no props).

- [ ] **Step 5: Commit**

```bash
git add pages/random/DiceRoll.jsx pages/random/index.jsx
git commit -m "refactor(random): extract DiceRoll into its own file"
```

---

### Task 2: Extract `WeightedChoices` (+ `ChoiceRow`/`GroupHeader`) into its own file

**Files:**
- Create: `pages/random/WeightedChoices.jsx`
- Modify: `pages/random/index.jsx`
- Create: `__tests__/pages/random/WeightedChoices.test.jsx`
- Modify: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Produces: `export default function WeightedChoices()` — a self-contained component, no props. `ChoiceRow` and `GroupHeader` stay private to this file (not exported), matching today's encapsulation.
- Consumes: `weightedRandomChoice`, `generateId` from `../../lib/random`; `useSwipeNumber` from `../../lib/useSwipeNumber`.

- [ ] **Step 1: Create `pages/random/WeightedChoices.jsx`**

```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { weightedRandomChoice, generateId } from '../../lib/random';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import styles from './index.module.css';

// eslint-disable-next-line react/prop-types
function ChoiceRow({ label, weightValue, totalWeight, onChangeLabel, onChangeWeight, onDelete }) {
  const setWeight = useCallback(
    (valOrFn) => {
      const next = typeof valOrFn === 'function' ? valOrFn(weightValue) : valOrFn;
      onChangeWeight(next);
    },
    [weightValue, onChangeWeight],
  );

  const weight = useSwipeNumber(weightValue, setWeight, 0, 99);
  const percent = totalWeight > 0 ? Math.round((weightValue / totalWeight) * 100) : 0;

  return (
    <div className={styles.choiceRow}>
      <input
        type="text"
        className={styles.choiceLabelInput}
        value={label}
        onChange={(e) => onChangeLabel(e.target.value)}
        placeholder="Choice"
      />
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={99}
        className={styles.choiceWeightInput}
        value={weight.inputValue}
        placeholder={weight.placeholder}
        onChange={weight.onChange}
        onFocus={weight.onFocus}
        onBlur={weight.onBlur}
        onKeyDown={weight.onKeyDown}
        onTouchStart={weight.onTouchStart}
        onTouchMove={weight.onTouchMove}
        onTouchEnd={weight.onTouchEnd}
      />
      <span className={styles.choicePercent}>{percent}%</span>
      <button type="button" className={styles.choiceDelete} onClick={onDelete}>
        &times;
      </button>
    </div>
  );
}

// eslint-disable-next-line react/prop-types
function GroupHeader({ groupName, isExpanded, onToggleExpand, onRename, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(groupName);
  const inputRef = useRef(null);

  const handleNameClick = () => {
    setIsEditing(true);
  };

  const handleNameBlur = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed) {
      setEditValue(trimmed);
      onRename(trimmed);
    } else {
      setEditValue(groupName);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameBlur();
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return (
    <div className={styles.groupHeader}>
      <button
        type="button"
        className={`${styles.groupExpandButton} ${isExpanded ? styles.groupExpanded : ''}`}
        onClick={onToggleExpand}
        disabled={isExpanded}
        aria-label={isExpanded ? 'Expanded' : 'Expand group'}
      >
        ▼
      </button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className={styles.groupNameInput}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKeyDown}
        />
      ) : (
        <div
          className={styles.groupNameDisplay}
          onClick={handleNameClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleNameClick();
          }}
        >
          {groupName}
        </div>
      )}
      <button
        type="button"
        className={styles.groupDeleteButton}
        onClick={onDelete}
        aria-label="Delete group"
      >
        ×
      </button>
    </div>
  );
}

export default function WeightedChoices() {
  const [groups, setGroups] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('random-choices');
      if (!saved) {
        return [{ id: generateId(), name: 'Default', choices: [] }];
      }
      const parsed = JSON.parse(saved);

      // Migration: detect old flat structure (including an emptied-out flat list).
      // The persistence effect below writes the migrated shape back on mount.
      if (Array.isArray(parsed) && (parsed.length === 0 || ('weight' in parsed[0] && !('choices' in parsed[0])))) {
        return [{ id: generateId(), name: 'Default', choices: parsed }];
      }

      return parsed;
    } catch {
      return [{ id: generateId(), name: 'Default', choices: [] }];
    }
  });

  const [expandedGroupId, setExpandedGroupId] = useState(() => {
    if (groups.length > 0) {
      return groups[0].id;
    }
    return null;
  });

  const [result, setResult] = useState(null);

  useEffect(() => {
    localStorage.setItem('random-choices', JSON.stringify(groups));
  }, [groups]);

  const expandedGroup = groups.find((g) => g.id === expandedGroupId);
  const expandedChoices = expandedGroup?.choices || [];
  const totalWeight = expandedChoices.reduce((sum, c) => sum + c.weight, 0);
  const canPick = expandedChoices.filter((c) => c.label.trim()).length >= 2;

  const [ghostKeyChoice, setGhostKeyChoice] = useState(0);
  const [ghostKeyGroup, setGhostKeyGroup] = useState(0);

  const handleAddChoice = (e) => {
    const label = e.target.value.trim();
    if (label && expandedGroupId) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === expandedGroupId
            ? { ...g, choices: [...g.choices, { id: generateId(), label, weight: 1 }] }
            : g,
        ),
      );
      setGhostKeyChoice((k) => k + 1);
    }
  };

  const handleAddGroup = (e) => {
    const name = e.target.value.trim();
    if (name) {
      const newGroupId = generateId();
      setGroups((prev) => [...prev, { id: newGroupId, name, choices: [] }]);
      setExpandedGroupId(newGroupId);
      setResult(null);
      setGhostKeyGroup((k) => k + 1);
    }
  };

  const updateGroupChoices = useCallback((groupId, updateChoices) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, choices: updateChoices(g.choices) } : g)),
    );
  }, []);

  const handleChangeLabel = useCallback(
    (groupId, id, label) =>
      updateGroupChoices(groupId, (choices) =>
        choices.map((c) => (c.id === id ? { ...c, label } : c)),
      ),
    [updateGroupChoices],
  );

  const handleChangeWeight = useCallback(
    (groupId, id, weight) =>
      updateGroupChoices(groupId, (choices) =>
        choices.map((c) => (c.id === id ? { ...c, weight } : c)),
      ),
    [updateGroupChoices],
  );

  const handleDeleteChoice = useCallback(
    (groupId, id) => updateGroupChoices(groupId, (choices) => choices.filter((c) => c.id !== id)),
    [updateGroupChoices],
  );

  const handleRenameGroup = useCallback((groupId, newName) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g)));
  }, []);

  const handleDeleteGroup = useCallback(
    (groupId) => {
      const remaining = groups.filter((g) => g.id !== groupId);
      const newGroup = remaining.length === 0 ? { id: generateId(), name: 'Default', choices: [] } : null;

      setGroups((prev) => {
        const filtered = prev.filter((g) => g.id !== groupId);
        return filtered.length === 0 ? [newGroup] : filtered;
      });

      if (newGroup) {
        setExpandedGroupId(newGroup.id);
        setResult(null);
      } else if (expandedGroupId === groupId) {
        // We deleted the expanded group, so switch to another and clear its result.
        setExpandedGroupId(remaining[0].id);
        setResult(null);
      }
    },
    [groups, expandedGroupId],
  );

  const handleToggleGroup = (groupId) => {
    setExpandedGroupId(groupId);
    setResult(null);
  };

  const handlePick = () => {
    const valid = expandedChoices.filter((c) => c.label.trim());
    if (valid.length < 2) return;
    const chosen = weightedRandomChoice(valid);
    const validTotal = valid.reduce((sum, c) => sum + c.weight, 0);
    setResult({
      label: chosen.label,
      percent: Math.round((chosen.weight / validTotal) * 100),
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.groupsList}>
        {groups.map((group) => {
          const isExpanded = expandedGroupId === group.id;
          return (
            <div key={group.id} className={styles.groupContainer}>
              <GroupHeader
                groupName={group.name}
                isExpanded={isExpanded}
                onToggleExpand={() => handleToggleGroup(group.id)}
                onRename={(newName) => handleRenameGroup(group.id, newName)}
                onDelete={() => handleDeleteGroup(group.id)}
              />
              {isExpanded && (
                <div className={styles.choicesList}>
                  {group.choices.map((choice) => (
                    <ChoiceRow
                      key={choice.id}
                      label={choice.label}
                      weightValue={choice.weight}
                      totalWeight={totalWeight}
                      onChangeLabel={(l) => handleChangeLabel(group.id, choice.id, l)}
                      onChangeWeight={(w) => handleChangeWeight(group.id, choice.id, w)}
                      onDelete={() => handleDeleteChoice(group.id, choice.id)}
                    />
                  ))}
                  <div className={styles.choiceRow}>
                    <input
                      key={ghostKeyChoice}
                      type="text"
                      className={`${styles.choiceLabelInput} ${styles.choiceGhost}`}
                      defaultValue=""
                      onBlur={handleAddChoice}
                      placeholder="Add choice..."
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.groupRow}>
          <input
            key={ghostKeyGroup}
            type="text"
            className={`${styles.choiceLabelInput} ${styles.choiceGhost}`}
            defaultValue=""
            onBlur={handleAddGroup}
            placeholder="Add group..."
          />
        </div>
      </div>

      <button
        type="button"
        className={`${styles.rollButton} ${!canPick ? styles.rollButtonDisabled : ''}`}
        onClick={handlePick}
        disabled={!canPick}
      >
        PICK
      </button>

      {result && (
        <div className={styles.result}>
          <span className={styles.resultBadge}>{result.label}</span>
          <div className={styles.resultSum}>{result.percent}% chance</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `pages/random/index.jsx`** — remove the `ChoiceRow`, `GroupHeader`, and `WeightedChoices` definitions entirely. Add this import:

```js
import WeightedChoices from './WeightedChoices';
```

Remove the now-unused imports: `weightedRandomChoice, generateId` (from `../../lib/random`) and `useSwipeNumber` (from `../../lib/useSwipeNumber`) — neither is used anywhere else in `index.jsx`. Also drop `useEffect` from the `react` import (it was only used by the code just removed); `index.jsx` still needs `useCallback`, `useRef`, `useState` for `useHorizontalSwipe` and the `Random` component's own tab-index state. The import line becomes:

```js
import React, { useCallback, useRef, useState } from 'react';
```

After this step, `pages/random/index.jsx` should contain only: the `HORIZONTAL_SWIPE_THRESHOLD` constant, `useHorizontalSwipe`, `TAB_COUNT`, and the `Random` component (which now renders `<DiceRoll />` and `<WeightedChoices />` inside its two `TabPanel`s).

- [ ] **Step 3: Create `__tests__/pages/random/WeightedChoices.test.jsx`** — the migrated tests, now exercising the component directly (no tab click needed):

```jsx
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WeightedChoices from '../../../pages/random/WeightedChoices';

describe('WeightedChoices grouped structure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Migration', () => {
    it('migrates old flat array to grouped structure on load', async () => {
      const oldChoices = [
        { id: 'old1', label: 'Choice A', weight: 2 },
        { id: 'old2', label: 'Choice B', weight: 3 },
      ];
      localStorage.setItem('random-choices', JSON.stringify(oldChoices));

      render(<WeightedChoices />);

      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(Array.isArray(saved)).toBe(true);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0]).toHaveProperty('choices');
        expect(saved[0].choices).toHaveLength(2);
        expect(saved[0].choices[0].label).toBe('Choice A');
      });
    });

    it('migrates an emptied-out old flat array ("[]") into a default group', async () => {
      localStorage.setItem('random-choices', JSON.stringify([]));

      render(<WeightedChoices />);

      const addChoiceInputs = screen.getAllByPlaceholderText('Add choice...');
      expect(addChoiceInputs.length).toBeGreaterThan(0);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0].choices).toEqual([]);
      });
    });
  });

  describe('Fresh/empty state', () => {
    it('starts with a sensible default group when localStorage is empty', async () => {
      render(<WeightedChoices />);

      const addChoiceInputs = screen.getAllByPlaceholderText('Add choice...');
      expect(addChoiceInputs.length).toBeGreaterThan(0);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(Array.isArray(saved)).toBe(true);
        expect(saved[0]).toHaveProperty('name');
        expect(saved[0]).toHaveProperty('choices');
      });
    });
  });

  describe('Group management', () => {
    it('adds a new group via ghost input', async () => {
      render(<WeightedChoices />);

      const ghostGroupInput = screen.getByPlaceholderText('Add group...');
      fireEvent.change(ghostGroupInput, { target: { value: 'New Group' } });
      fireEvent.blur(ghostGroupInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.length).toBeGreaterThan(1);
      });

      expect(screen.getByText('New Group')).toBeInTheDocument();
    });

    it('renames a group via inline edit', async () => {
      const groupsData = [{ id: 'g1', name: 'First Group', choices: [] }];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const groupNameDisplay = screen.getByText('First Group');
      fireEvent.click(groupNameDisplay);

      const groupNameInput = screen.getByDisplayValue('First Group');
      fireEvent.change(groupNameInput, { target: { value: 'Renamed Group' } });
      fireEvent.blur(groupNameInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].name).toBe('Renamed Group');
      });
    });

    it('deletes a group and does not crash', async () => {
      const groupsData = [
        { id: 'g1', name: 'First Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
        { id: 'g2', name: 'Second Group', choices: [] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      expect(deleteButtons.length).toBeGreaterThan(0);

      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved.length).toBe(1);
        expect(saved[0].name).toBe('Second Group');
      });
    });

    it('keeps the replacement default group expanded after deleting the last remaining group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Only Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Default');
      });

      expect(screen.getAllByPlaceholderText('Add choice...').length).toBeGreaterThan(0);
    });
  });

  describe('Accordion behavior', () => {
    it('expands one group and collapses the previous one', async () => {
      const groupsData = [
        { id: 'g1', name: 'Group A', choices: [{ id: 'c1', label: 'Choice A', weight: 1 }] },
        { id: 'g2', name: 'Group B', choices: [{ id: 'c2', label: 'Choice B', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();

      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice B')).toBeInTheDocument();
      });
    });
  });

  describe('Per-group choice operations', () => {
    it('adds a choice to the expanded group', async () => {
      const groupsData = [{ id: 'g1', name: 'Test Group', choices: [] }];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const addChoiceInput = screen.getByPlaceholderText('Add choice...');
      fireEvent.change(addChoiceInput, { target: { value: 'New Choice' } });
      fireEvent.blur(addChoiceInput);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.length).toBeGreaterThan(0);
        expect(saved[0].choices[0].label).toBe('New Choice');
      });
    });

    it('edits a choice label in the expanded group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [{ id: 'c1', label: 'Original', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const input = screen.getByDisplayValue('Original');
      fireEvent.change(input, { target: { value: 'Updated' } });
      fireEvent.blur(input);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices[0].label).toBe('Updated');
      });
    });

    it('deletes a choice from the expanded group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Choice 2')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('random-choices'));
        expect(saved[0].choices.length).toBe(1);
        expect(saved[0].choices[0].label).toBe('Choice 2');
      });
    });

    it('PICK button is disabled when fewer than 2 valid choices', async () => {
      const groupsData = [
        { id: 'g1', name: 'Test Group', choices: [{ id: 'c1', label: 'Only Choice', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      expect(pickButton).toBeDisabled();
    });

    it('PICK button is enabled when 2+ valid choices exist', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice A', weight: 1 },
            { id: 'c2', label: 'Choice B', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      expect(pickButton).not.toBeDisabled();
    });

    it('PICK returns a result matching one of the valid choice labels', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        const resultText = screen.getByText(/First|Second/);
        expect(resultText).toBeInTheDocument();
      });
    });

    it('result resets when switching to a different expanded group', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Group A',
          choices: [
            { id: 'c1', label: 'Choice A1', weight: 1 },
            { id: 'c2', label: 'Choice A2', weight: 1 },
          ],
        },
        {
          id: 'g2',
          name: 'Group B',
          choices: [
            { id: 'c3', label: 'Choice B1', weight: 1 },
            { id: 'c4', label: 'Choice B2', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<WeightedChoices />);

      const pickButton = screen.getByRole('button', { name: /PICK/i });
      fireEvent.click(pickButton);

      await waitFor(() => {
        expect(screen.getByText(/Choice A[12]/)).toBeInTheDocument();
      });

      const expandButtons = screen.getAllByLabelText(/Expand group|Expanded/);
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(expandButtons[1]);

      await waitFor(() => {
        const results = screen.queryAllByText(/\d+% chance/);
        expect(results.length).toBe(0);
      });
    });
  });
});
```

- [ ] **Step 4: Modify `__tests__/pages/random/index.test.jsx`** — remove the entire `describe('WeightedChoices grouped structure', ...)` block (now covered by the new file). The file should retain only `describe('Random page head', ...)` and `describe('Random page background', ...)`.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS — the migrated `WeightedChoices` tests pass under their new file, and the trimmed `index.test.jsx` still passes.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add pages/random/WeightedChoices.jsx pages/random/index.jsx __tests__/pages/random/WeightedChoices.test.jsx __tests__/pages/random/index.test.jsx
git commit -m "refactor(random): extract WeightedChoices into its own file"
```

---

### Task 3: Add `shuffle`, `buildDeck`, `drawCards` to `lib/random.js`

**Files:**
- Modify: `lib/random.js`
- Modify: `lib/random.test.js`

**Interfaces:**
- Produces: `shuffle(items, rng = Math.random)` → new array, same elements, Fisher-Yates order determined by `rng`; never mutates `items`. `buildDeck()` → array of 52 `{ suit, rank }` objects. `drawCards(deck, n)` → `{ drawn, remaining }`, slicing the first `n` entries off `deck` without mutating it.

- [ ] **Step 1: Write the failing tests** — append to `lib/random.test.js`:

```js
import { clamp, weightedRandomChoice, generateId, shuffle, buildDeck, drawCards } from './random';
```

(update the existing import line at the top of the file to include the three new names, then add:)

```js
describe('shuffle', () => {
  it('returns a permutation with all original elements', () => {
    const result = shuffle([1, 2, 3, 4], () => 0.5);
    expect(result).toHaveLength(4);
    expect(result.slice().sort()).toEqual([1, 2, 3, 4]);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input, () => 0);
    expect(input).toEqual([1, 2, 3]);
  });

  it('is deterministic for a given rng (rng always 0)', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it('is deterministic for a given rng (rng near 1 leaves order unchanged)', () => {
    expect(shuffle([1, 2, 3, 4], () => 0.999999)).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(shuffle([], () => 0.5)).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle(['only'], () => 0.5)).toEqual(['only']);
  });
});

describe('buildDeck', () => {
  it('returns 52 unique cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it('includes all four suits', () => {
    const deck = buildDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['♠', '♥', '♦', '♣']));
  });

  it('includes all thirteen ranks', () => {
    const deck = buildDeck();
    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks).toEqual(
      new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']),
    );
  });
});

describe('drawCards', () => {
  const deck = [
    { rank: 'A', suit: '♠' },
    { rank: '2', suit: '♠' },
    { rank: '3', suit: '♠' },
  ];

  it('draws n cards from the front and returns the remainder', () => {
    const { drawn, remaining } = drawCards(deck, 2);
    expect(drawn).toEqual([{ rank: 'A', suit: '♠' }, { rank: '2', suit: '♠' }]);
    expect(remaining).toEqual([{ rank: '3', suit: '♠' }]);
  });

  it('does not mutate the input deck', () => {
    drawCards(deck, 1);
    expect(deck).toHaveLength(3);
  });

  it('draws zero cards without error', () => {
    const { drawn, remaining } = drawCards(deck, 0);
    expect(drawn).toEqual([]);
    expect(remaining).toEqual(deck);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/random.test.js`
Expected: FAIL with `shuffle`/`buildDeck`/`drawCards` not defined (import error).

- [ ] **Step 3: Implement in `lib/random.js`** — append after the existing `generateId` export:

```js
export const shuffle = (items, rng = Math.random) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const buildDeck = () => {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ suit, rank });
    });
  });
  return deck;
};

export const drawCards = (deck, n) => ({
  drawn: deck.slice(0, n),
  remaining: deck.slice(n),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/random.test.js`
Expected: PASS, all new and existing cases green.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/random.js lib/random.test.js
git commit -m "feat(random): add shuffle, buildDeck, drawCards helpers"
```

---

### Task 4: Add `lib/useFlickGesture.js` and `lib/useShakeDetection.js`

**Files:**
- Create: `lib/useFlickGesture.js`
- Create: `lib/useFlickGesture.test.js`
- Create: `lib/useShakeDetection.js`
- Create: `lib/useShakeDetection.test.js`

**Interfaces:**
- Produces: `useFlickGesture(onFlick)` → `{ onTouchStart, onTouchEnd }`, plus named exports `FLICK_DISTANCE_THRESHOLD` (40) and `FLICK_MAX_DURATION_MS` (400). `onFlick` is called with `{ dx, dy, distance, duration }` when a touch travels far enough fast enough.
- Produces: `useShakeDetection(onShake)` → no return value (attaches/detaches a `devicemotion` listener via `useEffect`), plus named exports `SHAKE_THRESHOLD` (15) and `SHAKE_COOLDOWN_MS` (1000). `onShake` is called with no arguments when the frame-to-frame acceleration magnitude delta crosses the threshold, at most once per cooldown window.

- [ ] **Step 1: Write the failing tests for `useFlickGesture`** — create `lib/useFlickGesture.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlickGesture, FLICK_DISTANCE_THRESHOLD, FLICK_MAX_DURATION_MS } from './useFlickGesture';

function touchStartEvent(clientX, clientY) {
  return { touches: [{ clientX, clientY }] };
}

function touchEndEvent(clientX, clientY) {
  return { changedTouches: [{ clientX, clientY }] };
}

describe('useFlickGesture', () => {
  it('fires onFlick for a fast, far touch sequence', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });
    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD + 10));
    });

    expect(onFlick).toHaveBeenCalledTimes(1);
    expect(onFlick.mock.calls[0][0].distance).toBeGreaterThanOrEqual(FLICK_DISTANCE_THRESHOLD);
  });

  it('does not fire for a touch that does not travel far enough', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });
    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD - 10));
    });

    expect(onFlick).not.toHaveBeenCalled();
  });

  it('does not fire for a slow touch even if far enough', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchStart(touchStartEvent(0, 0));
    });

    vi.setSystemTime(new Date(start.getTime() + FLICK_MAX_DURATION_MS + 50));

    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, FLICK_DISTANCE_THRESHOLD + 10));
    });

    expect(onFlick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores a touchend with no matching touchstart', () => {
    const onFlick = vi.fn();
    const { result } = renderHook(() => useFlickGesture(onFlick));

    act(() => {
      result.current.onTouchEnd(touchEndEvent(0, 100));
    });

    expect(onFlick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/useFlickGesture.test.js`
Expected: FAIL — `./useFlickGesture` module does not exist.

- [ ] **Step 3: Implement `lib/useFlickGesture.js`**

```js
import { useCallback, useRef } from 'react';

export const FLICK_DISTANCE_THRESHOLD = 40;
export const FLICK_MAX_DURATION_MS = 400;

// eslint-disable-next-line import/prefer-default-export
export function useFlickGesture(onFlick) {
  const touchRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current) return;
      const { startX, startY, startTime } = touchRef.current;
      touchRef.current = null;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const distance = Math.hypot(dx, dy);
      const duration = Date.now() - startTime;

      if (distance >= FLICK_DISTANCE_THRESHOLD && duration <= FLICK_MAX_DURATION_MS) {
        onFlick({ dx, dy, distance, duration });
      }
    },
    [onFlick],
  );

  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/useFlickGesture.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `useShakeDetection`** — create `lib/useShakeDetection.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShakeDetection, SHAKE_THRESHOLD, SHAKE_COOLDOWN_MS } from './useShakeDetection';

function dispatchMotion(z) {
  const event = new Event('devicemotion');
  event.accelerationIncludingGravity = { x: 0, y: 0, z };
  window.dispatchEvent(event);
}

describe('useShakeDetection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onShake when the acceleration delta crosses the threshold', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);

    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a small acceleration delta', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(1);

    expect(onShake).not.toHaveBeenCalled();
  });

  it('does not re-fire within the cooldown window', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(start.getTime() + SHAKE_COOLDOWN_MS - 100));
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('fires again after the cooldown window passes', () => {
    vi.useFakeTimers();
    const start = new Date(2024, 0, 1, 0, 0, 0, 0);
    vi.setSystemTime(start);

    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(start.getTime() + SHAKE_COOLDOWN_MS + 100));
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    expect(onShake).toHaveBeenCalledTimes(2);
  });

  it('ignores devicemotion events with missing acceleration data', () => {
    const onShake = vi.fn();
    renderHook(() => useShakeDetection(onShake));

    window.dispatchEvent(new Event('devicemotion'));

    expect(onShake).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run lib/useShakeDetection.test.js`
Expected: FAIL — `./useShakeDetection` module does not exist.

- [ ] **Step 7: Implement `lib/useShakeDetection.js`**

```js
import { useEffect, useRef } from 'react';

export const SHAKE_THRESHOLD = 15;
export const SHAKE_COOLDOWN_MS = 1000;

// eslint-disable-next-line import/prefer-default-export
export function useShakeDetection(onShake) {
  const lastMagnitudeRef = useRef(null);
  const lastShakeAtRef = useRef(0);

  useEffect(() => {
    const handleMotion = (event) => {
      const { x, y, z } = event.accelerationIncludingGravity || {};
      if (x == null || y == null || z == null) return;

      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const last = lastMagnitudeRef.current;
      lastMagnitudeRef.current = magnitude;
      if (last == null) return;

      const delta = Math.abs(magnitude - last);
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShakeAtRef.current > SHAKE_COOLDOWN_MS) {
        lastShakeAtRef.current = now;
        onShake();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [onShake]);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/useShakeDetection.test.js`
Expected: PASS.

- [ ] **Step 9: Run the full test suite and lint**

Run: `npm run test && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/useFlickGesture.js lib/useFlickGesture.test.js lib/useShakeDetection.js lib/useShakeDetection.test.js
git commit -m "feat(random): add useFlickGesture and useShakeDetection hooks"
```

---

### Task 5: Add Coin Flip tab

**Files:**
- Create: `pages/random/CoinFlip.jsx`
- Create: `pages/random/CoinFlip.module.css`
- Create: `__tests__/pages/random/CoinFlip.test.jsx`
- Modify: `pages/random/index.jsx`
- Modify: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Produces: `export default function CoinFlip()`, no props.
- Consumes: `.container`/`.rollButton` from `./index.module.css`; `useFlickGesture` from `../../lib/useFlickGesture` (Task 4).

- [ ] **Step 1: Write the failing test** — create `__tests__/pages/random/CoinFlip.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoinFlip from '../../../pages/random/CoinFlip';

describe('CoinFlip', () => {
  it('shows a placeholder before the first flip', () => {
    render(<CoinFlip />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows Heads when Math.random returns less than 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    expect(screen.getByText('Heads')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('shows Tails when Math.random returns 0.5 or more', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    expect(screen.getByText('Tails')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('flips via a flick gesture on the coin (fast, far touch)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    render(<CoinFlip />);
    const coin = screen.getByTestId('coin');
    fireEvent.touchStart(coin, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(coin, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('Heads')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('does not flip on a short touch that is not a flick', () => {
    render(<CoinFlip />);
    const coin = screen.getByTestId('coin');
    fireEvent.touchStart(coin, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(coin, { changedTouches: [{ clientX: 0, clientY: 5 }] });
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/CoinFlip.test.jsx`
Expected: FAIL — `pages/random/CoinFlip` module does not exist.

- [ ] **Step 3: Create `pages/random/CoinFlip.jsx`**

```jsx
import React, { useState } from 'react';
import { useFlickGesture } from '../../lib/useFlickGesture';
import indexStyles from './index.module.css';
import styles from './CoinFlip.module.css';

const flipCoin = () => (Math.random() < 0.5 ? 'Heads' : 'Tails');

export default function CoinFlip() {
  const [result, setResult] = useState(null);
  const [flipCount, setFlipCount] = useState(0);

  const handleFlip = () => {
    setResult(flipCoin());
    setFlipCount((count) => count + 1);
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
    </div>
  );
}
```

- [ ] **Step 4: Create `pages/random/CoinFlip.module.css`**

```css
.coin {
  width: 140px;
  height: 140px;
  margin: 32px auto 0;
  border-radius: 50%;
  background: #2a2a3d;
  color: #4fc3f7;
  font-size: 1.4rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: flip 0.5s ease-out;
}

@keyframes flip {
  0% {
    transform: rotateY(0deg);
  }
  50% {
    transform: rotateY(180deg);
  }
  100% {
    transform: rotateY(360deg);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/CoinFlip.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire the tab into `pages/random/index.jsx`** — add the import:

```js
import CoinFlip from './CoinFlip';
```

Change `const TAB_COUNT = 2;` to `const TAB_COUNT = 3;`. Add a third `Tab`/`TabPanel` pair right after the Choices ones:

```jsx
<Tab className={styles.tab} selectedClassName={styles.tabSelected}>
  Coin
</Tab>
```

(inside `TabList`, after the "Choices" `Tab`) and:

```jsx
<TabPanel>
  <CoinFlip />
</TabPanel>
```

(inside `Tabs`, after the Choices `TabPanel`).

- [ ] **Step 7: Modify `__tests__/pages/random/index.test.jsx`** — add a tab-rendering assertion:

```jsx
import Random from '../../../pages/random/index';
```

(already imported at top; add a new describe block using the existing `render`/`screen` imports):

```jsx
describe('Random page tabs', () => {
  it('renders a Coin tab', () => {
    render(<Random />);
    expect(screen.getByText('Coin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add pages/random/CoinFlip.jsx pages/random/CoinFlip.module.css pages/random/index.jsx __tests__/pages/random/CoinFlip.test.jsx __tests__/pages/random/index.test.jsx
git commit -m "feat(random): add Coin Flip tab"
```

---

### Task 6: Add Magic 8-Ball tab

**Files:**
- Create: `pages/random/MagicEightBall.jsx`
- Create: `pages/random/MagicEightBall.module.css`
- Create: `__tests__/pages/random/MagicEightBall.test.jsx`
- Modify: `pages/random/index.jsx`
- Modify: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Produces: `export default function MagicEightBall()`, `export const EIGHT_BALL_ANSWERS` (array of 20 strings, exported so tests can assert against the exact pool).
- Consumes: `useShakeDetection`, `SHAKE_THRESHOLD` from `../../lib/useShakeDetection` (Task 4).

- [ ] **Step 1: Write the failing test** — create `__tests__/pages/random/MagicEightBall.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MagicEightBall, { EIGHT_BALL_ANSWERS } from '../../../pages/random/MagicEightBall';
import { SHAKE_THRESHOLD } from '../../../lib/useShakeDetection';

function dispatchMotion(z) {
  const event = new Event('devicemotion');
  event.accelerationIncludingGravity = { x: 0, y: 0, z };
  window.dispatchEvent(event);
}

describe('MagicEightBall', () => {
  it('shows a placeholder before shaking', () => {
    render(<MagicEightBall />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('has exactly 20 answers', () => {
    expect(EIGHT_BALL_ANSWERS).toHaveLength(20);
  });

  it('reveals an answer from the fixed pool when the SHAKE button is tapped', () => {
    render(<MagicEightBall />);
    fireEvent.click(screen.getByRole('button', { name: /SHAKE/i }));
    const revealed = EIGHT_BALL_ANSWERS.find((answer) => screen.queryByText(answer));
    expect(revealed).toBeDefined();
  });

  it('reveals an answer when a devicemotion shake event fires', () => {
    render(<MagicEightBall />);
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    const revealed = EIGHT_BALL_ANSWERS.find((answer) => screen.queryByText(answer));
    expect(revealed).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/MagicEightBall.test.jsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `pages/random/MagicEightBall.jsx`**

```jsx
import React, { useState } from 'react';
import { useShakeDetection } from '../../lib/useShakeDetection';
import indexStyles from './index.module.css';
import styles from './MagicEightBall.module.css';

export const EIGHT_BALL_ANSWERS = [
  'It is certain',
  'It is decidedly so',
  'Without a doubt',
  'Yes definitely',
  'You may rely on it',
  'As I see it, yes',
  'Most likely',
  'Outlook good',
  'Yes',
  'Signs point to yes',
  'Reply hazy, try again',
  'Ask again later',
  'Better not tell you now',
  'Cannot predict now',
  'Concentrate and ask again',
  "Don't count on it",
  'My reply is no',
  'My sources say no',
  'Outlook not so good',
  'Very doubtful',
];

export default function MagicEightBall() {
  const [answer, setAnswer] = useState(null);

  const handleShake = () => {
    const index = Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length);
    setAnswer(EIGHT_BALL_ANSWERS[index]);
  };

  useShakeDetection(handleShake);

  const handleShakeButtonClick = async () => {
    const hasMotionPermission =
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
    if (hasMotionPermission) {
      try {
        await DeviceMotionEvent.requestPermission();
      } catch {
        // Permission denied or unavailable — handleShake below still reveals an answer.
      }
    }
    handleShake();
  };

  return (
    <div className={indexStyles.container}>
      <div className={styles.ball}>
        <div className={styles.window}>{answer || '?'}</div>
      </div>
      <button type="button" className={indexStyles.rollButton} onClick={handleShakeButtonClick}>
        SHAKE
      </button>
    </div>
  );
}
```

This is the iOS permission gate from the spec: `handleShakeButtonClick` is the required user-gesture context for `DeviceMotionEvent.requestPermission()`. On Android/desktop (no `requestPermission` method) and under `jsdom` (no `DeviceMotionEvent` at all), `hasMotionPermission` is `false`, so the function falls straight through to `handleShake()` — the button always reveals an answer regardless of platform or permission state.

- [ ] **Step 4: Create `pages/random/MagicEightBall.module.css`**

```css
.ball {
  width: 160px;
  height: 160px;
  margin: 32px auto 0;
  border-radius: 50%;
  background: #1a1a2e;
  border: 4px solid #2a2a3d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.window {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: #2a2a3d;
  color: #4fc3f7;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/MagicEightBall.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire the tab into `pages/random/index.jsx`** — add the import `import MagicEightBall from './MagicEightBall';`, change `TAB_COUNT` from `3` to `4`, and add the fourth `Tab`/`TabPanel` pair (label "8-Ball") after Coin's.

- [ ] **Step 7: Modify `__tests__/pages/random/index.test.jsx`** — add to the `Random page tabs` describe block:

```jsx
it('renders an 8-Ball tab', () => {
  render(<Random />);
  expect(screen.getByText('8-Ball')).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add pages/random/MagicEightBall.jsx pages/random/MagicEightBall.module.css pages/random/index.jsx __tests__/pages/random/MagicEightBall.test.jsx __tests__/pages/random/index.test.jsx
git commit -m "feat(random): add Magic 8-Ball tab"
```

---

### Task 7: Add Shuffle List tab

**Files:**
- Create: `pages/random/ShuffleList.jsx`
- Create: `pages/random/ShuffleList.module.css`
- Create: `__tests__/pages/random/ShuffleList.test.jsx`
- Modify: `pages/random/index.jsx`
- Modify: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Consumes: `shuffle` from `../../lib/random` (Task 3).
- Produces: `export default function ShuffleList()`, no props. Persists to `localStorage` key `random-shuffle-list`.

- [ ] **Step 1: Write the failing test** — create `__tests__/pages/random/ShuffleList.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShuffleList from '../../../pages/random/ShuffleList';

describe('ShuffleList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists the typed list to localStorage', () => {
    render(<ShuffleList />);
    const textarea = screen.getByPlaceholderText('One item per line');
    fireEvent.change(textarea, { target: { value: 'Alice\nBob\nCarol' } });
    expect(localStorage.getItem('random-shuffle-list')).toBe('Alice\nBob\nCarol');
  });

  it('restores a persisted list on mount', () => {
    localStorage.setItem('random-shuffle-list', 'Dave\nErin');
    render(<ShuffleList />);
    expect(screen.getByPlaceholderText('One item per line')).toHaveValue('Dave\nErin');
  });

  it('shuffles the non-empty trimmed lines and displays them', () => {
    render(<ShuffleList />);
    const textarea = screen.getByPlaceholderText('One item per line');
    fireEvent.change(textarea, { target: { value: 'Alice\n\n  Bob  \nCarol' } });
    fireEvent.click(screen.getByRole('button', { name: /SHUFFLE/i }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('does not display a result before shuffling', () => {
    render(<ShuffleList />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/ShuffleList.test.jsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `pages/random/ShuffleList.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { shuffle } from '../../lib/random';
import indexStyles from './index.module.css';
import styles from './ShuffleList.module.css';

const STORAGE_KEY = 'random-shuffle-list';

export default function ShuffleList() {
  const [text, setText] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  });
  const [shuffled, setShuffled] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  const handleShuffle = () => {
    const items = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setShuffled(shuffle(items));
  };

  return (
    <div className={indexStyles.container}>
      <textarea
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One item per line"
      />
      <button type="button" className={indexStyles.rollButton} onClick={handleShuffle}>
        SHUFFLE
      </button>
      {shuffled && (
        <div className={indexStyles.result}>
          <ol className={styles.resultList}>
            {shuffled.map((item, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={idx}>{item}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `pages/random/ShuffleList.module.css`**

```css
.input {
  width: 100%;
  min-height: 160px;
  background: #2a2a3d;
  border: none;
  border-radius: 12px;
  color: #e0e0e0;
  font-size: 0.95rem;
  padding: 16px;
  resize: vertical;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
}

.resultList {
  text-align: left;
  max-width: 280px;
  margin: 0 auto;
  padding-left: 24px;
  color: #e0e0e0;
}

.resultList li {
  padding: 4px 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/ShuffleList.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire the tab into `pages/random/index.jsx`** — add `import ShuffleList from './ShuffleList';`, change `TAB_COUNT` from `4` to `5`, add the fifth `Tab`/`TabPanel` pair (label "Shuffle") after 8-Ball's.

- [ ] **Step 7: Modify `__tests__/pages/random/index.test.jsx`** — add:

```jsx
it('renders a Shuffle tab', () => {
  render(<Random />);
  expect(screen.getByText('Shuffle')).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add pages/random/ShuffleList.jsx pages/random/ShuffleList.module.css pages/random/index.jsx __tests__/pages/random/ShuffleList.test.jsx __tests__/pages/random/index.test.jsx
git commit -m "feat(random): add Shuffle List tab"
```

---

### Task 8: Add Card Draw tab

**Files:**
- Create: `pages/random/CardDraw.jsx`
- Create: `pages/random/CardDraw.module.css`
- Create: `__tests__/pages/random/CardDraw.test.jsx`
- Modify: `pages/random/index.jsx`
- Modify: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Consumes: `buildDeck`, `drawCards`, `shuffle` from `../../lib/random` (Task 3); `useSwipeNumber` from `../../lib/useSwipeNumber`; `useFlickGesture` from `../../lib/useFlickGesture` (Task 4).
- Produces: `export default function CardDraw()`, no props.

- [ ] **Step 1: Write the failing test** — create `__tests__/pages/random/CardDraw.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CardDraw from '../../../pages/random/CardDraw';

describe('CardDraw', () => {
  it('starts with a full 52-card deck and no drawn cards', () => {
    render(<CardDraw />);
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('draws the requested number of cards and reduces the deck', () => {
    render(<CardDraw />);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
  });

  it('disables DRAW once the requested count exceeds the remaining deck', () => {
    render(<CardDraw />);
    const input = document.getElementById('drawCount');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52' } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(screen.getByRole('button', { name: /^DRAW$/i })).toBeDisabled();
  });

  it('NEW DECK resets to 52 cards and clears drawn cards', () => {
    render(<CardDraw />);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    fireEvent.click(screen.getByRole('button', { name: /NEW DECK/i }));
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('flicking the deck face draws exactly one card', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
  });

  it('a short touch on the deck face does not draw', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 5 }] });
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('flicking an empty deck does nothing', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    const input = document.getElementById('drawCount');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));

    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('0 cards left')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/CardDraw.test.jsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `pages/random/CardDraw.jsx`**

```jsx
import React, { useState } from 'react';
import { buildDeck, drawCards, shuffle } from '../../lib/random';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import indexStyles from './index.module.css';
import styles from './CardDraw.module.css';

export default function CardDraw() {
  const [deck, setDeck] = useState(() => shuffle(buildDeck()));
  const [drawCount, setDrawCount] = useState(1);
  const [drawn, setDrawn] = useState([]);

  const count = useSwipeNumber(drawCount, setDrawCount, 1, 52);

  const performDraw = (n) => {
    if (deck.length < n) return;
    const result = drawCards(deck, n);
    setDrawn(result.drawn);
    setDeck(result.remaining);
  };

  const handleDraw = () => performDraw(drawCount);
  const handleFlickDraw = () => performDraw(1);

  const flick = useFlickGesture(handleFlickDraw);

  const handleNewDeck = () => {
    setDeck(shuffle(buildDeck()));
    setDrawn([]);
  };

  const canDraw = deck.length >= drawCount;

  return (
    <div className={indexStyles.container}>
      <div
        data-testid="deckFace"
        className={styles.deckFace}
        onTouchStart={flick.onTouchStart}
        onTouchEnd={flick.onTouchEnd}
      >
        🂠
      </div>

      <div className={indexStyles.settingRow}>
        <span className={indexStyles.settingLabel}>How many cards?</span>
        <input
          id="drawCount"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={52}
          className={indexStyles.settingInput}
          value={count.inputValue}
          placeholder={count.placeholder}
          onChange={count.onChange}
          onFocus={count.onFocus}
          onBlur={count.onBlur}
          onKeyDown={count.onKeyDown}
          onTouchStart={count.onTouchStart}
          onTouchMove={count.onTouchMove}
          onTouchEnd={count.onTouchEnd}
        />
      </div>

      <div className={styles.deckRow}>
        <span className={styles.deckCount}>{deck.length} cards left</span>
        <button type="button" className={styles.newDeckButton} onClick={handleNewDeck}>
          NEW DECK
        </button>
      </div>

      <button
        type="button"
        className={`${indexStyles.rollButton} ${!canDraw ? indexStyles.rollButtonDisabled : ''}`}
        onClick={handleDraw}
        disabled={!canDraw}
      >
        DRAW
      </button>

      {drawn.length > 0 && (
        <div className={indexStyles.result}>
          <div className={styles.cardsRow}>
            {drawn.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.card}>
                {card.rank}
                {card.suit}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

`performDraw` is shared by both trigger paths (bulk DRAW button and flick-the-deck) so the "not enough cards left" guard lives in exactly one place; `canDraw` (used only for the DRAW button's disabled state) is a separate, simpler check since the button needs a boolean to render, while the flick path just silently no-ops via the same guard inside `performDraw`.

- [ ] **Step 4: Create `pages/random/CardDraw.module.css`**

```css
.deckFace {
  width: 96px;
  height: 130px;
  margin: 0 auto 16px;
  background: #2a2a3d;
  border: 2px solid #3a3a5a;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  color: #4fc3f7;
  -webkit-tap-highlight-color: transparent;
}

.deckRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 0 8px;
}

.deckCount {
  font-size: 0.85rem;
  color: #999;
}

.newDeckButton {
  background: none;
  border: 1px solid #444;
  color: #ccc;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.newDeckButton:hover {
  border-color: #666;
}

.cardsRow {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  height: 72px;
  background: #2a2a3d;
  border-radius: 8px;
  font-size: 1.2rem;
  font-weight: 700;
  color: #4fc3f7;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/CardDraw.test.jsx`
Expected: PASS.

- [ ] **Step 6: Wire the tab into `pages/random/index.jsx`** — add `import CardDraw from './CardDraw';`, change `TAB_COUNT` from `5` to `6`, add the sixth `Tab`/`TabPanel` pair (label "Cards") after Shuffle's.

- [ ] **Step 7: Modify `__tests__/pages/random/index.test.jsx`** — add:

```jsx
it('renders a Cards tab', () => {
  render(<Random />);
  expect(screen.getByText('Cards')).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS. All 6 tabs (Dice, Choices, Coin, 8-Ball, Shuffle, Cards) now render.

- [ ] **Step 9: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add pages/random/CardDraw.jsx pages/random/CardDraw.module.css pages/random/index.jsx __tests__/pages/random/CardDraw.test.jsx __tests__/pages/random/index.test.jsx
git commit -m "feat(random): add Card Draw tab"
```

---

### Task 9: Add spinner visual layer to Weighted Choices

**Files:**
- Modify: `pages/random/WeightedChoices.jsx`
- Create: `pages/random/WeightedChoices.module.css`
- Modify: `__tests__/pages/random/WeightedChoices.test.jsx`

**Interfaces:**
- Consumes: the existing `handlePick`/`weightedRandomChoice` result — the spinner never calls `Math.random` itself.
- No change to `WeightedChoices`'s exported shape (still a no-props default export) or to `localStorage` data shape.

- [ ] **Step 1: Write the failing tests** — append to `__tests__/pages/random/WeightedChoices.test.jsx`:

```jsx
describe('Spinner', () => {
  it('renders a wheel with a data-testid for the current group', () => {
    const groupsData = [
      {
        id: 'g1',
        name: 'Test Group',
        choices: [
          { id: 'c1', label: 'First', weight: 1 },
          { id: 'c2', label: 'Second', weight: 1 },
        ],
      },
    ];
    localStorage.setItem('random-choices', JSON.stringify(groupsData));

    render(<WeightedChoices />);
    expect(screen.getByTestId('choiceWheel')).toBeInTheDocument();
  });

  it('PICK still returns a result matching a valid choice label with the spinner present', async () => {
    const groupsData = [
      {
        id: 'g1',
        name: 'Test Group',
        choices: [
          { id: 'c1', label: 'First', weight: 1 },
          { id: 'c2', label: 'Second', weight: 1 },
        ],
      },
    ];
    localStorage.setItem('random-choices', JSON.stringify(groupsData));

    render(<WeightedChoices />);
    fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

    await waitFor(() => {
      expect(screen.getByText(/First|Second/)).toBeInTheDocument();
    });
  });

  it('rotates the wheel after a pick', async () => {
    const groupsData = [
      {
        id: 'g1',
        name: 'Test Group',
        choices: [
          { id: 'c1', label: 'First', weight: 1 },
          { id: 'c2', label: 'Second', weight: 1 },
        ],
      },
    ];
    localStorage.setItem('random-choices', JSON.stringify(groupsData));

    render(<WeightedChoices />);
    const wheel = screen.getByTestId('choiceWheel');
    expect(wheel.style.transform).toBe('rotate(0deg)');

    fireEvent.click(screen.getByRole('button', { name: /PICK/i }));

    await waitFor(() => {
      expect(wheel.style.transform).not.toBe('rotate(0deg)');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/random/WeightedChoices.test.jsx`
Expected: FAIL — no element with `data-testid="choiceWheel"` exists yet.

- [ ] **Step 3: Create `pages/random/WeightedChoices.module.css`**

```css
.wheelWrap {
  position: relative;
  width: 220px;
  height: 220px;
  margin: 16px auto;
}

.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition: transform 3s cubic-bezier(0.15, 0.85, 0.25, 1);
}

.wheelPointer {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 16px solid #e0e0e0;
  z-index: 1;
}
```

- [ ] **Step 4: Modify `pages/random/WeightedChoices.jsx`**

Add the import, alongside the existing `styles` import:

```js
import wheelStyles from './WeightedChoices.module.css';
```

Add this constant and helper above the `WeightedChoices` function (after `GroupHeader`'s definition):

```js
const WHEEL_COLORS = ['#4fc3f7', '#81d4fa', '#0288d1', '#26c6da', '#4dd0e1', '#0097a7'];

function buildWheelSegments(choices) {
  const total = choices.reduce((sum, c) => sum + c.weight, 0);
  let cursor = 0;
  return choices.map((choice, idx) => {
    const sweep = total > 0 ? (choice.weight / total) * 360 : 0;
    const segment = {
      id: choice.id,
      color: WHEEL_COLORS[idx % WHEEL_COLORS.length],
      start: cursor,
      end: cursor + sweep,
    };
    cursor += sweep;
    return segment;
  });
}
```

Inside `WeightedChoices`, add a `wheelRotation` state next to the existing `result` state:

```js
const [wheelRotation, setWheelRotation] = useState(0);
```

Modify `handlePick` to also update `wheelRotation`, using the segment computed from the same `chosen`/`valid` values it already has — this is presentation only, no new randomness:

```js
const handlePick = () => {
  const valid = expandedChoices.filter((c) => c.label.trim());
  if (valid.length < 2) return;
  const chosen = weightedRandomChoice(valid);
  const validTotal = valid.reduce((sum, c) => sum + c.weight, 0);
  setResult({
    label: chosen.label,
    percent: Math.round((chosen.weight / validTotal) * 100),
  });

  const segments = buildWheelSegments(valid);
  const chosenSegment = segments.find((s) => s.id === chosen.id);
  const center = (chosenSegment.start + chosenSegment.end) / 2;
  setWheelRotation((prev) => prev - (prev % 360) + 4 * 360 + center);
};
```

Add the wheel markup right above the existing `groupsList` div (inside the top-level `container` div, before `<div className={styles.groupsList}>`):

```jsx
{(() => {
  const wheelSegments = buildWheelSegments(expandedChoices.filter((c) => c.label.trim()));
  const gradient =
    wheelSegments.length > 0
      ? wheelSegments.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(', ')
      : '#2a2a3d 0deg 360deg';
  return (
    <div className={wheelStyles.wheelWrap}>
      <div className={wheelStyles.wheelPointer} />
      <div
        data-testid="choiceWheel"
        className={wheelStyles.wheel}
        style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${wheelRotation}deg)` }}
      />
    </div>
  );
})()}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/random/WeightedChoices.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS — all existing Weighted Choices data/pick/persistence tests still pass unchanged; the spinner is additive.

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add pages/random/WeightedChoices.jsx pages/random/WeightedChoices.module.css __tests__/pages/random/WeightedChoices.test.jsx
git commit -m "feat(random): add spinner visual layer to Weighted Choices"
```

---

### Task 10: Update `.claude/rules/random.md`

**Files:**
- Modify: `.claude/rules/random.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rewrite `.claude/rules/random.md`** to reflect the new layout and tools:

```md
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/random.md
git commit -m "docs(random): update rules doc for new tabs, gestures, and file layout"
```

---

## Self-Review

**Spec coverage:** monolith split (Tasks 1-2), `lib/random.js` helpers (Task 3), shared gesture/sensor hooks `useFlickGesture`/`useShakeDetection` (Task 4), Coin Flip incl. flick (Task 5), Magic 8-Ball incl. shake + iOS permission gate (Task 6), Shuffle List (Task 7), Card Draw incl. flick-the-deck (Task 8), Weighted Choices spinner (Task 9), and rules-doc update (Task 10, not in the spec's own list but a natural follow-on to keep `.claude/rules/random.md` from going stale) — every spec section, including the gesture/shake addendum, maps to a task.

**Placeholder scan:** No "TBD"/"TODO"; every step has literal code. Fixed.

**Type consistency:** `shuffle(items, rng = Math.random)`, `buildDeck()`, `drawCards(deck, n)` signatures match between Task 3's implementation and their Task 7/8 call sites. `useFlickGesture(onFlick)` → `{ onTouchStart, onTouchEnd }` and `useShakeDetection(onShake)` (Task 4) match their usage in Tasks 5/6/8. `FLICK_DISTANCE_THRESHOLD`/`FLICK_MAX_DURATION_MS`/`SHAKE_THRESHOLD`/`SHAKE_COOLDOWN_MS` are the same named constants in both the Global Constraints section and every task/test that imports them. `EIGHT_BALL_ANSWERS` name matches between Task 6's component and its test import. `data-testid="choiceWheel"` matches between Task 9's markup and its test; `data-testid="coin"` (Task 5) and `data-testid="deckFace"` (Task 8) likewise match between each component and its test.
