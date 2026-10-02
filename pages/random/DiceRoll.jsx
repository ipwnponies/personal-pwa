import React, { useState } from 'react';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import ShareResultButton from './ShareResultButton';
import HistoryList from '../../components/random/HistoryList';
import { usePersistentHistory } from '../../lib/usePersistentHistory';
import { useSoundCue } from '../../components/random/SoundContext';
import styles from './index.module.css';

const rollDice = (lowerBound, upperBound) =>
  Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;

const DICE_HISTORY_KEY = 'random-dice-history';
const MAX_DICE_HISTORY = 20;

// Config is baked into the label so later bound changes never rewrite old
// entries: "3d6 (1-6): 2, 4, 5 = 11", or "1d6 (1-6): 4" for a single die.
const formatRollLabel = (values, lowerBound, upperBound) => {
  const config = `${values.length}d${upperBound - lowerBound + 1} (${lowerBound}-${upperBound})`;
  if (values.length === 1) return `${config}: ${values[0]}`;
  const total = values.reduce((sum, value) => sum + value, 0);
  return `${config}: ${values.join(', ')} = ${total}`;
};

export default function DiceRoll() {
  const [lowerBound, setLowerBound] = useState(1);
  const [upperBound, setUpperBound] = useState(6);
  const [numDice, setNumDice] = useState(1);
  // The displayed roll lives in state, set only inside handleRoll — never
  // recomputed from Math.random() in the render body. Recomputing it on
  // every render would re-roll (and change) the displayed dice on any
  // unrelated re-render this component receives, e.g. from the shared
  // SoundContext value changing identity when the mute toggle is clicked.
  const [randomValues, setRandomValues] = useState([]);
  const play = useSoundCue();
  const history = usePersistentHistory(DICE_HISTORY_KEY, MAX_DICE_HISTORY);

  const lower = useSwipeNumber(lowerBound, setLowerBound, 0, 100);
  const upper = useSwipeNumber(upperBound, setUpperBound, 1, 100);
  const dice = useSwipeNumber(numDice, setNumDice, 1, 20);

  const hasRolled = randomValues.length > 0;
  const sum = randomValues.reduce((previousValue, i) => previousValue + i, 0);
  const shareText =
    randomValues.length > 1 ? `${randomValues.join(', ')} (sum: ${sum})` : String(randomValues[0]);

  const handleRoll = () => {
    const values = [...Array(numDice).keys()].map(() => rollDice(lowerBound, upperBound));
    setRandomValues(values);
    history.push({ label: formatRollLabel(values, lowerBound, upperBound) });
    play('roll');
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
          {randomValues.length > 1 && (
            <div className={styles.resultSum}>
              Sum: <strong>{sum}</strong>
            </div>
          )}
          <ShareResultButton text={shareText} />
        </div>
      )}
      <HistoryList title="Recent rolls" entries={history.entries} />
      {history.entries.length > 0 && (
        <button type="button" className={styles.clearButton} onClick={history.clear}>
          CLEAR
        </button>
      )}
    </div>
  );
}
