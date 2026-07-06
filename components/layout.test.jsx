import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { pwaMetaTags } from './layout';

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
