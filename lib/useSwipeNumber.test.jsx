import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSwipeNumber } from './useSwipeNumber';

// eslint-disable-next-line react/prop-types
function Harness({ min = 1, max = 30, initial = 5, step = 1 }) {
  const [value, setValue] = useState(initial);
  const field = useSwipeNumber(value, setValue, min, max, step);
  return (
    <input
      aria-label="swipe-input"
      type="number"
      value={field.inputValue}
      placeholder={field.placeholder}
      onChange={field.onChange}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onTouchStart={field.onTouchStart}
      onTouchMove={field.onTouchMove}
      onTouchEnd={field.onTouchEnd}
    />
  );
}

describe('useSwipeNumber', () => {
  it('renders the initial value', () => {
    render(<Harness />);
    expect(screen.getByLabelText('swipe-input').value).toBe('5');
  });

  it('commits a typed value on blur, clamped to the range', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(input.value).toBe('12');
  });

  it('reverts to the pre-focus value when blurred empty', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('5');
  });

  it('reverts to the pre-focus value when blurred with non-numeric input', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(input.value).toBe('5');
  });

  it('ignores small vertical touch moves under the swipe threshold', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.touchStart(input, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 95 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 95 }] });
    expect(input.value).toBe('5');
  });

  it('increases the value on an upward swipe past the threshold', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.touchStart(input, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 150 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 150 }] });
    expect(input.value).toBe('7');
  });

  it('decreases the value on a downward swipe past the threshold', () => {
    render(<Harness min={1} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.touchStart(input, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 150 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 150 }] });
    expect(input.value).toBe('3');
  });

  it('clamps swiped values to max', () => {
    render(<Harness min={1} max={6} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.touchStart(input, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 100 }] });
    expect(input.value).toBe('6');
  });

  it('clamps swiped values to min', () => {
    render(<Harness min={2} max={30} initial={5} />);
    const input = screen.getByLabelText('swipe-input');
    fireEvent.touchStart(input, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 500 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 500 }] });
    expect(input.value).toBe('2');
  });

  it('scales swipe steps by the step parameter', () => {
    render(<Harness min={0} max={1000} initial={100} step={5} />);
    const input = screen.getByLabelText('swipe-input');
    // deltaY of 60 past the threshold crosses 3 steps at PIXELS_PER_STEP=20
    fireEvent.touchStart(input, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(input, { touches: [{ clientY: 140 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientY: 140 }] });
    expect(input.value).toBe('115');
  });
});
