import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import { createRandomSound } from '../../lib/randomSound';
import styles from './index.module.css';

const STORAGE_KEY = 'random-sound-on';

const noop = () => {};

// Default value covers every tab component rendered standalone (the six
// existing Random tab test files, unmodified, per the spec's regression
// guard) — useSoundCue() outside a provider is a silent no-op, never a
// missing-context throw.
const SoundContext = createContext({ play: noop, soundOn: true, toggle: noop });

export function SoundProvider({ children }) {
  const soundRef = useRef(null);
  if (!soundRef.current) {
    soundRef.current = createRandomSound(true);
  }

  // Initializes to true on both server and first client render — the stored
  // value is applied after mount, deliberately not read here. Reading
  // localStorage in this initializer (ShuffleList's pattern) would flip the
  // toggle icon between server and client markup for a muted user.
  const [soundOn, setSoundOn] = useState(true);
  // Mirrors soundOn synchronously. React batches state updates, so two
  // toggle() calls landing in the same batch would both read the same
  // pre-batch `soundOn` from render scope and compute the same `next`
  // instead of alternating; a ref write is immediate and sidesteps that.
  const soundOnRef = useRef(true);

  const applySoundOn = (next) => {
    soundOnRef.current = next;
    setSoundOn(next);
    soundRef.current.setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      // Private mode / disabled storage: the setting just doesn't persist.
    }
  };

  useEffect(() => {
    let stored;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    // Absent key, unparseable value, or a throwing read all mean on — the
    // state above already defaults to true, so only an explicit 'false'
    // needs to change anything here.
    if (stored === 'false') {
      soundOnRef.current = false;
      setSoundOn(false);
      soundRef.current.setEnabled(false);
    }
  }, []);

  const toggle = useCallback(() => {
    applySoundOn(!soundOnRef.current);
  }, []);

  // Stable forever: reads soundRef.current at call time rather than closing
  // over any state, so consumers that only use play() (every tab but the
  // toggle itself) never see a new function identity.
  const play = useCallback((cueName) => {
    soundRef.current.play(cueName);
  }, []);

  const value = useMemo(() => ({ play, soundOn, toggle }), [play, soundOn, toggle]);

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

SoundProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// Separate from SoundProvider because index.jsx renders the provider and
// can't consume its own context. Mirrors pages/aquarium/index.jsx's mute
// button (aria-pressed, aria-label, 🔊/🔇 emoji content).
export function SoundToggle() {
  const { soundOn, toggle } = useContext(SoundContext);
  return (
    <button
      type="button"
      className={styles.soundToggle}
      aria-pressed={soundOn}
      aria-label={soundOn ? 'Sound on' : 'Sound off'}
      onClick={toggle}
    >
      {soundOn ? '🔊' : '🔇'}
    </button>
  );
}

export function useSoundCue() {
  const { play } = useContext(SoundContext);
  return play;
}
