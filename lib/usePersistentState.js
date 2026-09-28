import { useEffect, useState } from 'react';

// Loads from localStorage in a mount effect, never during render, so the
// first client render matches the prerendered HTML (the Dice tab renders
// during hydration). `loaded` is state rather than a ref on purpose: with a
// ref, the write effect would run in the same commit as the load and store
// the fallback over saved data before the loaded value is applied.
// eslint-disable-next-line import/prefer-default-export
export function usePersistentState(key, fallback, isValid) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      // Storage unavailable or corrupt JSON: behave as if nothing was saved.
    }
    setLoaded(true);
  }, [key, isValid]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable or full: keep the value in memory only.
    }
  }, [key, value, loaded]);

  return [value, setValue];
}
