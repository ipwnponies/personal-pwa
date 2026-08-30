import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { TabList, Tabs, Tab, TabPanel } from 'react-tabs';

import 'react-tabs/style/react-tabs.css';
import styles from './index.module.css';
import { weightedRandomChoice, generateId } from '../../lib/random';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { usePageBackground, PageThemeScript } from '../../lib/usePageBackground';
import { pwaMetaTags } from '../../components/layout';

const HORIZONTAL_SWIPE_THRESHOLD = 50;

function useHorizontalSwipe(onSwipeLeft, onSwipeRight) {
  const touchRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      decided: false,
      isHorizontal: false,
    };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchRef.current) return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    const dy = e.touches[0].clientY - touchRef.current.startY;

    if (!touchRef.current.decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      touchRef.current.decided = true;
      touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current) return;
      if (!touchRef.current.isHorizontal) {
        touchRef.current = null;
        return;
      }
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      touchRef.current = null;

      if (Math.abs(dx) < HORIZONTAL_SWIPE_THRESHOLD) return;
      if (dx > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    },
    [onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd };
}

const rollDice = (lowerBound, upperBound) =>
  Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;

function DiceRoll() {
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

function WeightedChoices() {
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

const TAB_COUNT = 2;

export default function Random() {
  const theme = usePageBackground('#1a1a2e');
  const { basePath } = useRouter();
  const [tabIndex, setTabIndex] = useState(0);

  const swipeLeft = useCallback(() => {
    setTabIndex((i) => Math.min(i + 1, TAB_COUNT - 1));
  }, []);
  const swipeRight = useCallback(() => {
    setTabIndex((i) => Math.max(i - 1, 0));
  }, []);

  const pageSwipe = useHorizontalSwipe(swipeLeft, swipeRight);

  return (
    <div
      className={styles.page}
      onTouchStart={pageSwipe.onTouchStart}
      onTouchMove={pageSwipe.onTouchMove}
      onTouchEnd={pageSwipe.onTouchEnd}
    >
      <Head>
        <PageThemeScript theme={theme} />
        {pwaMetaTags(basePath, { themeColor: '#1a1a2e', manifestPath: 'random-manifest.json' })}
        <style>{'html,body{background-color:#1a1a2e}'}</style>
      </Head>
      <Tabs
        className={styles.tabs}
        selectedIndex={tabIndex}
        onSelect={setTabIndex}
      >
        <TabList className={styles.tabList}>
          <Tab
            className={styles.tab}
            selectedClassName={styles.tabSelected}
          >
            Dice
          </Tab>
          <Tab
            className={styles.tab}
            selectedClassName={styles.tabSelected}
          >
            Choices
          </Tab>
        </TabList>
        <TabPanel>
          <DiceRoll />
        </TabPanel>
        <TabPanel>
          <WeightedChoices />
        </TabPanel>
      </Tabs>
    </div>
  );
}
