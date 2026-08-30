import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePageBackground, PageThemeScript } from './usePageBackground';

function expectedBackground(color) {
  const probe = document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe('usePageBackground', () => {
  it('sets html and body background-color on mount', () => {
    renderHook(() => usePageBackground('#1a1a2e'));

    const expected = expectedBackground('#1a1a2e');
    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });

  it('restores the previous background-color on unmount', () => {
    document.documentElement.style.backgroundColor = '#123456';
    document.body.style.backgroundColor = '#654321';
    const htmlBefore = document.documentElement.style.backgroundColor;
    const bodyBefore = document.body.style.backgroundColor;

    const { unmount } = renderHook(() => usePageBackground('#1a1a2e'));
    unmount();

    expect(document.documentElement.style.backgroundColor).toBe(htmlBefore);
    expect(document.body.style.backgroundColor).toBe(bodyBefore);
  });

  it('leaves background-color empty on unmount when none was set before', () => {
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';

    const { unmount } = renderHook(() => usePageBackground('#1a1a2e'));
    unmount();

    expect(document.documentElement.style.backgroundColor).toBe('');
    expect(document.body.style.backgroundColor).toBe('');
  });

  it('sets data-theme to light on mount when passed a light background color', () => {
    renderHook(() => usePageBackground('#ffffff'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme to dark on mount when passed a dark background color', () => {
    renderHook(() => usePageBackground('#1a1a2e'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('classifies a 3-digit hex color as light', () => {
    renderHook(() => usePageBackground('#fff'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores the previous data-theme on unmount', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const { unmount } = renderHook(() => usePageBackground('#ffffff'));
    unmount();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes data-theme entirely on unmount when none was set before', () => {
    document.documentElement.removeAttribute('data-theme');

    const { unmount } = renderHook(() => usePageBackground('#ffffff'));
    unmount();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores an SSR-set data-theme as "previous" state and removes it entirely on unmount', () => {
    // Simulate PageThemeScript's inline script having already run before hydration,
    // marking that it (not some genuine prior page state) set data-theme.
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-theme-ssr', '1');

    // Mount with a color that derives to a different theme than the SSR pre-set value.
    const { unmount } = renderHook(() => usePageBackground('#ffffff'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme-ssr')).toBe(false);

    unmount();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-theme-ssr')).toBe(false);
  });

  it('returns the derived theme string', () => {
    const light = renderHook(() => usePageBackground('#ffffff'));
    expect(light.result.current).toBe('light');

    const dark = renderHook(() => usePageBackground('#1a1a2e'));
    expect(dark.result.current).toBe('dark');
  });
});

describe('PageThemeScript', () => {
  it('renders an inline script setting data-theme and the data-theme-ssr marker for a light theme', () => {
    const html = renderToStaticMarkup(<PageThemeScript theme="light" />);

    expect(html).toContain('<script');
    expect(html).toContain("document.documentElement.setAttribute('data-theme','light')");
    expect(html).toContain("document.documentElement.setAttribute('data-theme-ssr','1')");
  });

  it('renders an inline script setting data-theme and the data-theme-ssr marker for a dark theme', () => {
    const html = renderToStaticMarkup(<PageThemeScript theme="dark" />);

    expect(html).toContain('<script');
    expect(html).toContain("document.documentElement.setAttribute('data-theme','dark')");
    expect(html).toContain("document.documentElement.setAttribute('data-theme-ssr','1')");
  });
});
