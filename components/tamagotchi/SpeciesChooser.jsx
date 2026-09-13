import React from 'react';
import PropTypes from 'prop-types';

import styles from './SpeciesChooser.module.css';
import { PETS, petKeys } from '../../lib/tamagotchi/creatures';

// Shown only when there is no saved pet. Species is fixed for a pet's life, so
// this is the one moment the player picks one.
export default function SpeciesChooser({ onChoose }) {
  return (
    <div className={styles.chooser} role="group" aria-label="Choose a pet">
      <p className={styles.prompt}>Pick a pet</p>
      <div className={styles.choices}>
        {petKeys().map((key) => (
          <button
            key={key}
            type="button"
            className={styles.choice}
            aria-label={PETS[key].name}
            onClick={() => onChoose(key)}
          >
            <span className={styles.choiceSprite}>{PETS[key].sprite.baby.normal}</span>
            <span className={styles.choiceName}>{PETS[key].name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

SpeciesChooser.propTypes = {
  onChoose: PropTypes.func.isRequired,
};
