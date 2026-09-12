import { useCallback, useEffect, useRef, useState } from 'react';

export const SHARE_STATUS_RESET_MS = 2000;

/**
 * Shares a short piece of text, preferring the OS share sheet and falling back to
 * the clipboard. `status` reports the outcome ('shared' | 'copied' | 'error') and
 * clears itself after SHARE_STATUS_RESET_MS so the UI can announce it transiently.
 *
 * Capability detection happens inside `share`, never during render: navigator.share
 * is absent during static export and present on a phone, so branching on it while
 * rendering would produce a hydration mismatch.
 */
export function useShareResult() {
  const [status, setStatus] = useState('idle');
  const resetTimer = useRef(null);
  const isMounted = useRef(true);
  const isSharing = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearTimeout(resetTimer.current);
    };
  }, []);

  const settle = useCallback((next) => {
    clearTimeout(resetTimer.current);
    if (!isMounted.current) return;
    setStatus(next);
    if (next === 'idle') return;
    resetTimer.current = setTimeout(() => {
      if (isMounted.current) setStatus('idle');
    }, SHARE_STATUS_RESET_MS);
  }, []);

  const share = useCallback(
    async (text) => {
      // A second tap while a share is already in flight would race the OS share sheet:
      // navigator.share rejects the concurrent call before the first one resolves.
      if (isSharing.current) return;
      isSharing.current = true;
      clearTimeout(resetTimer.current);

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          try {
            await navigator.share({ text });
            settle('shared');
          } catch (error) {
            // Dismissing the share sheet is a normal outcome, not a failure.
            settle(error && error.name === 'AbortError' ? 'idle' : 'error');
          }
          return;
        }

        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.clipboard?.writeText === 'function'
        ) {
          try {
            await navigator.clipboard.writeText(text);
            settle('copied');
          } catch {
            settle('error');
          }
          return;
        }

        settle('error');
      } finally {
        isSharing.current = false;
      }
    },
    [settle],
  );

  return { share, status };
}
