import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

const KEY = 'test-persistent-state';
const isString = (value) => typeof value === 'string';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentState', () => {
  it('renders the fallback first, then the stored value', () => {
    localStorage.setItem(KEY, JSON.stringify('saved'));
    const seen = [];
    const { result } = renderHook(() => {
      const state = usePersistentState(KEY, 'fallback', isString);
      seen.push(state[0]);
      return state;
    });

    expect(seen[0]).toBe('fallback');
    expect(result.current[0]).toBe('saved');
  });

  it('keeps the fallback when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('accepts a lazy fallback function', () => {
    const { result } = renderHook(() => usePersistentState(KEY, () => 'lazy', isString));
    expect(result.current[0]).toBe('lazy');
  });

  it('keeps the fallback when stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('keeps the fallback when the validator rejects the stored value', () => {
    localStorage.setItem(KEY, JSON.stringify(42));
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');
  });

  it('never writes the fallback over saved data during mount', () => {
    localStorage.setItem(KEY, JSON.stringify('saved'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    renderHook(() => usePersistentState(KEY, 'fallback', isString));

    expect(setItem).not.toHaveBeenCalledWith(KEY, JSON.stringify('fallback'));
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('saved'));
  });

  it('writes updates to storage', () => {
    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    act(() => result.current[1]('next'));
    expect(result.current[0]).toBe('next');
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('next'));
  });

  it('keeps working in memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { result } = renderHook(() => usePersistentState(KEY, 'fallback', isString));
    expect(result.current[0]).toBe('fallback');

    act(() => result.current[1]('next'));
    expect(result.current[0]).toBe('next');
  });
});
