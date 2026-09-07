import React, { useCallback, useEffect, useRef, useState } from 'react';
import { weightedRandomChoice, generateId } from '../../lib/random';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import styles from './index.module.css';
import wheelStyles from './WeightedChoices.module.css';

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
    if (!chosen) return;
    const validTotal = valid.reduce((sum, c) => sum + c.weight, 0);
    setResult({
      label: chosen.label,
      percent: Math.round((chosen.weight / validTotal) * 100),
    });

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
