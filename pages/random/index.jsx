import React, { useReducer, useState } from 'react';
import { TabList, Tabs, Tab, TabPanel } from 'react-tabs';

import 'react-tabs/style/react-tabs.css';
import styles from './index.module.css';

const rollDice = (lowerBound, upperBound) =>
  Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;

function DiceRoll() {
  const [lowerBound, setLowerBound] = useState(1);
  const [upperBound, setUpperBound] = useState(6);
  const [numDice, setNumDice] = useState(1);
  const [hasRolled, setHasRolled] = useState(false);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

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
            max="100"
            min="1"
            className={styles.boundInput}
            value={lowerBound}
            onChange={(e) => setLowerBound(parseInt(e.target.value, 10))}
          />
        </div>
        <div className={styles.boundCard}>
          <span className={styles.boundLabel}>Maximum</span>
          <input
            id="upperBound"
            type="number"
            max="100"
            min="1"
            className={styles.boundInput}
            value={upperBound}
            onChange={(e) => setUpperBound(parseInt(e.target.value, 10))}
          />
        </div>
      </div>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>How many dice?</span>
        <input
          id="numDice"
          type="number"
          max="20"
          min="1"
          className={styles.settingInput}
          value={numDice}
          onChange={(e) => setNumDice(parseInt(e.target.value, 10))}
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

export default function Random() {
  return (
    <div className={styles.page}>
      <Tabs className={styles.tabs}>
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
          <p className={styles.placeholder}>Coming soon</p>
        </TabPanel>
      </Tabs>
    </div>
  );
}
