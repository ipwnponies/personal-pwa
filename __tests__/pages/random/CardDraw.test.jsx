import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildDeck } from '../../../lib/random';
import CardDraw from '../../../pages/random/CardDraw';

describe('CardDraw', () => {
  afterEach(() => {
    localStorage.clear();
  });

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

describe('CardDraw persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  const KEY = 'random-cards';
  const draw = () => fireEvent.click(screen.getByRole('button', { name: /^DRAW$/i }));
  const stored = () => JSON.parse(localStorage.getItem(KEY));

  it('adds drawn cards to a Drawn pile', () => {
    render(<CardDraw />);
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
    draw();
    draw();
    expect(screen.getByText('Drawn (2)')).toBeInTheDocument();
  });

  it('restores the deck, the last draw and the pile from storage', () => {
    const deck = buildDeck(); // A♠, 2♠, ...
    localStorage.setItem(
      KEY,
      JSON.stringify({ remaining: deck.slice(2), draws: [[deck[1]], [deck[0]]] }),
    );
    render(<CardDraw />);

    expect(screen.getByText('50 cards left')).toBeInTheDocument();
    expect(screen.getByText('Drawn (2)')).toBeInTheDocument();
    // 2♠ is the last draw: shown in the result block and in the pile.
    expect(screen.getAllByText('2♠')).toHaveLength(2);
    // A♠ was an earlier draw: pile only.
    expect(screen.getAllByText('A♠')).toHaveLength(1);
  });

  it('keeps the deck across a remount', () => {
    const { unmount } = render(<CardDraw />);
    draw();
    unmount();

    render(<CardDraw />);
    expect(screen.getByText('51 cards left')).toBeInTheDocument();
    expect(screen.getByText('Drawn (1)')).toBeInTheDocument();
  });

  it('NEW DECK clears the pile and the reset survives a remount', () => {
    const { unmount } = render(<CardDraw />);
    draw();
    fireEvent.click(screen.getByRole('button', { name: /NEW DECK/i }));
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
    unmount();

    render(<CardDraw />);
    expect(screen.getByText('52 cards left')).toBeInTheDocument();
    expect(screen.queryByText(/^Drawn \(/)).not.toBeInTheDocument();
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['a 51-card state', JSON.stringify({ remaining: buildDeck().slice(1), draws: [] })],
    ['52 empty objects', JSON.stringify({ remaining: Array(52).fill({}), draws: [] })],
    [
      'duplicate cards',
      JSON.stringify({ remaining: Array(52).fill({ suit: '♠', rank: 'A' }), draws: [] }),
    ],
    ['draws that are not arrays', JSON.stringify({ remaining: buildDeck(), draws: [1] })],
  ])('falls back to a fresh full deck for %s and heals storage', (_name, value) => {
    localStorage.setItem(KEY, value);
    render(<CardDraw />);

    expect(screen.getByText('52 cards left')).toBeInTheDocument();
    expect(stored().remaining).toHaveLength(52);
    expect(stored().draws).toEqual([]);
  });
});
