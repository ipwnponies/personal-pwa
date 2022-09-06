import React, { useState } from 'react';

export default function Random() {
  return (
    <div
      style={{
        display: 'grid',
        margin: 'auto',
        height: '100vh',
        aspectRatio: '9/16',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1em',
          gridAutoRows: 'fit-content(10%) repeat(2, 1px) 300px',
          gridTemplateAreas: `
            'h h h h'
            'lowerPrompt lowerInput upperPrompt upperInput'
            'dicePrompt dicePrompt . diceInput'
            'roll roll roll roll'
            'result result result result'
          `,
        }}
      >
        <h1 style={{ gridArea: 'h' }}>RNG</h1>
        <span style={{ gridArea: 'lowerPrompt' }}>Lower</span>
        <input
          id="lowerBound"
          type="number"
          max="100"
          min="1"
          placeholder="1"
          style={{ gridArea: 'lowerInput', maxHeight: '3rem' }}
        />
        <span style={{ gridArea: 'upperPrompt' }}>Upper</span>
        <input
          id="upperBound"
          type="number"
          max="100"
          min="1"
          placeholder="6"
          style={{ gridArea: 'upperInput', maxHeight: '3rem' }}
        />
        <span style={{ gridArea: 'dicePrompt' }}>How many dice?</span>
        <input
          id="numDice"
          type="number"
          max="20"
          min="1"
          placeholder="1"
          style={{ gridArea: 'diceInput', maxHeight: '3rem' }}
        />
        <input
          type="button"
          value="Roll"
          style={{ width: '100%', maxWidth: '20rem', margin: 'auto' }}
          style={{ gridArea: 'roll' }}
        />
        <div style={{ gridArea: 'result' }}>
          Results placeholder, including sum
        </div>
      </div>
    </div>
  );
}
