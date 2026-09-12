import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareResultButton from '../../../pages/random/ShareResultButton';

afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
});

function stubShare(impl) {
  Object.defineProperty(navigator, 'share', { value: impl, configurable: true });
}

function stubClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('ShareResultButton', () => {
  it('renders a SHARE button by default', () => {
    render(<ShareResultButton text="Heads" />);

    expect(screen.getByRole('button', { name: /SHARE/i })).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<ShareResultButton text="Heads" label="SEND" />);

    expect(screen.getByRole('button', { name: /SEND/i })).toBeInTheDocument();
  });

  it('shares the exact text it was given', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);
    render(<ShareResultButton text="4, 6 (sum: 10)" />);

    await fireEvent.click(screen.getByRole('button', { name: /SHARE/i }));

    expect(share).toHaveBeenCalledWith({ text: '4, 6 (sum: 10)' });
  });

  it('announces a successful share', async () => {
    stubShare(vi.fn().mockResolvedValue(undefined));
    render(<ShareResultButton text="Heads" />);

    await fireEvent.click(screen.getByRole('button', { name: /SHARE/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Shared');
  });

  it('announces a clipboard copy when the share sheet is unavailable', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<ShareResultButton text="Heads" />);

    await fireEvent.click(screen.getByRole('button', { name: /SHARE/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('announces a failure when neither API is available', async () => {
    render(<ShareResultButton text="Heads" />);

    await fireEvent.click(screen.getByRole('button', { name: /SHARE/i }));

    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't copy");
  });

  it('keeps a polite live region present while idle', () => {
    render(<ShareResultButton text="Heads" />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('');
  });
});
