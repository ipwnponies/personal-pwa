import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FitnessCalculator from '../../../pages/fitness/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('FitnessCalculator', () => {
  it('renders the default 1RM estimate for the initial weight and reps', () => {
    render(<FitnessCalculator />);
    expect(screen.getByRole('heading', { name: 'Rep-Max Calculator' })).toBeInTheDocument();
    expect(screen.getByText('113 units')).toBeInTheDocument();
    expect(screen.getByText('Based on 5 reps')).toBeInTheDocument();
  });

  it('allows repetitions beyond the projected-maxes table range (no upper cap)', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '50' } });
    fireEvent.blur(repsInput);
    expect(screen.getByText('Based on 50 reps')).toBeInTheDocument();
  });

  it('recalculates the estimated 1RM when weight changes and is blurred', () => {
    render(<FitnessCalculator />);
    const [weightInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(weightInput);
    fireEvent.change(weightInput, { target: { value: '200' } });
    fireEvent.blur(weightInput);
    expect(screen.getByText('227 units')).toBeInTheDocument();
  });

  it('reverts reps to the last valid value when blurred empty', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '' } });
    fireEvent.blur(repsInput);
    expect(screen.getByText('Based on 5 reps')).toBeInTheDocument();
  });

  it('reverts weight to the last valid value when blurred with non-numeric input', () => {
    render(<FitnessCalculator />);
    const [weightInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(weightInput);
    fireEvent.change(weightInput, { target: { value: 'abc' } });
    fireEvent.blur(weightInput);
    expect(screen.getByText('113 units')).toBeInTheDocument();
  });

  it('adjusts reps via touch swipe', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.touchStart(repsInput, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(repsInput, { touches: [{ clientY: 150 }] });
    fireEvent.touchEnd(repsInput, { changedTouches: [{ clientY: 150 }] });
    expect(screen.getByText('Based on 7 reps')).toBeInTheDocument();
  });

  it('does not enable touch swipe on the weight input', () => {
    render(<FitnessCalculator />);
    const [weightInput] = screen.getAllByRole('spinbutton');
    fireEvent.touchStart(weightInput, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(weightInput, { touches: [{ clientY: 150 }] });
    fireEvent.touchEnd(weightInput, { changedTouches: [{ clientY: 150 }] });
    expect(screen.getByText('113 units')).toBeInTheDocument();
  });
});
