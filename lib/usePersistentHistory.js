import { useCallback } from 'react';
import { generateId, pushHistoryEntry } from './random';
import { usePersistentState } from './usePersistentState';

const isHistoryEntry = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  typeof entry.id === 'string' &&
  typeof entry.label === 'string' &&
  typeof entry.timestamp === 'number';

export const isHistory = (value) => Array.isArray(value) && value.every(isHistoryEntry);

export function usePersistentHistory(key, max) {
  const [entries, setEntries] = usePersistentState(key, [], isHistory);

  // id and timestamp are made outside the updater so a re-run updater
  // (StrictMode) cannot produce a different entry.
  const push = useCallback(
    (entry) => {
      const stamped = { ...entry, id: generateId(), timestamp: Date.now() };
      setEntries((previous) => pushHistoryEntry(previous, stamped, max));
    },
    [setEntries, max],
  );

  const clear = useCallback(() => setEntries([]), [setEntries]);

  return { entries, push, clear };
}
