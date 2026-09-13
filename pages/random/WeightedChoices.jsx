import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { weightedRandomChoice, generateId, pushHistoryEntry, reorderById } from '../../lib/random';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { useSoundCue } from './SoundContext';
import styles from './index.module.css';
import wheelStyles from './WeightedChoices.module.css';

const HISTORY_STORAGE_KEY = 'random-choices-history';
const MAX_HISTORY_ENTRIES = 20;

const DRAG_ACTIVATION_CONSTRAINT = { delay: 200, tolerance: 8 };

// A row is only draggable by a long-press on its dedicated drag handle
// (`.dragHandle`), which is the only element `useSortable`'s listeners are
// bound to. The `closest` check is defence in depth: it refuses activation
// if a press ever reaches this sensor from one of the row's own interactive
// controls, whose gestures (notably the weight input's swipe-to-adjust)
// must not be hijacked by drag activation.
//
// Declared as a post-class assignment rather than a `static` class field:
// this repo's ESLint runs at `ecmaVersion: 12` (ES2021), which predates
// class static properties, and an unparseable file silently loses ALL rule
// coverage. dnd-kit's own dist output assigns `activators` the same way.
class RowPointerSensor extends PointerSensor {}

RowPointerSensor.activators = [
  {
    eventName: 'onPointerDown',
    handler: ({ nativeEvent: event }, { onActivation }) => {
      if (!event.isPrimary || event.button !== 0) return false;
      if (event.target.closest('input, button')) return false;
      onActivation?.({ event });
      return true;
    },
  },
];

export { RowPointerSensor };

// Shared by ChoiceRow and GroupHeader: turns useSortable's raw transform
// into the inline style its draggable root needs.
const sortableDragStyle = (transform, transition) => ({
  transform: CSS.Transform.toString(transform),
  transition,
});

// Keeps a dragged row visually locked to the vertical axis. Same one-line
// transform as @dnd-kit/modifiers' restrictToVerticalAxis — inlined to
// avoid a 4th dnd-kit dependency for a single-line function. Note this is
// purely cosmetic: it rewrites dnd-kit's rendered transform and has no
// effect on the raw touch events useHorizontalSwipe reads (see DragHandle).
const restrictToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });

// The only element a drag can be started from. `useSortable`'s listeners and
// `attributes` live here rather than on the row so that (a) the row root
// isn't stamped `role="button"`/`tabIndex` around its real interactive
// children, and (b) the KeyboardSensor's onKeyDown doesn't sit on an
// ancestor of the row's inputs, where it would preventDefault every Space
// and Enter bubbling out of them.
// eslint-disable-next-line react/prop-types
function DragHandle({ handleRef, label, attributes, listeners }) {
  return (
    <span
      ref={handleRef}
      className={styles.dragHandle}
      aria-label={label}
      /* eslint-disable-next-line react/jsx-props-no-spreading */
      {...attributes}
      /* eslint-disable-next-line react/jsx-props-no-spreading */
      {...listeners}
      // useHorizontalSwipe (page-level tab swipe) classifies gestures from
      // raw touch coordinates on bubbling events, so dnd-kit's modifiers
      // can't keep a vertical row drag from reading as a tab swipe. Stop
      // touchmove here instead — the same fix useSwipeNumber already uses
      // for the weight input. Safe to place after the spreads: both
      // registered sensors activate on pointer/keyboard events, not touch.
      onTouchMove={(e) => e.stopPropagation()}
    >
      ⠿
    </span>
  );
}

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

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={sortableDragStyle(transform, transition)}
      className={`${styles.choiceRow} ${isDragging ? styles.dragging : ''}`}
    >
      <DragHandle
        handleRef={setActivatorNodeRef}
        label="Reorder choice"
        attributes={attributes}
        listeners={listeners}
      />
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
function GroupHeader({ id, groupName, isExpanded, onToggleExpand, onRename, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(groupName);
  const inputRef = useRef(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
    <div
      ref={setNodeRef}
      style={sortableDragStyle(transform, transition)}
      className={`${styles.groupHeader} ${isDragging ? styles.dragging : ''}`}
    >
      <DragHandle
        handleRef={setActivatorNodeRef}
        label="Reorder group"
        attributes={attributes}
        listeners={listeners}
      />
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

export default function WeightedChoices() {
  const play = useSoundCue();
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
  const [wheelRotation, setWheelRotation] = useState(0);
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = useRef(null);

  const [history, setHistory] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('random-choices', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  const showUndoToast = useCallback((message, onUndo) => {
    clearTimeout(undoTimerRef.current);
    setUndoToast({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoToast) return;
    clearTimeout(undoTimerRef.current);
    undoToast.onUndo();
    setUndoToast(null);
  }, [undoToast]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const expandedGroup = groups.find((g) => g.id === expandedGroupId);
  const expandedChoices = expandedGroup?.choices || [];
  const totalWeight = expandedChoices.reduce((sum, c) => sum + c.weight, 0);
  const canPick = expandedChoices.filter((c) => c.label.trim()).length >= 2;
  const expandedHistory = history[expandedGroupId] || [];

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
    (groupId, id) => {
      const group = groups.find((g) => g.id === groupId);
      const index = group.choices.findIndex((c) => c.id === id);
      const deletedChoice = group.choices[index];

      updateGroupChoices(groupId, (choices) => choices.filter((c) => c.id !== id));

      showUndoToast('Choice deleted', () => {
        updateGroupChoices(groupId, (choices) => {
          const next = [...choices];
          next.splice(index, 0, deletedChoice);
          return next;
        });
      });
    },
    [groups, updateGroupChoices, showUndoToast],
  );

  const handleRenameGroup = useCallback((groupId, newName) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g)));
  }, []);

  const handleDeleteGroup = useCallback(
    (groupId) => {
      const index = groups.findIndex((g) => g.id === groupId);
      const deletedGroup = groups[index];
      const deletedGroupHistory = history[groupId];
      const wasExpanded = expandedGroupId === groupId;
      const remaining = groups.filter((g) => g.id !== groupId);
      const newGroup = remaining.length === 0 ? { id: generateId(), name: 'Default', choices: [] } : null;

      setGroups((prev) => {
        const filtered = prev.filter((g) => g.id !== groupId);
        return filtered.length === 0 ? [newGroup] : filtered;
      });

      setHistory((prev) => {
        const { [groupId]: _removed, ...rest } = prev;
        return rest;
      });

      if (newGroup) {
        setExpandedGroupId(newGroup.id);
        setResult(null);
      } else if (wasExpanded) {
        // We deleted the expanded group, so switch to another and clear its result.
        setExpandedGroupId(remaining[0].id);
        setResult(null);
      }

      showUndoToast('Group deleted', () => {
        setGroups((prev) => {
          const withoutReplacement = newGroup ? prev.filter((g) => g.id !== newGroup.id) : prev;
          const next = [...withoutReplacement];
          next.splice(index, 0, deletedGroup);
          return next;
        });
        if (deletedGroupHistory) {
          setHistory((prev) => ({ ...prev, [deletedGroup.id]: deletedGroupHistory }));
        }
        // Only the deleted group's own view was disturbed; leave an unrelated
        // expanded group (and its pick result) alone.
        if (newGroup || wasExpanded) {
          setExpandedGroupId(deletedGroup.id);
          setResult(null);
        }
      });
    },
    [groups, history, expandedGroupId, showUndoToast],
  );

  const handleToggleGroup = (groupId) => {
    setExpandedGroupId(groupId);
    setResult(null);
  };

  const sensors = useSensors(
    useSensor(RowPointerSensor, { activationConstraint: DRAG_ACTIVATION_CONSTRAINT }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const handlePick = () => {
    const valid = expandedChoices.filter((c) => c.label.trim());
    if (valid.length < 2) return;
    const chosen = weightedRandomChoice(valid);
    if (!chosen) return;
    play('pick');
    const validTotal = valid.reduce((sum, c) => sum + c.weight, 0);
    setResult({
      label: chosen.label,
      percent: Math.round((chosen.weight / validTotal) * 100),
    });

    setHistory((prev) => ({
      ...prev,
      [expandedGroupId]: pushHistoryEntry(
        prev[expandedGroupId] || [],
        { id: generateId(), label: chosen.label, timestamp: Date.now() },
        MAX_HISTORY_ENTRIES,
      ),
    }));

    const segments = buildWheelSegments(valid);
    const chosenSegment = segments.find((s) => s.id === chosen.id);
    const center = (chosenSegment.start + chosenSegment.end) / 2;
    setWheelRotation((prev) => prev - (prev % 360) + 5 * 360 - center);
  };

  return (
    <div className={styles.container}>
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
      <div className={styles.groupsList}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            {groups.map((group) => {
              const isExpanded = expandedGroupId === group.id;
              return (
                <div key={group.id} className={styles.groupContainer}>
                  <GroupHeader
                    id={group.id}
                    groupName={group.name}
                    isExpanded={isExpanded}
                    onToggleExpand={() => handleToggleGroup(group.id)}
                    onRename={(newName) => handleRenameGroup(group.id, newName)}
                    onDelete={() => handleDeleteGroup(group.id)}
                  />
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
                            weightValue={choice.weight}
                            totalWeight={totalWeight}
                            onChangeLabel={(l) => handleChangeLabel(group.id, choice.id, l)}
                            onChangeWeight={(w) => handleChangeWeight(group.id, choice.id, w)}
                            onDelete={() => handleDeleteChoice(group.id, choice.id)}
                          />
                        ))}
                      </SortableContext>
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
          </SortableContext>
        </DndContext>

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

      {undoToast && (
        <div className={wheelStyles.undoToast} role="status">
          <span>{undoToast.message}</span>
          <button type="button" className={wheelStyles.undoButton} onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

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
    </div>
  );
}
