import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import Layout, { pwaMetaTags } from './layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('pwaMetaTags apple-touch-startup-image', () => {
  it('links the default root splash image with the iPad 6th-gen media query', () => {
    const html = renderToStaticMarkup(<>{pwaMetaTags('/base')}</>);
    expect(html).toContain(
      '<link rel="apple-touch-startup-image" href="/base/icons/splash-root-1536x2048.png" '
        + 'media="(device-width: 768px) and (device-height: 1024px) and '
        + '(-webkit-device-pixel-ratio: 2) and (orientation: portrait)"/>',
    );
  });

  it('links a fitness-specific splash image when splashFileName is overridden', () => {
    const html = renderToStaticMarkup(
      <>{pwaMetaTags('/base', { splashFileName: 'splash-fitness-1536x2048.png' })}</>,
    );
    expect(html).toContain('href="/base/icons/splash-fitness-1536x2048.png"');
  });
});

describe('pwaMetaTags theme-color', () => {
  it('defaults to matching the manifest theme_color/background_color (#ffffff)', () => {
    const html = renderToStaticMarkup(<>{pwaMetaTags('/base')}</>);
    expect(html).toContain('<meta name="theme-color" content="#ffffff"/>');
  });

  it('allows overriding theme-color for pages with a non-default page background', () => {
    const html = renderToStaticMarkup(<>{pwaMetaTags('/base', { themeColor: '#1a1a2e' })}</>);
    expect(html).toContain('<meta name="theme-color" content="#1a1a2e"/>');
  });
});

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
