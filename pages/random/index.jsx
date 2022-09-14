import React, { useReducer, useState } from 'react';

import styles from './index.module.css';

const rollDice = (lowerBound, upperBound) =>
  Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;

export default function Random() {
  const [lowerBound, setLowerBound] = useState(1);
  const [upperBound, setUpperBound] = useState(6);
  const [numDice, setNumDice] = useState(1);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const randomValues = [...Array(numDice).keys()].map(() =>
    rollDice(lowerBound, upperBound),
  );
  const sum = randomValues.reduce((previousValue, i) => previousValue + i);

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
      <input
        type="button"
        value="Roll"
        className={styles.roll}
        onClick={forceUpdate}
      />
      <div className={styles.result}>
        {`Random value is ${randomValues}`}
        <br />
        {`Sum is ${sum}`}
      </div>
    </div>
  );
}
