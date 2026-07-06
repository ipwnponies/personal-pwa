import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FitnessCalculator from '../../../pages/fitness/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('FitnessCalculator', () => {
  it('renders the default 1RM estimate for the initial weight and reps', () => {
    render(<FitnessCalculator />);
    expect(screen.getByRole('heading', { name: 'Rep-Max Calculator' })).toBeInTheDocument();
    expect(screen.getByText('113 units')).toBeInTheDocument();
    expect(screen.getByText('Based on 5 reps')).toBeInTheDocument();
  });

  it('shows a validation error when repetitions are out of range', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(repsInput, { target: { value: '50' } });
    expect(screen.getByText('Enter repetitions between 1 and 30.')).toBeInTheDocument();
  });

  it('recalculates the estimated 1RM when weight changes', () => {
    render(<FitnessCalculator />);
    const [weightInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(weightInput, { target: { value: '200' } });
    expect(screen.getByText('227 units')).toBeInTheDocument();
  });
});
