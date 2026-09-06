import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import styles from './index.module.css';
import { pwaMetaTags } from '../../components/layout';
import { getPetType, spriteMood } from '../../lib/tamagotchi/creatures';
import { loadPet, savePet } from '../../lib/tamagotchi/storage';
import {
  applyElapsed,
  feedPet,
  playWithPet,
  toggleSleep,
  cleanPoop,
  MET_THRESHOLD,
  NEED_FLOOR,
  NEED_MAX,
  PET_TAP_AMOUNT,
} from '../../lib/tamagotchi/simulation';
import { createSound } from '../../lib/tamagotchi/sound';
import {
  generateRounds,
  scoreTap,
  computePlayAmount,
  ROUND_COUNT,
  HIT_WINDOW_MS,
} from '../../lib/tamagotchi/minigame';

const TICK_MS = 2000;

function NeedBar({ label, value }) {
  return (
    <div className={styles.needRow}>
      <span className={styles.needLabel}>{label}</span>
      <div className={styles.needTrack}>
        <div
          className={styles.needFill}
          style={{ width: `${((value - NEED_FLOOR) / (NEED_MAX - NEED_FLOOR)) * 100}%` }}
        />
      </div>
    </div>
  );
}
NeedBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
};

function MinigameOverlay({ onComplete, onCancel }) {
  const [rounds] = useState(() => generateRounds(ROUND_COUNT));
  const [roundIndex, setRoundIndex] = useState(0);
  const resultsRef = useRef([]);
  const startRef = useRef(Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    if (roundIndex >= ROUND_COUNT) {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete(resultsRef.current);
      }
      return undefined;
    }
    const round = rounds[roundIndex];
    const msUntilWindowCloses = round.targetAt + HIT_WINDOW_MS - (Date.now() - startRef.current);
    if (msUntilWindowCloses <= 0) {
      // The window already closed before this effect got to run (e.g. a
      // background tab, or a fake-timer test jumping far ahead in one leap).
      // Resolve it as a miss immediately rather than scheduling a 0ms timer
      // — a real timer here would need another macrotask/tick to fire,
      // which a single big time-jump in tests never provides, stalling the
      // overlay short of ROUND_COUNT results.
      resultsRef.current = [...resultsRef.current, { hit: false, accuracy: 0 }];
      setRoundIndex((i) => i + 1);
      return undefined;
    }
    const id = setTimeout(() => {
      resultsRef.current = [...resultsRef.current, { hit: false, accuracy: 0 }];
      setRoundIndex((i) => i + 1);
    }, msUntilWindowCloses);
    return () => clearTimeout(id);
  }, [roundIndex, rounds, onComplete]);

  const handleTap = () => {
    if (roundIndex >= ROUND_COUNT) return;
    const tapOffsetMs = Date.now() - startRef.current;
    resultsRef.current = [...resultsRef.current, scoreTap(rounds[roundIndex], tapOffsetMs)];
    setRoundIndex((i) => i + 1);
  };

  return (
    <div
      className={styles.minigameOverlay}
      data-testid="minigame-overlay"
      role="dialog"
      aria-label="Play minigame"
    >
      <button type="button" className={styles.minigameClose} aria-label="Cancel" onClick={onCancel}>
        ✕
      </button>
      <button type="button" className={styles.minigameTap} aria-label="Tap" onClick={handleTap}>
        🎯
      </button>
      <p>{`Round ${Math.min(roundIndex + 1, ROUND_COUNT)} of ${ROUND_COUNT}`}</p>
    </div>
  );
}
MinigameOverlay.propTypes = {
  onComplete: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default function Tamagotchi() {
  const { basePath } = useRouter();
  const [pet, setPet] = useState(null);
  const soundRef = useRef(null);

  // Mount: load, catch up offline decay, wire sound.
  useEffect(() => {
    const now = Date.now();
    const loaded = loadPet(now);
    const caughtUp = applyElapsed(loaded, now - loaded.lastSeen, now);
    setPet(caughtUp);
    soundRef.current = createSound(caughtUp.soundOn);
  }, []);

  // Persist + slow decay tick while mounted.
  useEffect(() => {
    if (!pet) return undefined;
    const id = setInterval(() => {
      setPet((prev) => {
        if (!prev) return prev;
        const now = Date.now();
        const next = applyElapsed(prev, now - prev.lastSeen, now);
        return savePet(next, now);
      });
    }, TICK_MS);
    return () => clearInterval(id);
    // Deliberately depends on presence, not identity: the interval only needs
    // to start once the pet first loads.
  }, [pet !== null]);

  const commit = useCallback((updater, cue) => {
    setPet((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (cue && soundRef.current) soundRef.current.play(cue);
      return savePet(next, Date.now());
    });
  }, []);

  const [minigameActive, setMinigameActive] = useState(false);
  const handleOpenMinigame = () => setMinigameActive(true);
  const handleMinigameComplete = useCallback(
    (results) => {
      setMinigameActive(false);
      commit((prev) => playWithPet(prev, computePlayAmount(results)), 'play');
    },
    [commit],
  );
  const handleMinigameCancel = useCallback(() => setMinigameActive(false), []);

  const handleFeed = () => commit((prev) => feedPet(prev), 'nom');
  const handlePlay = () => commit((prev) => playWithPet(prev, PET_TAP_AMOUNT), 'play');
  const handleClean = () => commit((prev) => cleanPoop(prev), 'clean');
  const handleSleepToggle = () => commit((prev) => toggleSleep(prev), 'sleep');
  const toggleSound = () =>
    commit((prev) => {
      const soundOn = !prev.soundOn;
      if (soundRef.current) soundRef.current.setEnabled(soundOn);
      return { ...prev, soundOn };
    }, null);

  if (!pet) {
    return (
      <div className={styles.page}>
        <Head>{pwaMetaTags(basePath)}</Head>
      </div>
    );
  }

  const petType = getPetType(pet.petType);
  const mood = spriteMood(pet, MET_THRESHOLD);
  const sprite = petType.sprite[pet.stage][mood];

  return (
    <div className={styles.page}>
      <Head>{pwaMetaTags(basePath)}</Head>

      <button
        type="button"
        className={styles.muteToggle}
        aria-pressed={pet.soundOn}
        aria-label={pet.soundOn ? 'Sound on' : 'Sound off'}
        onClick={toggleSound}
      >
        {pet.soundOn ? '🔊' : '🔇'}
      </button>

      <div className={styles.screen}>
        <button
          type="button"
          data-testid="pet"
          className={styles.pet}
          aria-label={petType.name}
          onClick={handlePlay}
        >
          {sprite}
        </button>

        {pet.hasPoop && (
          <button
            type="button"
            data-testid="poop"
            className={styles.poop}
            aria-label="Clean up"
            onClick={handleClean}
          >
            💩
          </button>
        )}
      </div>

      {minigameActive && (
        <MinigameOverlay onComplete={handleMinigameComplete} onCancel={handleMinigameCancel} />
      )}

      <div className={styles.needs}>
        <NeedBar label="Hunger" value={pet.hunger} />
        <NeedBar label="Happiness" value={pet.happiness} />
        <NeedBar label="Energy" value={pet.energy} />
      </div>

      <div className={styles.palette} role="group" aria-label="Care actions">
        <button type="button" className={styles.action} aria-label="Feed" onClick={handleFeed}>
          🍤
        </button>
        <button type="button" className={styles.action} aria-label="Play" onClick={handleOpenMinigame}>
          🎾
        </button>
        <button
          type="button"
          className={styles.action}
          aria-pressed={pet.asleep}
          aria-label={pet.asleep ? 'Wake' : 'Sleep'}
          onClick={handleSleepToggle}
        >
          {pet.asleep ? '⏰' : '🌙'}
        </button>
      </div>
    </div>
  );
}
