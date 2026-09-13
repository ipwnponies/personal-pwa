import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundProvider, SoundToggle } from '../../../pages/random/SoundContext';
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

describe('DiceRoll', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // Regression test: the displayed roll must come from state set inside
  // handleRoll, never recomputed from Math.random() in the render body —
  // otherwise any unrelated re-render (e.g. the shared SoundContext value
  // changing identity when sound is muted) silently re-rolls the dice,
  // contradicting the spec's "no change to any tab's randomness, state, or
  // persistence" non-goal.
  it('toggling sound does not change the already-rolled dice value', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    render(
      <SoundProvider>
        <SoundToggle />
        <DiceRoll />
      </SoundProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /ROLL/i }));
    expect(screen.getByText('1')).toBeInTheDocument();

    // If the die value were recomputed on every render instead of read from
    // state, this would flip the displayed value to 6.
    randomSpy.mockReturnValue(0.99);
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }));

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('6')).not.toBeInTheDocument();
  });

  // Regression test: the Sum line's visibility must track how many dice were
  // actually rolled (randomValues.length), not the live numDice setting —
  // otherwise lowering numDice after rolling hides the sum while the
  // still-displayed badges from the larger prior roll contradict it.
  it('keeps the sum line visible for a prior roll after numDice is lowered', () => {
    const { container } = render(
      <SoundProvider>
        <DiceRoll />
      </SoundProvider>,
    );
    const countBadges = () => container.querySelectorAll('[class*="resultBadge"]').length;

    const numDiceInput = document.getElementById('numDice');
    fireEvent.focus(numDiceInput);
    fireEvent.change(numDiceInput, { target: { value: '3' } });
    fireEvent.blur(numDiceInput);
    fireEvent.click(screen.getByRole('button', { name: /ROLL/i }));
    expect(countBadges()).toBe(3);
    expect(screen.getByText(/Sum:/)).toBeInTheDocument();

    fireEvent.focus(numDiceInput);
    fireEvent.change(numDiceInput, { target: { value: '1' } });
    fireEvent.blur(numDiceInput);

    expect(countBadges()).toBe(3);
    expect(screen.getByText(/Sum:/)).toBeInTheDocument();
  });
});
