import React, { useEffect, useState } from 'react';
import { shuffle } from '../../lib/random';
import indexStyles from './index.module.css';
import styles from './ShuffleList.module.css';

const STORAGE_KEY = 'random-shuffle-list';

export default function ShuffleList() {
  const [text, setText] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [shuffled, setShuffled] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  const handleShuffle = () => {
    const items = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setShuffled(shuffle(items));
  };

  return (
    <div className={indexStyles.container}>
      <textarea
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One item per line"
      />
      <button type="button" className={indexStyles.rollButton} onClick={handleShuffle}>
        SHUFFLE
      </button>
      {shuffled && (
        <div className={indexStyles.result}>
          <ol className={styles.resultList}>
            {shuffled.map((item, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={idx}>{item}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
