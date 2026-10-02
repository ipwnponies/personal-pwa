import React, { useState } from 'react';
import { buildDeck, drawCards, shuffle } from '../../lib/random';
import { useFlickGesture } from '../../lib/useFlickGesture';
import { usePersistentState } from '../../lib/usePersistentState';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { useSoundCue } from '../../components/random/SoundContext';
import indexStyles from './index.module.css';
import styles from './CardDraw.module.css';

const CARDS_STORAGE_KEY = 'random-cards';
const DECK_SIZE = 52;

// Lazy fallback: shuffles on first render. Safe because this tab is never
// rendered during prerender or hydration (react-tabs renders only tab 0).
const freshCards = () => ({ remaining: shuffle(buildDeck()), draws: [] });

const isCard = (card) =>
  card !== null &&
  typeof card === 'object' &&
  typeof card.suit === 'string' &&
  typeof card.rank === 'string';

// Remaining deck and drawn pile live under one key so they can never
// disagree; together they must be exactly one full deck.
const isCardState = (value) => {
  if (value === null || typeof value !== 'object') return false;
  if (!Array.isArray(value.remaining) || !Array.isArray(value.draws)) return false;
  if (!value.draws.every(Array.isArray)) return false;
  const all = [...value.remaining, ...value.draws.flat()];
  return (
    all.length === DECK_SIZE &&
    all.every(isCard) &&
    new Set(all.map((card) => `${card.rank}${card.suit}`)).size === DECK_SIZE
  );
};

export default function CardDraw() {
  const [cards, setCards] = usePersistentState(CARDS_STORAGE_KEY, freshCards, isCardState);
  const [drawCount, setDrawCount] = useState(1);
  const play = useSoundCue();

  const { remaining, draws } = cards;
  const lastDraw = draws.length > 0 ? draws[0] : [];
  const pile = draws.flat();

  const count = useSwipeNumber(drawCount, setDrawCount, 1, 52);

  const performDraw = (n) => {
    if (remaining.length < n) return;
    const result = drawCards(remaining, n);
    setCards({ remaining: result.remaining, draws: [result.drawn, ...draws] });
    play('draw');
  };

  const handleDraw = () => performDraw(drawCount);
  const handleFlickDraw = () => performDraw(1);

  const flick = useFlickGesture(handleFlickDraw);

  const handleNewDeck = () => {
    setCards(freshCards());
  };

  const canDraw = remaining.length >= drawCount;

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
        <span className={styles.deckCount}>{remaining.length} cards left</span>
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

      {lastDraw.length > 0 && (
        <div className={indexStyles.result}>
          <div className={styles.cardsRow}>
            {lastDraw.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.card}>
                {card.rank}
                {card.suit}
              </span>
            ))}
          </div>
        </div>
      )}

      {pile.length > 0 && (
        <div className={styles.pile}>
          <span className={styles.pileTitle}>Drawn ({pile.length})</span>
          <div className={styles.pileCards}>
            {pile.map((card) => (
              <span key={`${card.rank}${card.suit}`} className={styles.pileCard}>
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
