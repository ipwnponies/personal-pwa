import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Layout, { pwaMetaTags } from '../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Layout background', () => {
  it('sets html and body background to white on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#ffffff';
    const expected = probe.style.backgroundColor;

    render(<Layout>content</Layout>);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
});

describe('pwaMetaTags', () => {
  it('sets theme-color to match the manifest theme_color/background_color (#ffffff)', () => {
    const { container } = render(<>{pwaMetaTags('/base')}</>);
    const themeColor = container.querySelector('meta[name="theme-color"]');
    expect(themeColor.getAttribute('content')).toBe('#ffffff');
  });

  it('allows overriding theme-color for pages with a non-default page background', () => {
    const { container } = render(<>{pwaMetaTags('/base', { themeColor: '#1a1a2e' })}</>);
    const themeColor = container.querySelector('meta[name="theme-color"]');
    expect(themeColor.getAttribute('content')).toBe('#1a1a2e');
  });
});
