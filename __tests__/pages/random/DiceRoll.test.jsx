import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DiceRoll from '../../../pages/random/DiceRoll';

afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
});

function stubShare() {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  return share;
}

function setDiceCount(count) {
  const input = document.getElementById('numDice');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: String(count) } });
  fireEvent.blur(input);
}

async function rollAndShare() {
  fireEvent.click(screen.getByRole('button', { name: /^ROLL$/i }));
  await fireEvent.click(screen.getByRole('button', { name: /SHARE/i }));
}

describe('DiceRoll sharing', () => {
  it('offers no share action before the first roll', () => {
    render(<DiceRoll />);

    expect(screen.queryByRole('button', { name: /SHARE/i })).not.toBeInTheDocument();
  });

  it('shares the single rolled value when one die is rolled', async () => {
    const share = stubShare();
    render(<DiceRoll />);

    await rollAndShare();

    const { text } = share.mock.calls[0][0];
    expect(text).toMatch(/^\d+$/);
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it('shares every rolled value and their sum when several dice are rolled', async () => {
    const share = stubShare();
    const { container } = render(<DiceRoll />);
    setDiceCount(3);

    await rollAndShare();

    const { text } = share.mock.calls[0][0];
    expect(text).toMatch(/^\d+, \d+, \d+ \(sum: \d+\)$/);

    const [values, sum] = text.split(' (sum: ');
    const parts = values.split(', ').map(Number);
    expect(parts.reduce((total, value) => total + value, 0)).toBe(Number(sum.replace(')', '')));
    parts.forEach((value) => {
      expect(screen.getAllByText(String(value)).length).toBeGreaterThan(0);
    });
    expect(container.querySelector('strong')).toHaveTextContent(sum.replace(')', ''));
  });

  it('copies the same payload when the share sheet is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<DiceRoll />);

    await rollAndShare();

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d+$/));
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });
});
