import React, { useState } from 'react';

import styles from './index.module.css';

export default function Random() {
  return (
    <div className={styles.grid}>
      <h1 className={styles.h}>RNG</h1>
      <span className={styles.lowerPrompt}>Lower</span>
      <input
        id="lowerBound"
        type="number"
        max="100"
        min="1"
        placeholder="1"
        className={styles.lowerInput}
      />
      <span className={styles.upperPrompt}>Upper</span>
      <input
        id="upperBound"
        type="number"
        max="100"
        min="1"
        placeholder="6"
        className={styles.upperInput}
      />
      <span className={styles.dicePrompt}>How many dice?</span>
      <input
        id="numDice"
        type="number"
        max="20"
        min="1"
        placeholder="1"
        className={styles.diceInput}
      />
      <input type="button" value="Roll" className={styles.roll} />
      <div className={styles.result}>Results placeholder, including sum</div>
    </div>
  );
}
