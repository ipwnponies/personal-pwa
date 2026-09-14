import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Random from '../../../pages/random/index';
import { pwaMetaTags } from '../../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '/base' }),
}));

vi.mock('../../../components/layout', () => ({
  pwaMetaTags: vi.fn(() => null),
}));

// jsdom doesn't implement scrollIntoView; every render of <Random /> now
// triggers it (the tab carousel scrolls the selected tab into view on
// mount), so this needs to be stubbed for the whole file, not just the
// carousel-specific test below. Same approach as
// __tests__/pages/fitness/index.test.jsx.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Random page head', () => {
  it('calls pwaMetaTags with the router basePath and the page theme color', () => {
    render(<Random />);
    expect(pwaMetaTags).toHaveBeenCalledWith('/base', {
      themeColor: '#1a1a2e',
      manifestPath: 'random-manifest.json',
    });
  });
});

describe('Random page background', () => {
  it('sets html and body background to the page theme color on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#1a1a2e';
    const expected = probe.style.backgroundColor;

    render(<Random />);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
});

describe('Random page tabs', () => {
  it('renders a Coin tab', () => {
    render(<Random />);
    expect(screen.getByText('Coin')).toBeInTheDocument();
  });

  it('renders an 8-Ball tab', () => {
    render(<Random />);
    expect(screen.getByText('8-Ball')).toBeInTheDocument();
  });

  it('renders a Shuffle tab', () => {
    render(<Random />);
    expect(screen.getByText('Shuffle')).toBeInTheDocument();
  });

  it('renders a Cards tab', () => {
    render(<Random />);
    expect(screen.getByText('Cards')).toBeInTheDocument();
  });
});

describe('Random page tab carousel', () => {
  it('scrolls the newly selected tab into view within the strip', () => {
    render(<Random />);
    Element.prototype.scrollIntoView.mockClear(); // drop the initial-render call for Dice

    fireEvent.click(screen.getByText('Cards'));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  });
});
