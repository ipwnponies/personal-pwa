import React, { useState } from 'react';

export default function Random() {
  return (
    <div style={{ display: 'grid', maxWidth: '50rem', margin: 'auto' }}>
      <h1>RNG</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          Lower
          <input
            id="lowerBound"
            type="number"
            max="100"
            min="1"
            placeholder="1"
          />
        </div>
        <div>
          Upper
          <input
            id="upperBound"
            type="number"
            max="100"
            min="1"
            placeholder="6"
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <p>
          How many dice?
          <input id="numDice" type="number" max="20" min="1" placeholder="1" />
        </p>
      </div>
      <input
        type="button"
        value="Roll"
        style={{ width: '100%', maxWidth: '20rem', margin: 'auto' }}
      />
      <div>Results placeholder, including sum</div>
    </div>
  );
}
