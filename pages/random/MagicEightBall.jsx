import React, { useState, useCallback } from 'react';
import { useShakeDetection } from '../../lib/useShakeDetection';
import indexStyles from './index.module.css';
import styles from './MagicEightBall.module.css';

export const EIGHT_BALL_ANSWERS = [
  'It is certain',
  'It is decidedly so',
  'Without a doubt',
  'Yes definitely',
  'You may rely on it',
  'As I see it, yes',
  'Most likely',
  'Outlook good',
  'Yes',
  'Signs point to yes',
  'Reply hazy, try again',
  'Ask again later',
  'Better not tell you now',
  'Cannot predict now',
  'Concentrate and ask again',
  "Don't count on it",
  'My reply is no',
  'My sources say no',
  'Outlook not so good',
  'Very doubtful',
];

export default function MagicEightBall() {
  const [answer, setAnswer] = useState(null);

  const handleShake = useCallback(() => {
    const index = Math.floor(Math.random() * EIGHT_BALL_ANSWERS.length);
    setAnswer(EIGHT_BALL_ANSWERS[index]);
  }, []);

  useShakeDetection(handleShake);

  const handleShakeButtonClick = async () => {
    const hasMotionPermission =
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
    if (hasMotionPermission) {
      try {
        await DeviceMotionEvent.requestPermission();
      } catch {
        // Permission denied or unavailable — handleShake below still reveals an answer.
      }
    }
    handleShake();
  };

  return (
    <div className={indexStyles.container}>
      <div className={styles.ball}>
        <div className={styles.window}>{answer || '?'}</div>
      </div>
      <button type="button" className={indexStyles.rollButton} onClick={handleShakeButtonClick}>
        SHAKE
      </button>
    </div>
  );
}
