import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Aquarium from '../../../pages/aquarium/index';

// next/router is used via pwaMetaTags(basePath); provide a minimal mock.
vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Aquarium page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the three-tool palette', () => {
    render(<Aquarium />);
    expect(screen.getByRole('button', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sponge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toy/i })).toBeInTheDocument();
  });

  it('renders starter creatures', () => {
    render(<Aquarium />);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });

  it('selecting a tool marks it pressed', () => {
    render(<Aquarium />);
    const sponge = screen.getByRole('button', { name: /sponge/i });
    fireEvent.click(sponge);
    expect(sponge).toHaveAttribute('aria-pressed', 'true');
  });

  it('mute toggle flips its label', () => {
    render(<Aquarium />);
    const mute = screen.getByRole('button', { name: /sound/i });
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('tapping a creature with the food tool does not crash and keeps it rendered', () => {
    render(<Aquarium />);
    fireEvent.click(screen.getByRole('button', { name: /food/i }));
    const first = screen.getAllByTestId('creature')[0];
    fireEvent.click(first);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });
});
