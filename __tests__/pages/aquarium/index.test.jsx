import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Aquarium from '../../../pages/aquarium/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Aquarium page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the two-tool palette', () => {
    render(<Aquarium />);
    expect(screen.getByRole('button', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toy/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sponge/i })).not.toBeInTheDocument();
  });

  it('renders starter creatures', () => {
    render(<Aquarium />);
    expect(screen.getAllByTestId('creature').length).toBeGreaterThan(0);
  });

  it('selecting a tool marks it pressed', () => {
    render(<Aquarium />);
    const toy = screen.getByRole('button', { name: /toy/i });
    fireEvent.click(toy);
    expect(toy).toHaveAttribute('aria-pressed', 'true');
  });

  it('mute toggle flips its label', () => {
    render(<Aquarium />);
    const mute = screen.getByRole('button', { name: /sound/i });
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('tapping the tank with food selected drops food', () => {
    render(<Aquarium />);
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });

  it('tapping the tank with toy selected drops a toy', () => {
    render(<Aquarium />);
    fireEvent.click(screen.getByRole('button', { name: /toy/i }));
    const tank = screen.getByRole('presentation');
    fireEvent.click(tank, { clientX: 50, clientY: 50 });
    expect(screen.getAllByTestId('toyDrop').length).toBeGreaterThan(0);
  });

  it('tapping a creature also drops at that point (no per-creature action left)', () => {
    render(<Aquarium />);
    const first = screen.getAllByTestId('creature')[0];
    fireEvent.click(first, { clientX: 20, clientY: 20 });
    expect(screen.getAllByTestId('foodDrop').length).toBeGreaterThan(0);
  });

  it('shows a want bubble on a creature with a low need', () => {
    localStorage.setItem(
      'aquarium-tank',
      JSON.stringify({
        version: 2,
        lastSeen: Date.now(),
        selectedTool: 'food',
        soundOn: true,
        tankCleanliness: 100,
        eggProgress: 0,
        egg: null,
        foodDrops: [],
        toyDrops: [],
        dirtSpots: [],
        creatures: [{
          id: 'c1', species: 'clownfish', bornAt: 0, stage: 'baby',
          hunger: 20, happiness: 100, wellMetSince: null, seekTargetId: null, x: 0.5, y: 0.5,
        }],
      }),
    );
    render(<Aquarium />);
    const creature = screen.getByTestId('creature');
    expect(creature.textContent).toContain('🍤');
  });
});
