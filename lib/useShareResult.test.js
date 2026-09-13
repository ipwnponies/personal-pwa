import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useShareResult, SHARE_STATUS_RESET_MS } from './useShareResult';

function setNavigatorApis({ share, writeText }) {
  if (share) {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  }
  if (writeText) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  }
}

function abortError() {
  const error = new Error('Share canceled');
  error.name = 'AbortError';
  return error;
}

afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
  vi.useRealTimers();
});

describe('useShareResult', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useShareResult());

    expect(result.current.status).toBe('idle');
  });

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorApis({ share });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('4, 6 (sum: 10)');
    });

    expect(share).toHaveBeenCalledWith({ text: '4, 6 (sum: 10)' });
    expect(result.current.status).toBe('shared');
  });

  it('falls back to the clipboard when the Web Share API is absent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorApis({ writeText });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Pizza (35% chance)');
    });

    expect(writeText).toHaveBeenCalledWith('Pizza (35% chance)');
    expect(result.current.status).toBe('copied');
  });

  it('stays idle when the user dismisses the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorApis({ share, writeText });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });

    expect(result.current.status).toBe('idle');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports an error when sharing fails for any other reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    setNavigatorApis({ share });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });

    expect(result.current.status).toBe('error');
  });

  it('reports an error when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    setNavigatorApis({ writeText });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });

    expect(result.current.status).toBe('error');
  });

  it('reports an error when neither API is available', async () => {
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });

    expect(result.current.status).toBe('error');
  });

  it('ignores a second share call while the first is still in flight', async () => {
    let resolveShare;
    const share = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveShare = resolve;
      }),
    );
    setNavigatorApis({ share });
    const { result } = renderHook(() => useShareResult());

    let firstCall;
    act(() => {
      firstCall = result.current.share('Heads');
      result.current.share('Heads');
    });

    expect(share).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveShare();
      await firstCall;
    });

    expect(result.current.status).toBe('shared');
  });

  it('returns to idle after the reset delay', async () => {
    vi.useFakeTimers();
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorApis({ share });
    const { result } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });
    expect(result.current.status).toBe('shared');

    act(() => {
      vi.advanceTimersByTime(SHARE_STATUS_RESET_MS);
    });

    expect(result.current.status).toBe('idle');
  });

  it('does not update state after unmount', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorApis({ share });
    const { result, unmount } = renderHook(() => useShareResult());

    await act(async () => {
      await result.current.share('Heads');
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(SHARE_STATUS_RESET_MS);
    });

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
