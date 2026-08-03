import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Random from '../../../pages/random/index';
import { pwaMetaTags } from '../../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '/base' }),
}));

vi.mock('../../../components/layout', () => ({
  pwaMetaTags: vi.fn(() => null),
}));

describe('Random page head', () => {
  it('calls pwaMetaTags with the router basePath and the page theme color', () => {
    render(<Random />);
    expect(pwaMetaTags).toHaveBeenCalledWith('/base', { themeColor: '#1a1a2e' });
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
