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
