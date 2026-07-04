import Head from 'next/head';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { TabList, Tabs, Tab, TabPanel } from 'react-tabs';

import 'react-tabs/style/react-tabs.css';
import styles from './index.module.css';
import { clamp, weightedRandomChoice, generateId } from '../../lib/random';

const SWIPE_THRESHOLD = 10;
const HORIZONTAL_SWIPE_THRESHOLD = 50;

function useSwipeNumber(value, onChange, min, max) {
  const [editValue, setEditValue] = useState(null);
  const [savedValue, setSavedValue] = useState(null);
  const touchRef = useRef(null);
  const accumulatedRef = useRef(0);

  const isEditing = editValue !== null;

  const handleFocus = useCallback(() => {
    setSavedValue(value);
    setEditValue('');
  }, [value]);

  const handleBlur = useCallback(() => {
    if (editValue === '' || editValue === null) {
      onChange(savedValue);
    } else {
      const parsed = parseInt(editValue, 10);
      onChange(Number.isNaN(parsed) ? savedValue : clamp(parsed, min, max));
    }
    setEditValue(null);
    setSavedValue(null);
  }, [editValue, savedValue, onChange, min, max]);

  const handleChange = useCallback((e) => {
    setEditValue(e.target.value);
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = { startY: e.touches[0].clientY, swiping: false };
    accumulatedRef.current = 0;
  }, []);

  const handleTouchMove = useCallback(
    (e) => {
      if (!touchRef.current) return;
      const deltaY = touchRef.current.startY - e.touches[0].clientY;
      if (!touchRef.current.swiping && Math.abs(deltaY) > SWIPE_THRESHOLD) {
        touchRef.current.swiping = true;
        e.target.blur();
      }
      if (touchRef.current.swiping) {
        e.preventDefault();
        e.stopPropagation();
        const pixelsPerStep = 20;
        const steps = Math.trunc(deltaY / pixelsPerStep);
        const delta = steps - accumulatedRef.current;
        if (delta !== 0) {
          accumulatedRef.current = steps;
          onChange((prev) => clamp(prev + delta, min, max));
        }
      }
    },
    [min, max, onChange],
  );

  const handleTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  return {
    inputValue: isEditing ? editValue : value,
    placeholder: isEditing ? String(savedValue) : undefined,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

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

  const lower = useSwipeNumber(lowerBound, setLowerBound, 1, 100);
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
            min={1}
            max={100}
            className={styles.boundInput}
            value={lower.inputValue}
            placeholder={lower.placeholder}
            onChange={lower.onChange}
            onFocus={lower.onFocus}
            onBlur={lower.onBlur}
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

  const weight = useSwipeNumber(weightValue, setWeight, 1, 99);
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
        min={1}
        max={99}
        className={styles.choiceWeightInput}
        value={weight.inputValue}
        placeholder={weight.placeholder}
        onChange={weight.onChange}
        onFocus={weight.onFocus}
        onBlur={weight.onBlur}
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

function WeightedChoices() {
  const [choices, setChoices] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('random-choices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [result, setResult] = useState(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    localStorage.setItem('random-choices', JSON.stringify(choices));
  }, [choices]);

  const totalWeight = choices.reduce((sum, c) => sum + c.weight, 0);
  const canPick = choices.filter((c) => c.label.trim()).length >= 2;

  const [ghostKey, setGhostKey] = useState(0);

  const handleGhostBlur = (e) => {
    const label = e.target.value.trim();
    if (label) {
      setChoices((prev) => [...prev, { id: generateId(), label, weight: 1 }]);
      setGhostKey((k) => k + 1);
    }
  };

  const handleChangeLabel = useCallback((id, label) => {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  }, []);

  const handleChangeWeight = useCallback((id, weight) => {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, weight } : c)));
  }, []);

  const handleDelete = useCallback((id) => {
    setChoices((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handlePick = () => {
    const valid = choices.filter((c) => c.label.trim());
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
      <div className={styles.choicesList}>
        {choices.map((choice) => (
          <ChoiceRow
            key={choice.id}
            label={choice.label}
            weightValue={choice.weight}
            totalWeight={totalWeight}
            onChangeLabel={(l) => handleChangeLabel(choice.id, l)}
            onChangeWeight={(w) => handleChangeWeight(choice.id, w)}
            onDelete={() => handleDelete(choice.id)}
          />
        ))}
        <div className={styles.choiceRow}>
          <input
            key={ghostKey}
            type="text"
            className={`${styles.choiceLabelInput} ${styles.choiceGhost}`}
            defaultValue=""
            onBlur={handleGhostBlur}
            placeholder="Add choice..."
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
