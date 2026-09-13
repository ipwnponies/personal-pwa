import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundProvider, SoundToggle } from '../../../pages/random/SoundContext';
import DiceRoll from '../../../pages/random/DiceRoll';

describe('DiceRoll', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // Regression test: the displayed roll must come from state set inside
  // handleRoll, never recomputed from Math.random() in the render body —
  // otherwise any unrelated re-render (e.g. the shared SoundContext value
  // changing identity when sound is muted) silently re-rolls the dice,
  // contradicting the spec's "no change to any tab's randomness, state, or
  // persistence" non-goal.
  it('toggling sound does not change the already-rolled dice value', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    render(
      <SoundProvider>
        <SoundToggle />
        <DiceRoll />
      </SoundProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /ROLL/i }));
    expect(screen.getByText('1')).toBeInTheDocument();

    // If the die value were recomputed on every render instead of read from
    // state, this would flip the displayed value to 6.
    randomSpy.mockReturnValue(0.99);
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }));

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('6')).not.toBeInTheDocument();
  });

  // Regression test: the Sum line's visibility must track how many dice were
  // actually rolled (randomValues.length), not the live numDice setting —
  // otherwise lowering numDice after rolling hides the sum while the
  // still-displayed badges from the larger prior roll contradict it.
  it('keeps the sum line visible for a prior roll after numDice is lowered', () => {
    const { container } = render(
      <SoundProvider>
        <DiceRoll />
      </SoundProvider>,
    );
    const countBadges = () => container.querySelectorAll('[class*="resultBadge"]').length;

    const numDiceInput = document.getElementById('numDice');
    fireEvent.focus(numDiceInput);
    fireEvent.change(numDiceInput, { target: { value: '3' } });
    fireEvent.blur(numDiceInput);
    fireEvent.click(screen.getByRole('button', { name: /ROLL/i }));
    expect(countBadges()).toBe(3);
    expect(screen.getByText(/Sum:/)).toBeInTheDocument();

    fireEvent.focus(numDiceInput);
    fireEvent.change(numDiceInput, { target: { value: '1' } });
    fireEvent.blur(numDiceInput);

    expect(countBadges()).toBe(3);
    expect(screen.getByText(/Sum:/)).toBeInTheDocument();
  });
});
