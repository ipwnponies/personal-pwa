# Random Undo Toast on Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an undo toast to the Random app's Weighted Choices tab so deleting a choice or a group can be reversed for a few seconds before it's final.

**Architecture:** Both delete handlers (`handleDeleteChoice`, `handleDeleteGroup`) in `pages/random/index.jsx`'s `WeightedChoices` component snapshot `{ groups, expandedGroupId, result }` before mutating, then hand that snapshot to a shared `scheduleUndo` helper that shows a toast and starts a 5s auto-dismiss timer. Clicking Undo restores the snapshot verbatim; a new delete cancels and replaces any pending undo.

**Tech Stack:** React (hooks: `useState`, `useCallback`, `useRef`, `useEffect`), CSS Modules, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-random-undo-toast-design.md`

## Global Constraints

- `UNDO_TIMEOUT_MS = 5000` — auto-dismiss delay, exact value from spec.
- Toast message format: `"<label>" deleted` for a choice, `"<group name>" deleted` for a group (double quotes literal, per spec).
- Only one `pendingUndo` at a time — a new delete replaces the current one; the replaced one is not undoable afterward (no undo stack).
- Snapshot restores `groups`, `expandedGroupId`, and `result` together, always — never partially.
- No changes to `DiceRoll`, `localStorage` persistence timing, or non-delete choice/group operations (this task's scope is delete + undo only).

---

## File Structure

- **Modify `pages/random/index.jsx`**: `WeightedChoices` component gains `pendingUndo` state, `undoTimerRef`, `scheduleUndo`/`handleUndo` callbacks, updated `handleDeleteChoice`/`handleDeleteGroup`, and a toast render block.
- **Modify `pages/random/index.module.css`**: new `.toast`, `.toastMessage`, `.toastUndoButton` classes.
- **Modify `__tests__/pages/random/index.test.jsx`**: new `Undo toast on delete` describe block nested inside the existing `WeightedChoices grouped structure` describe (so it inherits that block's `localStorage.clear()` `beforeEach`/`afterEach`); `act` added to the RTL import for the fake-timer test.

---

### Task 1: Choice-delete undo — state, helpers, toast UI

**Files:**
- Modify: `pages/random/index.jsx` (top-level constants, `WeightedChoices` function, `handleDeleteChoice`, JSX return)
- Modify: `pages/random/index.module.css`
- Test: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Produces: `UNDO_TIMEOUT_MS` (module constant, `5000`), `pendingUndo` state shape `{ snapshot: { groups, expandedGroupId, result }, message: string } | null`, `scheduleUndo(snapshot, message)`, `handleUndo()` — all consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing test**

Open `__tests__/pages/random/index.test.jsx`. Inside the existing `describe('WeightedChoices grouped structure', ...)` block, after the closing `});` of the `describe('Per-group choice operations', ...)` block (right before the final closing `});` of `WeightedChoices grouped structure`), add:

```jsx
  describe('Undo toast on delete', () => {
    it('shows a toast with the choice label after deleting a choice, and Undo restores it', async () => {
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);

      expect(screen.getByText('"Choice 1" deleted')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Choice 1')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
      expect(screen.queryByText('"Choice 1" deleted')).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "shows a toast with the choice label"`
Expected: FAIL — `screen.getByText('"Choice 1" deleted')` throws (no toast exists yet).

- [ ] **Step 3: Add `UNDO_TIMEOUT_MS` constant**

In `pages/random/index.jsx`, near the top with the other module constants (after `const HORIZONTAL_SWIPE_THRESHOLD = 50;`), add:

```js
const UNDO_TIMEOUT_MS = 5000;
```

- [ ] **Step 4: Add `pendingUndo` state, `undoTimerRef`, `scheduleUndo`, `handleUndo`, and cleanup effect**

In `WeightedChoices`, immediately after the existing:

```js
  const [result, setResult] = useState(null);
```

add:

```js

  const [pendingUndo, setPendingUndo] = useState(null);
  const undoTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    },
    [],
  );

  const scheduleUndo = useCallback((snapshot, message) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setPendingUndo({ snapshot, message });
    undoTimerRef.current = setTimeout(() => {
      setPendingUndo(null);
      undoTimerRef.current = null;
    }, UNDO_TIMEOUT_MS);
  }, []);

  const handleUndo = useCallback(() => {
    if (!pendingUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setGroups(pendingUndo.snapshot.groups);
    setExpandedGroupId(pendingUndo.snapshot.expandedGroupId);
    setResult(pendingUndo.snapshot.result);
    setPendingUndo(null);
  }, [pendingUndo]);
```

- [ ] **Step 5: Wire `scheduleUndo` into `handleDeleteChoice`**

Replace the existing:

```js
  const handleDeleteChoice = useCallback(
    (groupId, id) => updateGroupChoices(groupId, (choices) => choices.filter((c) => c.id !== id)),
    [updateGroupChoices],
  );
```

with:

```js
  const handleDeleteChoice = useCallback(
    (groupId, id) => {
      const group = groups.find((g) => g.id === groupId);
      const choice = group?.choices.find((c) => c.id === id);
      const snapshot = { groups, expandedGroupId, result };
      updateGroupChoices(groupId, (choices) => choices.filter((c) => c.id !== id));
      if (choice) {
        scheduleUndo(snapshot, `"${choice.label}" deleted`);
      }
    },
    [groups, expandedGroupId, result, updateGroupChoices, scheduleUndo],
  );
```

- [ ] **Step 6: Render the toast**

In the JSX returned by `WeightedChoices`, immediately after the closing `)}` of the existing `{result && (...)}` block and before the final `</div>` that closes the component's root `<div className={styles.container}>`, add:

```jsx

      {pendingUndo && (
        <div className={styles.toast}>
          <span className={styles.toastMessage}>{pendingUndo.message}</span>
          <button type="button" className={styles.toastUndoButton} onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
```

- [ ] **Step 7: Add toast CSS**

In `pages/random/index.module.css`, after the `.rollButtonDisabled` rule (and before the `@media (min-width: 768px)` block), add:

```css
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  background: #2a2a3d;
  border: 1px solid #3a3a5a;
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.toastMessage {
  font-size: 0.9rem;
  color: #e0e0e0;
}

.toastUndoButton {
  background: none;
  border: none;
  color: #4fc3f7;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.toastUndoButton:hover {
  color: #81d4fa;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "shows a toast with the choice label"`
Expected: PASS

- [ ] **Step 9: Run the full file to check for regressions**

Run: `npx vitest run __tests__/pages/random/index.test.jsx`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 10: Commit**

```bash
git add pages/random/index.jsx pages/random/index.module.css __tests__/pages/random/index.test.jsx
git commit -m "feat: add undo toast for choice deletion in Random app"
```

---

### Task 2: Group-delete undo — non-last and last-group cases

**Files:**
- Modify: `pages/random/index.jsx` (`handleDeleteGroup`)
- Test: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Consumes: `scheduleUndo(snapshot, message)` from Task 1, unchanged.
- Produces: nothing new consumed by later tasks — `handleDeleteGroup` behavior only.

- [ ] **Step 1: Write the failing tests**

In the `Undo toast on delete` describe block added in Task 1, after the existing `it(...)`, add two more tests:

```jsx
    it('shows a toast with the group name after deleting a non-last group, and Undo restores it and its expanded state', async () => {
      const groupsData = [
        { id: 'g1', name: 'Group A', choices: [{ id: 'c1', label: 'Choice A', weight: 1 }] },
        { id: 'g2', name: 'Group B', choices: [{ id: 'c2', label: 'Choice B', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      expect(screen.getByText('"Group A" deleted')).toBeInTheDocument();
      expect(screen.queryByText('Group A')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Choice A')).toBeInTheDocument();
    });

    it('shows a toast after deleting the last remaining group, and Undo restores the original group, removing the synthetic Default group', async () => {
      const groupsData = [
        { id: 'g1', name: 'Only Group', choices: [{ id: 'c1', label: 'Choice 1', weight: 1 }] },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[0]);

      expect(screen.getByText('"Only Group" deleted')).toBeInTheDocument();
      expect(screen.getByText('Default')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.getByText('Only Group')).toBeInTheDocument();
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "deleting a non-last group"`
Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "deleting the last remaining group"`
Expected: both FAIL — no toast is shown on group delete yet.

- [ ] **Step 3: Wire `scheduleUndo` into `handleDeleteGroup`**

Replace the existing:

```js
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
```

with:

```js
  const handleDeleteGroup = useCallback(
    (groupId) => {
      const deletedGroup = groups.find((g) => g.id === groupId);
      const snapshot = { groups, expandedGroupId, result };
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

      if (deletedGroup) {
        scheduleUndo(snapshot, `"${deletedGroup.name}" deleted`);
      }
    },
    [groups, expandedGroupId, result, scheduleUndo],
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "deleting a non-last group"`
Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "deleting the last remaining group"`
Expected: both PASS

- [ ] **Step 5: Run the full file to check for regressions**

Run: `npx vitest run __tests__/pages/random/index.test.jsx`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add pages/random/index.jsx __tests__/pages/random/index.test.jsx
git commit -m "feat: add undo toast for group deletion in Random app"
```

---

### Task 3: Superseding deletes and timeout finalization

**Files:**
- Modify: `__tests__/pages/random/index.test.jsx` (RTL import, two new tests)

No production code changes — this task verifies the `scheduleUndo`/`handleUndo` behavior already implemented in Task 1 (single-slot replacement, timer-driven finalization) with tests exercising those paths directly.

**Interfaces:**
- Consumes: `scheduleUndo`, `handleUndo`, `UNDO_TIMEOUT_MS` from Task 1 — unchanged, no new production interfaces.

- [ ] **Step 1: Add `act` to the RTL import**

In `__tests__/pages/random/index.test.jsx`, change:

```js
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

to:

```js
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
```

- [ ] **Step 2: Write the failing tests**

In the `Undo toast on delete` describe block, after the two tests added in Task 2, add:

```jsx
    it('a second delete before Undo is clicked replaces the toast; the first deletion is no longer undoable', async () => {
      const groupsData = [
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'Choice 1', weight: 1 },
            { id: 'c2', label: 'Choice 2', weight: 1 },
            { id: 'c3', label: 'Choice 3', weight: 1 },
          ],
        },
      ];
      localStorage.setItem('random-choices', JSON.stringify(groupsData));

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Choice 1')).toBeInTheDocument();
      });

      let deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);
      expect(screen.getByText('"Choice 1" deleted')).toBeInTheDocument();

      deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);
      expect(screen.getByText('"Choice 2" deleted')).toBeInTheDocument();
      expect(screen.queryByText('"Choice 1" deleted')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.getByDisplayValue('Choice 2')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Choice 1')).not.toBeInTheDocument();
    });

    it('auto-dismisses the toast after the undo timeout, leaving the deletion final', async () => {
      vi.useFakeTimers();
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

      render(<Random />);
      const choicesTab = screen.getByText('Choices');
      fireEvent.click(choicesTab);

      const deleteButtons = screen.getAllByText('×');
      fireEvent.click(deleteButtons[1]);
      expect(screen.getByText('"Choice 1" deleted')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText('"Choice 1" deleted')).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue('Choice 1')).not.toBeInTheDocument();

      vi.useRealTimers();
    });
```

- [ ] **Step 3: Run tests to verify they fail or pass unexpectedly for the wrong reason**

Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "a second delete before Undo"`
Run: `npx vitest run __tests__/pages/random/index.test.jsx -t "auto-dismisses the toast"`
Expected: both PASS immediately, since Task 1's `scheduleUndo` (single `pendingUndo` slot, `clearTimeout`-then-replace) and its `setTimeout` already implement this behavior — this task's tests are the verification, not new implementation. If either fails, the bug is in Task 1's `scheduleUndo`/`handleUndo`, not new code introduced here; fix that implementation before proceeding.

- [ ] **Step 4: Run the full file to check for regressions**

Run: `npx vitest run __tests__/pages/random/index.test.jsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add __tests__/pages/random/index.test.jsx
git commit -m "test: verify undo-toast superseding and timeout finalization"
```
