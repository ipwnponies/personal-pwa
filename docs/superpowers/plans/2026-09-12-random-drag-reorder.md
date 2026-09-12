# Random Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add long-press drag-reorder for groups and for in-group choices in the Random app's Weighted Choices tab.

**Architecture:** One `DndContext` in `WeightedChoices` with a custom pointer sensor (long-press, excludes interactive descendants) and a keyboard sensor. Two nested `SortableContext`s — groups (always mounted) and the expanded group's choices (mounted only while expanded) — share one `handleDragEnd` that branches on which array the dragged id belongs to. A single pure helper, `reorderById`, does the actual array-splice for both.

**Tech Stack:** React 18 / Next.js pages router, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new deps), vitest + `@testing-library/react` (existing).

**Spec:** `docs/superpowers/specs/2026-09-12-random-drag-reorder-design.md`

## Global Constraints

- Exactly three new deps, no others: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- No cross-group choice drag — a choice can only reorder within its own group.
- No new files — `pages/random/index.jsx` stays monolithic per `.claude/rules/random.md`.
- No new persisted fields — only array order changes within the existing `{ id, name, choices }` / `{ id, label, weight }` shape.
- `lib/random.js` stays pure-function-only (no React/DOM imports) — matches its existing `clamp`/`weightedRandomChoice`/`generateId` style.
- Drag-activation delay: 200ms, tolerance 8px (long-press covers both touch and mouse via one `PointerSensor`).
- Drag axis restricted to vertical (via an inlined `restrictToVerticalAxis` modifier on the shared `DndContext`, Task 2) so it can't be misread by the page's existing horizontal tab-swipe gesture.
- Actual pointer-drag interaction is verified manually in-browser, not simulated in jsdom (per spec's Testing section) — automated tests cover the pure reorder helper and existing regression coverage only.

---

## Task 1: `reorderById` pure helper

**Files:**
- Modify: `package.json`, `package-lock.json` (new deps)
- Modify: `lib/random.js`
- Test: `lib/random.test.js`

**Interfaces:**
- Produces: `reorderById(items: Array<{id}>, activeId, overId) => Array<{id}>` — exported from `lib/random.js`. Returns a new array with the item at `activeId` moved to `overId`'s position; returns the *same* array reference unchanged if `activeId === overId` or either id isn't found. Used by both group reorder and choice reorder in later tasks.

- [ ] **Step 1: Install dependencies**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [ ] **Step 2: Write the failing tests**

Add to `lib/random.test.js` (new import and new `describe` block):

```js
import { clamp, weightedRandomChoice, generateId, reorderById } from './random';
```

```js
describe('reorderById', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves an item earlier in the array', () => {
    const result = reorderById(items, 'c', 'a');
    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves an item later in the array', () => {
    const result = reorderById(items, 'a', 'c');
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns the same array reference when activeId equals overId', () => {
    const result = reorderById(items, 'b', 'b');
    expect(result).toBe(items);
  });

  it('returns the array unchanged when activeId is not found', () => {
    const result = reorderById(items, 'missing', 'a');
    expect(result).toBe(items);
  });

  it('returns the array unchanged when overId is not found', () => {
    const result = reorderById(items, 'a', 'missing');
    expect(result).toBe(items);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    reorderById(items, 'a', 'c');
    expect(items).toEqual(copy);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/random.test.js`
Expected: FAIL — `reorderById` is not exported / undefined.

- [ ] **Step 4: Implement `reorderById`**

Add to `lib/random.js`:

```js
import { arrayMove } from '@dnd-kit/sortable';
```

```js
export const reorderById = (items, activeId, overId) => {
  if (activeId === overId) return items;
  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);
  if (oldIndex === -1 || newIndex === -1) return items;
  return arrayMove(items, oldIndex, newIndex);
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/random.test.js`
Expected: PASS, all `reorderById` and existing `clamp`/`weightedRandomChoice`/`generateId` tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/random.js lib/random.test.js
git commit -m "feat(random): add reorderById helper for drag reorder"
```

---

## Task 2: Group drag-reorder

**Files:**
- Modify: `pages/random/index.jsx` (imports at top; new sensor class near `HORIZONTAL_SWIPE_THRESHOLD`; `GroupHeader` at ~line 226-303; `WeightedChoices` at ~line 305-514)
- Modify: `pages/random/index.module.css` (dragging state)

**Interfaces:**
- Consumes: `reorderById` from `lib/random.js` (Task 1).
- Produces: `GroupHeader` now requires an `id` prop (the group's id). `WeightedChoices` gains `handleDragEnd` (group branch only for this task — extended in Task 3) and a `sensors` value, both local to the component; nothing outside this file depends on them.

- [ ] **Step 1: Add dnd-kit imports and the interactive-element-excluding sensor**

At the top of `pages/random/index.jsx`, change:

```js
import { weightedRandomChoice, generateId } from '../../lib/random';
```

to:

```js
import { weightedRandomChoice, generateId, reorderById } from '../../lib/random';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

Just below `const HORIZONTAL_SWIPE_THRESHOLD = 50;`, add:

```js
const DRAG_ACTIVATION_CONSTRAINT = { delay: 200, tolerance: 8 };

// A row is only draggable by a long-press outside its interactive
// controls (label/weight inputs, buttons) — otherwise a long-press on
// the weight input would hijack its own swipe-to-adjust gesture.
class RowPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown',
      handler: ({ nativeEvent: event }, { onActivation }) => {
        if (!event.isPrimary || event.button !== 0) return false;
        if (event.target.closest('input, button, [role="button"]')) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

// Locks an in-progress drag to vertical movement, so it can't be misread
// by the page-level horizontal tab-swipe gesture (useHorizontalSwipe).
// Same one-line transform as @dnd-kit/modifiers' restrictToVerticalAxis —
// inlined to avoid a 4th dnd-kit dependency for a single-line function.
const restrictToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });
```

- [ ] **Step 2: Make `GroupHeader` sortable**

Change the `GroupHeader` signature and body (currently `pages/random/index.jsx:226-303`):

```js
// eslint-disable-next-line react/prop-types
function GroupHeader({ id, groupName, isExpanded, onToggleExpand, onRename, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(groupName);
  const inputRef = useRef(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };
```

(Everything else in the function body — `handleNameClick`, `handleNameBlur`, `handleNameKeyDown`, the `useEffect` — is unchanged.)

Change the returned root `<div className={styles.groupHeader}>` to:

```js
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={`${styles.groupHeader} ${isDragging ? styles.dragging : ''}`}
    >
```

(The rest of the JSX inside — expand button, name display/input, delete button — is unchanged.)

- [ ] **Step 3: Wire `DndContext` + `SortableContext` + `handleDragEnd` (groups only) into `WeightedChoices`**

Inside `WeightedChoices` (currently `pages/random/index.jsx:305-514`), after the existing `const handleToggleGroup = ...` block and before `const handlePick = ...`, add:

```js
  const sensors = useSensors(
    useSensor(RowPointerSensor, { activationConstraint: DRAG_ACTIVATION_CONSTRAINT }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setGroups((prev) => reorderById(prev, active.id, over.id));
  }, []);
```

Change the groups-rendering block from:

```jsx
      <div className={styles.groupsList}>
        {groups.map((group) => {
```

to:

```jsx
      <div className={styles.groupsList}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
        {groups.map((group) => {
```

and close it — right after the groups `.map(...)` closing `})}` (currently just before the `<div className={styles.groupRow}>` "Add group" block) add:

```jsx
        })}
        </SortableContext>
        </DndContext>
```

Pass the new `id` prop where `GroupHeader` is rendered:

```jsx
              <GroupHeader
                id={group.id}
                groupName={group.name}
```

- [ ] **Step 4: Add the dragging CSS state**

Add to `pages/random/index.module.css` (near the end, alongside `.rollButtonDisabled`):

```css
.dragging {
  opacity: 0.5;
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing `__tests__/pages/random/index.test.jsx` and `lib/random.test.js` tests still green (no behavior change to anything except the new `id` prop and drag wiring, which existing tests don't drive).

- [ ] **Step 6: Manual QA (browser, both mouse and touch/touch-emulation)**

- Long-press (~200ms) and drag a group header — group list reorders, order persists after reload (localStorage).
- A quick tap on the group name, the expand arrow, or the delete button still works (doesn't get eaten by drag activation).
- Dragging a group stays vertical and doesn't trigger the tab-swipe gesture.

- [ ] **Step 7: Commit**

```bash
git add pages/random/index.jsx pages/random/index.module.css
git commit -m "feat(random): add drag-reorder for choice groups"
```

---

## Task 3: In-group choice drag-reorder

**Files:**
- Modify: `pages/random/index.jsx` (`ChoiceRow` at ~line 179-224; `WeightedChoices`'s `handleDragEnd` and choices-rendering block, both touched in Task 2)

**Interfaces:**
- Consumes: `reorderById` (Task 1), `sensors` and the `DndContext` established in Task 2 (this task extends its `onDragEnd` and adds a nested `SortableContext`, it does not add a second `DndContext`).
- Produces: `ChoiceRow` now requires an `id` prop (the choice's id).

- [ ] **Step 1: Make `ChoiceRow` sortable**

Change the `ChoiceRow` signature and body (currently `pages/random/index.jsx:179-224`):

```js
// eslint-disable-next-line react/prop-types
function ChoiceRow({ id, label, weightValue, totalWeight, onChangeLabel, onChangeWeight, onDelete }) {
  const setWeight = useCallback(
    (valOrFn) => {
      const next = typeof valOrFn === 'function' ? valOrFn(weightValue) : valOrFn;
      onChangeWeight(next);
    },
    [weightValue, onChangeWeight],
  );

  const weight = useSwipeNumber(weightValue, setWeight, 0, 99);
  const percent = totalWeight > 0 ? Math.round((weightValue / totalWeight) * 100) : 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={`${styles.choiceRow} ${isDragging ? styles.dragging : ''}`}
    >
```

(The inputs/percent/delete-button JSX inside is unchanged.)

- [ ] **Step 2: Extend `handleDragEnd` with the choices branch**

Change the `handleDragEnd` added in Task 2 to:

```js
  const handleDragEnd = useCallback(
    ({ active, over }) => {
      if (!over || active.id === over.id) return;

      if (groups.some((g) => g.id === active.id)) {
        setGroups((prev) => reorderById(prev, active.id, over.id));
        return;
      }

      updateGroupChoices(expandedGroupId, (choices) => reorderById(choices, active.id, over.id));
    },
    [groups, expandedGroupId, updateGroupChoices],
  );
```

- [ ] **Step 3: Wrap the expanded group's choices in a nested `SortableContext`**

Change the choices-rendering block inside the `isExpanded &&` branch from:

```jsx
              {isExpanded && (
                <div className={styles.choicesList}>
                  {group.choices.map((choice) => (
                    <ChoiceRow
                      key={choice.id}
                      label={choice.label}
```

to:

```jsx
              {isExpanded && (
                <div className={styles.choicesList}>
                  <SortableContext
                    items={group.choices.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                  {group.choices.map((choice) => (
                    <ChoiceRow
                      key={choice.id}
                      id={choice.id}
                      label={choice.label}
```

and close it — right after the choices `.map(...)` closing `))}` (currently just before the ghost "Add choice..." row) add:

```jsx
                  ))}
                  </SortableContext>
```

(This nested `SortableContext` sits inside the outer groups `SortableContext`/`DndContext` from Task 2 — no second `DndContext` is added.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — same as Task 2's Step 5, plus the new `id` prop on `ChoiceRow` doesn't change any existing assertion.

- [ ] **Step 5: Manual QA (browser, both mouse and touch/touch-emulation)**

- Expand a group with 3+ choices, long-press and drag a choice row — it reorders within that group, persists after reload.
- Quick taps on the label input, weight input (including its existing swipe-to-adjust-weight gesture), and delete button all still work unchanged.
- Dragging a choice stays vertical and doesn't trigger the tab-swipe gesture.
- Confirm a choice cannot be dragged into a different group (no drop target exists there — this should just be structurally true, not something to work around).

- [ ] **Step 6: Commit**

```bash
git add pages/random/index.jsx
git commit -m "feat(random): add drag-reorder for choices within a group"
```

---

## Task 4: Update rule doc + final regression pass

**Files:**
- Modify: `.claude/rules/random.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Document the new convention**

In `.claude/rules/random.md`, after the line `- \`DiceRoll\` does not persist bounds/dice count — that's an existing asymmetry, not an oversight to silently "fix" without checking intent.` (currently line 25), add:

```markdown
- Groups and in-group choices support drag-reorder via `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`. Drag activates on a 200ms long-press (mouse or touch, one `PointerSensor`) — `RowPointerSensor` in `pages/random/index.jsx` excludes interactive descendants (`input`, `button`, `[role="button"]`) so label/weight inputs and buttons keep working under a long-press. Choice drag is scoped to the currently-expanded group only — no cross-group moves.
```

- [ ] **Step 2: Run lint and the full test suite**

Run: `npm run lint && npm test`
Expected: both PASS with no new warnings/errors.

- [ ] **Step 3: Final manual QA pass**

Repeat the Task 2 and Task 3 manual QA checklists once more end-to-end on the built page (`npm run dev`), confirming group reorder, choice reorder, and all pre-existing controls (add/rename/delete group, add/edit/delete choice, PICK, accordion expand/collapse, page-level tab swipe) all still work together.

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/random.md
git commit -m "docs(random): document drag-reorder convention"
```
