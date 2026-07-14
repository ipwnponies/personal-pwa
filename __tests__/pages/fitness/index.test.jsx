import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FitnessCalculator from '../../../pages/fitness/index';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('FitnessCalculator', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('adjusts weight via touch swipe in 5-unit steps', () => {
    render(<FitnessCalculator />);
    const [weightInput] = screen.getAllByRole('spinbutton');
    // deltaY of 60 past the threshold crosses 3 steps at PIXELS_PER_STEP=20, scaled by step=5 -> +15
    fireEvent.touchStart(weightInput, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(weightInput, { touches: [{ clientY: 140 }] });
    fireEvent.touchEnd(weightInput, { changedTouches: [{ clientY: 140 }] });
    expect(weightInput.value).toBe('115');
  });

  it('persists weight and reps to localStorage and restores them on remount', () => {
    const { unmount } = render(<FitnessCalculator />);
    const [weightInput, repsInput] = screen.getAllByRole('spinbutton');

    fireEvent.focus(weightInput);
    fireEvent.change(weightInput, { target: { value: '150' } });
    fireEvent.blur(weightInput);

    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '8' } });
    fireEvent.blur(repsInput);

    unmount();
    render(<FitnessCalculator />);

    const [restoredWeightInput] = screen.getAllByRole('spinbutton');
    expect(restoredWeightInput.value).toBe('150');
    expect(screen.getByText('Based on 8 reps')).toBeInTheDocument();
  });

  it('falls back to defaults when localStorage has no saved inputs', () => {
    render(<FitnessCalculator />);
    expect(screen.getByText('Based on 5 reps')).toBeInTheDocument();
    const [weightInput] = screen.getAllByRole('spinbutton');
    expect(weightInput.value).toBe('100');
  });

  it('highlights the Projected Rep Maxes row matching the current reps input', () => {
    render(<FitnessCalculator />);
    const matchedRow = screen.getByText('5 reps').closest('tr');
    const otherRow = screen.getByText('6 reps').closest('tr');
    expect(matchedRow.className).toMatch(/rowHighlighted/);
    expect(otherRow.className).not.toMatch(/rowHighlighted/);
  });

  it('highlights the 1RM Percentage Guide row matching the current reps input', () => {
    render(<FitnessCalculator />);
    // default reps=5: ratio=1+4/30=1.1333, %1RM=100/1.1333≈88.235 -> rounds to 90%
    const matchedRow = screen.getByText('90%').closest('tr');
    const otherRow = screen.getByText('85%').closest('tr');
    expect(matchedRow.className).toMatch(/rowHighlighted/);
    expect(otherRow.className).not.toMatch(/rowHighlighted/);
  });

  it('moves the highlight when the reps input changes', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '10' } });
    fireEvent.blur(repsInput);
    const newMatchedRow = screen.getByText('10 reps').closest('tr');
    const oldMatchedRow = screen.getByText('5 reps').closest('tr');
    expect(newMatchedRow.className).toMatch(/rowHighlighted/);
    expect(oldMatchedRow.className).not.toMatch(/rowHighlighted/);
  });

  it('moves the percentage-guide highlight when the reps input changes', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    // 10 reps: ratio=1+9/30=1.3, %1RM=100/1.3≈76.923 -> rounds to 75%
    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '10' } });
    fireEvent.blur(repsInput);
    const newMatchedRow = screen.getByText('75%').closest('tr');
    const oldMatchedRow = screen.getByText('90%').closest('tr');
    expect(newMatchedRow.className).toMatch(/rowHighlighted/);
    expect(oldMatchedRow.className).not.toMatch(/rowHighlighted/);
  });

  it('highlights the nearest whole-rep row when the reps input is a decimal', () => {
    render(<FitnessCalculator />);
    const [, repsInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '12.4' } });
    fireEvent.blur(repsInput);
    const matchedRow = screen.getByText('12 reps').closest('tr');
    expect(matchedRow.className).toMatch(/rowHighlighted/);
  });

  it('scrolls the highlighted row into view on mount', () => {
    render(<FitnessCalculator />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('scrolls the percentage-guide highlighted row into view on mount', () => {
    render(<FitnessCalculator />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    // both tables' highlighted rows receive a scrollIntoView call on mount
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('debounces the scroll when reps changes rapidly, scrolling only once after it settles', () => {
    render(<FitnessCalculator />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    Element.prototype.scrollIntoView.mockClear();

    const [, repsInput] = screen.getAllByRole('spinbutton');

    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '7' } });
    fireEvent.blur(repsInput);
    act(() => {
      vi.advanceTimersByTime(80);
    });

    fireEvent.focus(repsInput);
    fireEvent.change(repsInput, { target: { value: '10' } });
    fireEvent.blur(repsInput);
    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    // both tables' highlighted rows receive a scrollIntoView call once settled
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('re-scrolls to the highlighted row after recovering from a weight-only validation error', () => {
    render(<FitnessCalculator />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    Element.prototype.scrollIntoView.mockClear();

    const [weightInput] = screen.getAllByRole('spinbutton');
    fireEvent.focus(weightInput);
    fireEvent.change(weightInput, { target: { value: '0' } });
    fireEvent.blur(weightInput);
    expect(screen.getByText('Enter a working weight greater than 0.')).toBeInTheDocument();

    fireEvent.focus(weightInput);
    fireEvent.change(weightInput, { target: { value: '120' } });
    fireEvent.blur(weightInput);
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('does not highlight any row in the 1RM Percentage Guide table for an unrelated percentage', () => {
    render(<FitnessCalculator />);
    const percentageRow = screen.getByText('100%').closest('tr');
    expect(percentageRow.className).not.toMatch(/rowHighlighted/);
  });
});
