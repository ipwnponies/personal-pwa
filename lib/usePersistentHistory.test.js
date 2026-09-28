import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentHistory, isHistory } from './usePersistentHistory';

const KEY = 'test-history';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePersistentHistory', () => {
  it('prepends entries with an id and timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { result } = renderHook(() => usePersistentHistory(KEY, 5));

    act(() => result.current.push({ label: 'first' }));
    act(() => result.current.push({ label: 'second' }));

    const [newest, oldest] = result.current.entries;
    expect(newest.label).toBe('second');
    expect(oldest.label).toBe('first');
    expect(typeof newest.id).toBe('string');
    expect(newest.id).not.toBe(oldest.id);
    expect(newest.timestamp).toBe(1000);
  });

  it('keeps at most max entries, dropping the oldest', () => {
    const { result } = renderHook(() => usePersistentHistory(KEY, 2));

    act(() => result.current.push({ label: 'a' }));
    act(() => result.current.push({ label: 'b' }));
    act(() => result.current.push({ label: 'c' }));

    expect(result.current.entries.map((e) => e.label)).toEqual(['c', 'b']);
  });

  it('persists and restores entries', () => {
    const first = renderHook(() => usePersistentHistory(KEY, 5));
    act(() => first.result.current.push({ label: 'kept' }));
    first.unmount();

    const second = renderHook(() => usePersistentHistory(KEY, 5));
    expect(second.result.current.entries.map((e) => e.label)).toEqual(['kept']);
  });

  it('clear empties the list and the empty list persists', () => {
    const first = renderHook(() => usePersistentHistory(KEY, 5));
    act(() => first.result.current.push({ label: 'gone' }));
    act(() => first.result.current.clear());
    expect(first.result.current.entries).toEqual([]);
    first.unmount();

    const second = renderHook(() => usePersistentHistory(KEY, 5));
    expect(second.result.current.entries).toEqual([]);
  });

  it('ignores stored arrays whose items are not history entries', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2]));
    const { result } = renderHook(() => usePersistentHistory(KEY, 5));
    expect(result.current.entries).toEqual([]);
  });
});

describe('isHistory', () => {
  it('accepts well-formed entries and rejects anything else', () => {
    expect(isHistory([{ id: 'a', label: 'x', timestamp: 1 }])).toBe(true);
    expect(isHistory([])).toBe(true);
    expect(isHistory({})).toBe(false);
    expect(isHistory([null])).toBe(false);
    expect(isHistory([{ id: 'a', label: 'x' }])).toBe(false);
  });
});
