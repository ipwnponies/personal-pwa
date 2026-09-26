import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Well, { WELL_CHARGE_VISIBLE_MS } from './Well';
import styles from './doodle.module.css';

// Rendered inside an <svg> because the component returns a bare <circle>,
// exactly as Particles does.
const renderWell = (props) => render(
  <svg>
    {/* eslint-disable-next-line react/jsx-props-no-spreading */}
    <Well well={null} progress={0} radius={200} holdMs={800} {...props} />
  </svg>,
);

describe('Well', () => {
  it('renders nothing when there is no well', () => {
    const { container } = renderWell({ well: null });
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('renders nothing before the charge becomes visible', () => {
    // 0.1 * 800ms = 80ms held, under the 150ms threshold, so an ordinary
    // tap-to-spawn never flashes a ring.
    const { container } = renderWell({
      well: { x: 10, y: 20, engaged: false }, progress: 0.1,
    });
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });

  it('renders a charging ring once past the threshold, not a pulsing one', () => {
    const { container } = renderWell({
      well: { x: 10, y: 20, engaged: false }, progress: 0.5,
    });
    const charging = container.querySelector('[data-testid="well-charging"]');
    expect(charging).not.toBeNull();
    expect(charging.getAttribute('cx')).toBe('10');
    expect(charging.getAttribute('cy')).toBe('20');
    expect(container.querySelector('[data-testid="well-engaged"]')).toBeNull();
    expect(charging.getAttribute('class') || '').not.toContain(styles.wellRing);
  });

  it('fills the charging ring in proportion to progress', () => {
    const quarter = renderWell({
      well: { x: 0, y: 0, engaged: false }, progress: 0.25,
    });
    const most = renderWell({
      well: { x: 0, y: 0, engaged: false }, progress: 0.9,
    });
    const filled = (result) => Number(
      result.container
        .querySelector('[data-testid="well-charging"]')
        .getAttribute('stroke-dasharray')
        .split(' ')[0],
    );
    expect(filled(most)).toBeGreaterThan(filled(quarter));
  });

  it('renders a pulsing ring at the well radius once engaged', () => {
    const { container } = renderWell({
      well: { x: 300, y: 400, engaged: true }, progress: 1, radius: 250,
    });
    const engaged = container.querySelector('[data-testid="well-engaged"]');
    expect(engaged).not.toBeNull();
    expect(engaged.getAttribute('r')).toBe('250');
    expect(engaged.getAttribute('class')).toContain(styles.wellRing);
    expect(container.querySelector('[data-testid="well-charging"]')).toBeNull();
  });

  it('renders an engaged well even at zero progress', () => {
    // The charge-visible threshold gates the charging ring only. A well that
    // is already open must never blink out because of it.
    const { container } = renderWell({
      well: { x: 0, y: 0, engaged: true }, progress: 0,
    });
    expect(container.querySelector('[data-testid="well-engaged"]')).not.toBeNull();
  });

  it('exposes the charge-visible threshold', () => {
    expect(WELL_CHARGE_VISIBLE_MS).toBe(150);
  });
});
