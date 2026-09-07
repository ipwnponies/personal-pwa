# Random — Undo Toast on Delete — Design Spec

Date: 2026-09-07
Status: Approved for planning

## Summary

Add an undo toast to the Weighted Choices tab (`pages/random/index.jsx`,
`WeightedChoices` component) for both delete actions: deleting a single
choice (`handleDeleteChoice`) and deleting a whole group
(`handleDeleteGroup`). Deletion stays optimistic — the item is removed from
state immediately, matching current behavior — but a toast appears offering
"Undo" for a few seconds. If clicked, the prior state is restored exactly.
If not, the toast auto-dismisses and the deletion is final.

This is the first of six planned Random-app extensions being built
sequentially; see prior brainstorming for the full list and ordering
rationale (undo toast first: smallest, most contained).

## Scope

`WeightedChoices` only. `DiceRoll` has no delete action and is out of scope.

## Mechanism

**Full-state snapshot, not per-item reconstruction.** Before either delete
handler mutates state, capture `{ groups, expandedGroupId, result }` as a
single `pendingUndo` object: `{ snapshot, message }`. On Undo, restore all
three pieces of state verbatim from `snapshot`.

Reconstructing only the deleted item would not correctly undo
`handleDeleteGroup`'s last-group-deleted branch, which synthesizes a new
"Default" group and changes `expandedGroupId` as a side effect. Snapshotting
the whole state before the mutation sidesteps this: restoring the snapshot
undoes the delete and any side effect it triggered, uniformly, with no
special-casing. `groups` is small (a handful of groups/choices in normal
use), so copying it is cheap.

**One undo slot.** A new delete replaces any existing `pendingUndo` —
consistent with common toast UX (e.g. Gmail): only the most recent action is
undoable. The prior pending delete simply finalizes (no toast, no further
action needed — the state mutation already happened).

**Timer.** `pendingUndo` clears automatically after `UNDO_TIMEOUT_MS = 5000`
via `setTimeout`, tracked in a ref so it can be cleared when superseded by a
new delete or on unmount. Clearing `pendingUndo` after undo also clears the
pending timer.

**Toast message.**
- Choice delete: `"<label>" deleted`
- Group delete: `"<group name>" deleted`

## State & Handlers

New state in `WeightedChoices`:
```js
const [pendingUndo, setPendingUndo] = useState(null);
// { snapshot: { groups, expandedGroupId, result }, message: string }
const undoTimerRef = useRef(null);
```

`handleDeleteChoice` and `handleDeleteGroup` each snapshot current state
before mutating, then call a shared `scheduleUndo(snapshot, message)` helper
that:
1. Clears any existing `undoTimerRef.current` timeout.
2. Sets `pendingUndo`.
3. Starts a new timeout that clears `pendingUndo` after
   `UNDO_TIMEOUT_MS`.

`handleUndo`:
1. Clears `undoTimerRef.current`.
2. Restores `groups`, `expandedGroupId`, `result` from
   `pendingUndo.snapshot`.
3. Clears `pendingUndo`.

## UI

A small fixed-position toast (bottom of the tab, above the tab bar) renders
when `pendingUndo` is non-null: message text + an "Undo" button. New CSS
classes added to `index.module.css` (`toast`, `toastMessage`,
`toastUndoButton`) following the module's existing naming pattern.

## Non-Goals

- No undo history beyond one level — no undo stack.
- No undo for `DiceRoll` (nothing to delete there).
- No undo for label/weight edits or renames, only delete actions.
- No change to existing `localStorage` persistence timing — the effect that
  writes `groups` to `random-choices` on change is unaffected; an undo just
  triggers another normal state update, which the existing effect persists
  as usual.

## Testing

Extend `__tests__/pages/random/index.test.jsx`:
- Deleting a choice shows a toast with its label; clicking Undo restores the
  choice at its original position.
- Deleting a group (not the last one) shows a toast with its name; Undo
  restores the group and re-selects it as expanded.
- Deleting the last remaining group (triggers the synthetic-Default-group
  branch) shows a toast; Undo restores the original group and its expanded
  state, removing the synthetic Default group.
- A second delete before the first toast's Undo is clicked replaces the
  toast; the first deletion is not undoable afterward.
- Using fake timers: after `UNDO_TIMEOUT_MS` elapses without clicking Undo,
  the toast disappears and the deletion remains final.

## Error Handling

No new failure surface. `scheduleUndo`/`handleUndo` operate on in-memory
React state only; no new I/O. Existing `localStorage` write path is
untouched (see Non-Goals).
