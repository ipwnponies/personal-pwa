import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoinFlip from '../../../pages/random/CoinFlip';

describe('CoinFlip', () => {
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
