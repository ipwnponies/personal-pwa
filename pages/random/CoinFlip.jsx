import React, { useState } from 'react';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { usePersistentHistory } from '../../lib/usePersistentHistory';
import { useSoundCue } from '../../components/random/SoundContext';
import indexStyles from './index.module.css';
import styles from './CoinFlip.module.css';

const COIN_HISTORY_KEY = 'random-coin-history';
const MAX_COIN_HISTORY = 50;

const flipCoin = () => (Math.random() < 0.5 ? 'Heads' : 'Tails');

// Totals and streak cover only the stored (capped) entries, not all time.
const summarize = (entries) => {
  const heads = entries.filter((entry) => entry.label === 'H').length;
  const tails = entries.length - heads;
  const newest = entries[0].label;
  const breakAt = entries.findIndex((entry) => entry.label !== newest);
  const streak = breakAt === -1 ? entries.length : breakAt;
  return `H ${heads} · T ${tails} · Streak: ${streak} ${newest}`;
};

export default function CoinFlip() {
  const [result, setResult] = useState(null);
  const [flipCount, setFlipCount] = useState(0);
  const history = usePersistentHistory(COIN_HISTORY_KEY, MAX_COIN_HISTORY);
  const play = useSoundCue();

  const handleFlip = () => {
    const side = flipCoin();
    setResult(side);
    setFlipCount((count) => count + 1);
    history.push({ label: side === 'Heads' ? 'H' : 'T' });
    play('flip');
  };

  const flick = useFlickGesture(handleFlip);

  return (
    <div className={indexStyles.container}>
      <div
        key={flipCount}
        data-testid="coin"
        className={styles.coin}
        onTouchStart={flick.onTouchStart}
        onTouchEnd={flick.onTouchEnd}
      >
        {result || '?'}
      </div>
      <button type="button" className={indexStyles.rollButton} onClick={handleFlip}>
        FLIP
      </button>

      {history.entries.length > 0 && (
        <>
          <ol className={styles.chipStrip} aria-label="Flip history">
            {history.entries.map((entry) => (
              <li
                key={entry.id}
                className={`${styles.chip} ${entry.label === 'T' ? styles.chipTails : ''}`}
              >
                {entry.label}
              </li>
            ))}
          </ol>
          <p className={styles.stats}>{summarize(history.entries)}</p>
          <button type="button" className={indexStyles.clearButton} onClick={history.clear}>
            CLEAR
          </button>
        </>
      )}
    </div>
  );
}
