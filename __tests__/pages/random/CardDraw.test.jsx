import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CardDraw from '../../../pages/random/CardDraw';

describe('CardDraw', () => {
  it('starts with a full 52-card deck and no drawn cards', () => {
    render(<CardDraw />);
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('draws the requested number of cards and reduces the deck', () => {
    render(<CardDraw />);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
  });

  it('disables DRAW once the requested count exceeds the remaining deck', () => {
    render(<CardDraw />);
    const input = document.getElementById('drawCount');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52' } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    expect(screen.getByRole('button', { name: /^DRAW$/i })).toBeDisabled();
  });

  it('NEW DECK resets to 52 cards and clears drawn cards', () => {
    render(<CardDraw />);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
    fireEvent.click(screen.getByRole('button', { name: /NEW DECK/i }));
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('flicking the deck face draws exactly one card', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
  });

  it('a short touch on the deck face does not draw', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 5 }] });
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
  });

  it('flicking an empty deck does nothing', () => {
    render(<CardDraw />);
    const deckFace = screen.getByTestId('deckFace');
    const input = document.getElementById('drawCount');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '52' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));

    fireEvent.touchStart(deckFace, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(deckFace, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('0 cards left')).toBeInTheDocument();
  });
});
