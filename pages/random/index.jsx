import React, { useState } from 'react';

import styles from './index.module.css';

export default function Random() {
  const [lowerBound, setLowerBound] = useState(1);
  const [upperBound, setUpperBound] = useState(6);
  const [numDice, setNumDice] = useState(1);

  return (
    <div className={styles.grid}>
      <h1 className={styles.h}>RNG</h1>
      <span className={styles.lowerPrompt}>Lower</span>
      <input
        id="lowerBound"
        type="number"
        max="100"
        min="1"
        className={styles.lowerInput}
        value={lowerBound}
        onChange={(e) => setLowerBound(parseInt(e.target.value, 10))}
      />
      <span className={styles.upperPrompt}>Upper</span>
      <input
        id="upperBound"
        type="number"
        max="100"
        min="1"
        className={styles.upperInput}
        value={upperBound}
        onChange={(e) => setUpperBound(parseInt(e.target.value, 10))}
      />
      <span className={styles.dicePrompt}>How many dice?</span>
      <input
        id="numDice"
        type="number"
        max="20"
        min="1"
        className={styles.diceInput}
        value={numDice}
        onChange={(e) => setNumDice(parseInt(e.target.value, 10))}
      />
      <input type="button" value="Roll" className={styles.roll} />
      <div className={styles.result}>
        {`Lower bound is ${lowerBound}`}
        <br />
        {`upper bound is ${upperBound}`}
        <br />
        {`number of dice is ${numDice}`}
      </div>
    </div>
  );
}
