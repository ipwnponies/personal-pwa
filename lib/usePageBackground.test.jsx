import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageBackground } from './usePageBackground';

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
});
