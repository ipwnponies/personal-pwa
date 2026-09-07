import React, { useState } from 'react';
import { useFlickGesture } from '../../lib/useFlickGesture';
import indexStyles from './index.module.css';
import styles from './CoinFlip.module.css';

const flipCoin = () => (Math.random() < 0.5 ? 'Heads' : 'Tails');

export default function CoinFlip() {
  const [result, setResult] = useState(null);
  const [flipCount, setFlipCount] = useState(0);

  const handleFlip = () => {
    setResult(flipCoin());
    setFlipCount((count) => count + 1);
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
    </div>
  );
}
