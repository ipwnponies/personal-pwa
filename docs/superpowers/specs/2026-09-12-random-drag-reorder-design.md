# Random — Drag Reorder for Weighted Choices — Design Spec

Date: 2026-09-12
Status: Approved for planning

## Summary

`WeightedChoices` (`pages/random/index.jsx`) has no way to reorder groups or
the choices within a group — the only ordering control today is delete +
re-add. This adds drag-reorder for both: groups in the outer list, and
choices within the currently-expanded group.

This is the largest of six planned Random-app extensions. It's classified
**architectural**, not bounded: it requires a new runtime dependency
(`@dnd-kit/*`) and a real interaction/state redesign — long-press drag
activation has to coexist with the row's existing touch-based controls
(`useSwipeNumber` on the weight input) and the page-level horizontal swipe
gesture (`useHorizontalSwipe`, tab switching) without either hijacking the
other.

## New Dependency (requires explicit approval — flagged here, not silently added)

- `@dnd-kit/core` (~v6)
- `@dnd-kit/sortable` (~v8)
- `@dnd-kit/utilities` (~v3)

Rationale: hand-rolled pointer-based reorder was considered and rejected —
long-press activation, drag-vs-scroll disambiguation, and accessible
keyboard reordering are exactly the problems this library solves, and
duplicating that logic by hand for a niche settings-page feature isn't a
good trade for an offline-first PWA that already has zero DnD code to build
on. `@dnd-kit` has no runtime dependencies of its own and is actively
maintained. Exact versions pinned at `npm install` time.

## Architecture

- One `DndContext` wraps `WeightedChoices`'s render, with a single
  `handleDragEnd`. It branches on whether `active.id` is found in
  `groups.map(g => g.id)` (a group reorder) or in
  `expandedGroup.choices.map(c => c.id)` (a choice reorder) — safe because
  `generateId()` produces globally-unique ids, so group ids and choice ids
  never collide.
- Two `SortableContext`s, both `verticalListSortingStrategy`:
  - Outer, over `groups`, always mounted.
  - Inner, over `expandedGroup.choices`, mounted only while a group is
    expanded — this already matches the accordion's existing behavior of
    only rendering the expanded group's choices.
- `useSortable()` is called inside `GroupHeader` and `ChoiceRow`
  themselves (each already receives its own id as a prop). No new
  component files — matches `random.md`'s documented monolithic-file
  convention for this page.

## Drag Trigger / Sensors

- `PointerSensor` with `activationConstraint: { delay: 200, tolerance: 8 }`.
  This alone provides long-press-to-drag for both touch and mouse (a
  mouse click-and-hold also arms it) — no separate `MouseSensor` /
  `TouchSensor` needed.
- `KeyboardSensor` is also registered, using dnd-kit's standard
  `sortableKeyboardCoordinates`. This keeps rows reorderable via keyboard
  once focused, so the feature doesn't regress the existing tab-reachable
  row controls into a pointer-only interaction.

### Dedicated drag handle

`useSortable`'s `listeners`, `attributes` and `setActivatorNodeRef` are
bound to a small dedicated drag-handle element at each row's leading edge,
**not** to the row root. Binding them to the row is not viable:

- `attributes` stamps `role="button"` and `tabIndex={0}` on whatever it is
  spread onto. On a row that contains real inputs and buttons that is both
  invalid ARIA and self-defeating — `Element.closest()` is inclusive of the
  element itself, so the sensor's own `[role="button"]` exclusion would
  match the row the activator is bound to and refuse every drag.
- `listeners` includes the `KeyboardSensor`'s `onKeyDown`. On the row root
  it sees every keydown bubbling out of the row's inputs, and dnd-kit's own
  guard against that (`if (activator && event.target !== activator)`) only
  engages once `setActivatorNodeRef` has registered a handle. Without one,
  Space in a label or group-name input is `preventDefault`ed — the
  character is never inserted and a phantom keyboard drag starts instead.

`touch-action: none` likewise belongs on the handle only; on the row it
blocks ordinary touch scrolling of the list.

### Excluding interactive descendants

A custom `PointerSensor` subclass overrides activation to refuse when the
event target is inside an `input` or `button`
(`event.target.closest('input, button')`). With a dedicated handle this is
defence in depth rather than the primary mechanism, but it is kept:
`ChoiceRow`'s weight `<input>` already owns touch gestures via
`useSwipeNumber` (swipe-to-adjust weight), and a press that ever reached
the sensor from that input must not be captured as a row drag. The
selector deliberately does **not** include `[role="button"]` — the handle
itself carries that role.

### Coexisting with page-level horizontal swipe

`useHorizontalSwipe` (tab switching) listens on the page container and
classifies a touch gesture as horizontal or vertical from its first ~10px
of movement, reading `e.touches[0].clientX/clientY` straight off the native
touch events. The `restrictToVerticalAxis` modifier does **not** help here:
it only rewrites dnd-kit's rendered CSS transform and has no effect on the
raw touch coordinates `useHorizontalSwipe` reads. It is kept purely for the
visual lock.

The actual fix is the same one `lib/useSwipeNumber.js` already uses for the
weight input: the drag handle calls `e.stopPropagation()` on `touchmove`,
so movement that begins on a handle never reaches `useHorizontalSwipe`'s
container listeners. Its `decided`/`isHorizontal` flags stay false and the
bubbling `touchend` no-ops. `useHorizontalSwipe` itself is unchanged.

## Data Flow

- **Groups**: `onDragEnd` → `arrayMove(groups, oldIndex, newIndex)` →
  `setGroups(reordered)`. The existing `useEffect` that persists `groups`
  to `localStorage('random-choices')` is unchanged and fires as-is.
- **Choices**: within-group only — a choice cannot be dragged into a
  different group (rejected as unnecessary scope; the accordion already
  only shows one group's choices at a time, so cross-group drop targets
  would need UI that doesn't otherwise exist). `onDragEnd` →
  `arrayMove(expandedGroup.choices, oldIndex, newIndex)` → reuses the
  existing `updateGroupChoices(expandedGroupId, () => reordered)` helper.
- `expandedGroupId` and `result` (the PICK output) are untouched by
  reorder; reordering does not reset an existing pick result, matching
  current behavior where only *switching* the expanded group resets it.
- Both reorder paths are extracted as small pure helpers,
  `reorderGroups(groups, activeId, overId)` and
  `reorderChoices(choices, activeId, overId)`, each wrapping `arrayMove`
  and returning the array unchanged if `activeId === overId` or either id
  isn't found — keeps `handleDragEnd` itself a thin dispatcher and gives
  the reorder logic something unit-testable without simulating pointer
  events.

## Error Handling

- `onDragEnd`'s `over` can be `null` (dropped outside any droppable) —
  guarded by `if (!over || active.id === over.id) return;` before calling
  either reorder helper.
- No other new failure surface: this is synchronous, local array
  manipulation over data that's already validated (ids always present,
  arrays always well-formed per the existing migration-on-load logic in
  `random.md`).

## Non-Goals

- No cross-group choice moves (see Data Flow).
- No change to `DiceRoll`, `useHorizontalSwipe`'s own logic, or the
  accordion's single-expanded-group behavior.
- No new persisted fields — reordering only changes array order within
  the existing `{ id, name, choices }` / `{ id, label, weight }` shape.
- Visual drag styling (opacity/shadow while dragging) is a small CSS
  addition using `useSortable`'s `transform`/`transition`, not a design
  concern beyond "looks like it's being dragged" — no separate visual
  spec needed.

## Testing

- `reorderGroups` / `reorderChoices`: unit tests alongside `lib/random.js`
  (or co-located, per current test-file placement) covering — reorder
  moves the right element, no-op when `activeId === overId`, no-op when
  either id is missing.
- `__tests__/pages/random/index.test.jsx`: existing render/expand-collapse/
  add/delete coverage must keep passing unchanged, plus regression guards
  for the wiring above — that the draggable `attributes` land on the handle
  and not the row, that a multi-word value can still be typed into the
  choice-label and group-name inputs (Space not `preventDefault`ed), that
  Enter/Space still reach the row's buttons and inputs, and that
  `RowPointerSensor`'s activator accepts a real rendered handle while
  refusing the row's own inputs and buttons. These need no drag physics —
  both critical defects found in review were reachable this way.
- Actual pointer-drag interaction is **not** simulated in jsdom — dnd-kit's
  drag physics depend on real pointer/`getBoundingClientRect` behavior
  that jsdom fakes poorly, and simulating it would be low-value, flaky
  test surface for what's fundamentally a manual-QA interaction. Verified
  manually in-browser (including touch emulation) before merging: long-
  press activates drag on both a group header and a choice row, quick
  taps on label/weight/delete/expand still work unchanged, dragging stays
  vertical without triggering a tab swipe.
