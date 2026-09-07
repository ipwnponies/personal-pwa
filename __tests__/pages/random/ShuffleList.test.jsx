import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShuffleList from '../../../pages/random/ShuffleList';

describe('ShuffleList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists the typed list to localStorage', () => {
    render(<ShuffleList />);
    const textarea = screen.getByPlaceholderText('One item per line');
    fireEvent.change(textarea, { target: { value: 'Alice\nBob\nCarol' } });
    expect(localStorage.getItem('random-shuffle-list')).toBe('Alice\nBob\nCarol');
  });

  it('restores a persisted list on mount', () => {
    localStorage.setItem('random-shuffle-list', 'Dave\nErin');
    render(<ShuffleList />);
    expect(screen.getByPlaceholderText('One item per line')).toHaveValue('Dave\nErin');
  });

  it('shuffles the non-empty trimmed lines and displays them', () => {
    render(<ShuffleList />);
    const textarea = screen.getByPlaceholderText('One item per line');
    fireEvent.change(textarea, { target: { value: 'Alice\n\n  Bob  \nCarol' } });
    fireEvent.click(screen.getByRole('button', { name: /SHUFFLE/i }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('does not display a result before shuffling', () => {
    render(<ShuffleList />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
