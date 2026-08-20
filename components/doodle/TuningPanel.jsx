import React from 'react';
import PropTypes from 'prop-types';
import styles from './doodle.module.css';

// Each row's key must match a key in DoodleCanvas's `tuning` state object.
const FIELDS = [
  {
    key: 'maxParticles', label: 'Max particles', min: 10, max: 1000, step: 10,
  },
  {
    key: 'dustMaxAge', label: 'Dust max age (s)', min: 0.05, max: 5, step: 0.05,
  },
  {
    key: 'dustFrameInterval', label: 'Dust every Nth frame', min: 1, max: 30, step: 1,
  },
  {
    key: 'driftMin', label: 'Drift speed min (px/s)', min: 0, max: 200, step: 1,
  },
  {
    key: 'driftMax', label: 'Drift speed max (px/s)', min: 0, max: 200, step: 1,
  },
];

export default function TuningPanel({
  tuning, onChange, onReset, onClose,
}) {
  return (
    <div className={styles.tuningPanel} role="dialog" aria-label="Tuning settings">
      <div className={styles.tuningHeader}>
        <span>Tuning</span>
        <button
          type="button"
          className={styles.tuningClose}
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {FIELDS.map(({
        key, label, min, max, step,
      }) => (
        <label key={key} className={styles.tuningRow} htmlFor={`tuning-${key}`}>
          {label}
          <input
            id={`tuning-${key}`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={tuning[key]}
            onChange={(e) => onChange(key, Number(e.target.value))}
          />
        </label>
      ))}
      <button type="button" className={styles.tuningReset} onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  );
}

TuningPanel.propTypes = {
  tuning: PropTypes.shape({
    maxParticles: PropTypes.number.isRequired,
    dustMaxAge: PropTypes.number.isRequired,
    dustFrameInterval: PropTypes.number.isRequired,
    driftMin: PropTypes.number.isRequired,
    driftMax: PropTypes.number.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
