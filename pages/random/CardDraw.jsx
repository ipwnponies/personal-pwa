import React, { useState } from 'react';
import { buildDeck, drawCards, shuffle } from '../../lib/random';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import indexStyles from './index.module.css';
import styles from './CardDraw.module.css';

export default function CardDraw() {
  const [deck, setDeck] = useState(() => shuffle(buildDeck()));
  const [drawCount, setDrawCount] = useState(1);
  const [drawn, setDrawn] = useState([]);

  const count = useSwipeNumber(drawCount, setDrawCount, 1, 52);

  const performDraw = (n) => {
    if (deck.length < n) return;
    const result = drawCards(deck, n);
    setDrawn(result.drawn);
    setDeck(result.remaining);
  };

  const handleDraw = () => performDraw(drawCount);
  const handleFlickDraw = () => performDraw(1);

  const flick = useFlickGesture(handleFlickDraw);

  const handleNewDeck = () => {
    setDeck(shuffle(buildDeck()));
    setDrawn([]);
  };

  const canDraw = deck.length >= drawCount;

  return (
    <div className={indexStyles.container}>
      <div
        data-testid="deckFace"
        className={styles.deckFace}
        onTouchStart={flick.onTouchStart}
        onTouchEnd={flick.onTouchEnd}
      >
        🂠
      </div>

      <div className={indexStyles.settingRow}>
        <span className={indexStyles.settingLabel}>How many cards?</span>
        <input
          id="drawCount"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={52}
          className={indexStyles.settingInput}
          value={count.inputValue}
          placeholder={count.placeholder}
          onChange={count.onChange}
          onFocus={count.onFocus}
          onBlur={count.onBlur}
          onKeyDown={count.onKeyDown}
          onTouchStart={count.onTouchStart}
          onTouchMove={count.onTouchMove}
          onTouchEnd={count.onTouchEnd}
        />
      </div>

      <div className={styles.deckRow}>
        <span className={styles.deckCount}>{deck.length} cards left</span>
        <button type="button" className={styles.newDeckButton} onClick={handleNewDeck}>
          NEW DECK
        </button>
      </div>

      <button
        type="button"
        className={`${indexStyles.rollButton} ${!canDraw ? indexStyles.rollButtonDisabled : ''}`}
        onClick={handleDraw}
        disabled={!canDraw}
      >
        DRAW
      </button>

      {drawn.length > 0 && (
        <div className={indexStyles.result}>
          <div className={styles.cardsRow}>
            {drawn.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.card}>
                {card.rank}
                {card.suit}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
