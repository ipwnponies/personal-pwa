import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CoinFlip from '../../../pages/random/CoinFlip';

describe('CoinFlip', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows a placeholder before the first flip', () => {
    render(<CoinFlip />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows Heads when Math.random returns less than 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    expect(screen.getByText('Heads')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('shows Tails when Math.random returns 0.5 or more', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    expect(screen.getByText('Tails')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('flips via a flick gesture on the coin (fast, far touch)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    render(<CoinFlip />);
    const coin = screen.getByTestId('coin');
    fireEvent.touchStart(coin, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(coin, { changedTouches: [{ clientX: 0, clientY: 60 }] });
    expect(screen.getByText('Heads')).toBeInTheDocument();
    Math.random.mockRestore();
  });

  it('does not flip on a short touch that is not a flick', () => {
    render(<CoinFlip />);
    const coin = screen.getByTestId('coin');
    fireEvent.touchStart(coin, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(coin, { changedTouches: [{ clientX: 0, clientY: 5 }] });
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

describe('CoinFlip history', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const seed = (labels) =>
    localStorage.setItem(
      'random-coin-history',
      JSON.stringify(labels.map((label, i) => ({ id: `id${i}`, label, timestamp: i }))),
    );

  it('shows no strip, totals or CLEAR before the first flip', () => {
    render(<CoinFlip />);
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^CLEAR$/ })).not.toBeInTheDocument();
  });

  it('adds a chip for every flip, newest first', () => {
    // Each flip consumes two Math.random() calls in order: flipCoin's own
    // roll, then generateId's inside history.push. So four values are
    // queued, one flip's worth at a time: flip1 (<0.5 => Heads), id1
    // (value irrelevant to the assertion), flip2 (>=0.5 => Tails), id2
    // (value irrelevant). Do not shrink this back to two values — that
    // leaves flip2 falling through to the real Math.random and makes the
    // 'T', 'H' assertion below flaky.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.1);
    render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));
    fireEvent.click(screen.getByRole('button', { name: /FLIP/i }));

    const chips = within(screen.getByRole('list', { name: 'Flip history' })).getAllByRole(
      'listitem',
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(['T', 'H']);
  });

  it('shows totals and the current streak from stored history', () => {
    seed(['T', 'T', 'T', 'H', 'T', 'H']);
    render(<CoinFlip />);
    expect(screen.getByText('H 2 · T 4 · Streak: 3 T')).toBeInTheDocument();
  });

  it('counts a streak that covers the whole history', () => {
    seed(['H', 'H']);
    render(<CoinFlip />);
    expect(screen.getByText('H 2 · T 0 · Streak: 2 H')).toBeInTheDocument();
  });

  it('CLEAR empties the strip and it stays empty after a remount', () => {
    seed(['H', 'T']);
    const { unmount } = render(<CoinFlip />);
    fireEvent.click(screen.getByRole('button', { name: /^CLEAR$/ }));
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
    unmount();

    render(<CoinFlip />);
    expect(screen.queryByRole('list', { name: 'Flip history' })).not.toBeInTheDocument();
  });
});
