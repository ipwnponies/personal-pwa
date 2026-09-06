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

      <div className={styles.needs}>
        <NeedBar label="Hunger" value={pet.hunger} />
        <NeedBar label="Happiness" value={pet.happiness} />
        <NeedBar label="Energy" value={pet.energy} />
      </div>

      <div className={styles.palette} role="group" aria-label="Care actions">
        <button type="button" className={styles.action} aria-label="Feed" onClick={handleFeed}>
          🍤
        </button>
        <button type="button" className={styles.action} aria-label="Play" onClick={handlePlay}>
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
