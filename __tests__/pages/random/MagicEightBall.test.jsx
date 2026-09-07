import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MagicEightBall, { EIGHT_BALL_ANSWERS } from '../../../pages/random/MagicEightBall';
import { SHAKE_THRESHOLD } from '../../../lib/useShakeDetection';

function dispatchMotion(z) {
  const event = new Event('devicemotion');
  Object.defineProperty(event, 'accelerationIncludingGravity', {
    value: { x: 0, y: 0, z },
    writable: true,
    enumerable: true,
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('MagicEightBall', () => {
  it('shows a placeholder before shaking', () => {
    render(<MagicEightBall />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('has exactly 20 answers', () => {
    expect(EIGHT_BALL_ANSWERS).toHaveLength(20);
  });

  it('reveals an answer from the fixed pool when the SHAKE button is tapped', () => {
    render(<MagicEightBall />);
    fireEvent.click(screen.getByRole('button', { name: /SHAKE/i }));
    const revealed = EIGHT_BALL_ANSWERS.find((answer) => screen.queryByText(answer));
    expect(revealed).toBeDefined();
  });

  it('reveals an answer when a devicemotion shake event fires', () => {
    render(<MagicEightBall />);
    dispatchMotion(0);
    dispatchMotion(SHAKE_THRESHOLD + 5);
    const revealed = EIGHT_BALL_ANSWERS.find((answer) => screen.queryByText(answer));
    expect(revealed).toBeDefined();
  });
});
