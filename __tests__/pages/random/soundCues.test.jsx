import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundProvider } from '../../../pages/random/SoundContext';
import DiceRoll from '../../../pages/random/DiceRoll';
import WeightedChoices from '../../../pages/random/WeightedChoices';
import CoinFlip from '../../../pages/random/CoinFlip';
import MagicEightBall from '../../../pages/random/MagicEightBall';
import ShuffleList from '../../../pages/random/ShuffleList';
import CardDraw from '../../../pages/random/CardDraw';

// Overrides only useSoundCue; SoundProvider/SoundToggle stay real so each
// tab is exercised inside a genuine provider tree.
const mockPlay = vi.hoisted(() => vi.fn());

vi.mock('../../../pages/random/SoundContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useSoundCue: () => mockPlay,
  };
});

const renderWithProvider = (ui) => render(<SoundProvider>{ui}</SoundProvider>);

describe('Random tab sound cues', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPlay.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('DiceRoll: ROLL fires the roll cue', () => {
    renderWithProvider(<DiceRoll />);
    fireEvent.click(screen.getByRole('button', { name: /ROLL/i }));
    expect(mockPlay).toHaveBeenCalledWith('roll');
  });

  it('WeightedChoices: PICK fires the pick cue', () => {
    localStorage.setItem(
      'random-choices',
      JSON.stringify([
        {
          id: 'g1',
          name: 'Test Group',
          choices: [
            { id: 'c1', label: 'First', weight: 1 },
            { id: 'c2', label: 'Second', weight: 1 },
          ],
        },
      ]),
    );
    renderWithProvider(<WeightedChoices />);
    fireEvent.click(screen.getByRole('button', { name: /PICK/i }));
    expect(mockPlay).toHaveBeenCalledWith('pick');
  });

  it('CoinFlip: FLIP fires the flip cue', () => {
    renderWithProvider(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    expect(mockPlay).toHaveBeenCalledWith('flip');
  });

  it('MagicEightBall: SHAKE fires the shake cue', () => {
    renderWithProvider(<MagicEightBall />);
    fireEvent.click(screen.getByRole('button', { name: /SHAKE/i }));
    expect(mockPlay).toHaveBeenCalledWith('shake');
  });

  it('ShuffleList: SHUFFLE fires the shuffle cue', () => {
    renderWithProvider(<ShuffleList />);
    const textarea = screen.getByPlaceholderText('One item per line');
    fireEvent.change(textarea, { target: { value: 'Alice\nBob' } });
    fireEvent.click(screen.getByRole('button', { name: /SHUFFLE/i }));
    expect(mockPlay).toHaveBeenCalledWith('shuffle');
  });

  it('CardDraw: DRAW fires the draw cue', () => {
    renderWithProvider(<CardDraw />);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(mockPlay).toHaveBeenCalledWith('draw');
  });
});

describe('Random tab sound cues — refused actions stay silent', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPlay.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('WeightedChoices: PICK with fewer than two valid choices fires no cue', () => {
    localStorage.setItem(
      'random-choices',
      JSON.stringify([
        {
          id: 'g1',
          name: 'Test Group',
          choices: [{ id: 'c1', label: 'Only Choice', weight: 1 }],
        },
      ]),
    );
    renderWithProvider(<WeightedChoices />);
    const pickButton = screen.getByRole('button', { name: /PICK/i });
    expect(pickButton).toBeDisabled();
    fireEvent.click(pickButton);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('CardDraw: performDraw on an empty deck fires no cue', () => {
    renderWithProvider(<CardDraw />);
    const input = document.getElementById('drawCount');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(mockPlay).toHaveBeenCalledWith('draw');
    mockPlay.mockClear();

    // Deck is now empty; the button is disabled, but the flick gesture on
    // the deck face isn't gated by that attribute, so it still reaches
    // performDraw's own `deck.length < n` guard.
    const deckFace = screen.getByTestId('deckFace');
    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
