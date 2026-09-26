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
  {
    key: 'maxThrowSpeed', label: 'Max throw speed (px/s)', min: 0, max: 3000, step: 50,
  },
  {
    key: 'wallRestitution', label: 'Wall bounciness', min: 0, max: 1, step: 0.05,
  },
  {
    key: 'stuckAfterS', label: 'Stuck after (s)', min: 0.5, max: 10, step: 0.5,
  },
  {
    key: 'wallImmunityS', label: 'Wall immunity (s)', min: 0.5, max: 10, step: 0.5,
  },
  {
    key: 'shakeImpulse', label: 'Shake impulse (px/s)', min: 0, max: 1000, step: 10,
  },
  {
    key: 'maxSpeed', label: 'Max shape speed (px/s)', min: 50, max: 2000, step: 50,
  },
  {
    key: 'tiltStrength', label: 'Tilt strength (px/s²)', min: 0, max: 2000, step: 50,
  },
  {
    key: 'tiltDamping', label: 'Tilt damping (1/s)', min: 0, max: 5, step: 0.1,
  },
  {
    key: 'wellRadius', label: 'Well radius (px)', min: 50, max: 600, step: 10,
  },
  {
    key: 'wellStrength', label: 'Well strength (px/s²)', min: 0, max: 3000, step: 50,
  },
  {
    key: 'wellMaxSpeed', label: 'Well max speed (px/s)', min: 50, max: 2000, step: 50,
  },
  {
    key: 'wellHoldMs', label: 'Well hold (ms)', min: 200, max: 2000, step: 50,
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
    maxThrowSpeed: PropTypes.number.isRequired,
    wallRestitution: PropTypes.number.isRequired,
    stuckAfterS: PropTypes.number.isRequired,
    wallImmunityS: PropTypes.number.isRequired,
    shakeImpulse: PropTypes.number.isRequired,
    maxSpeed: PropTypes.number.isRequired,
    tiltStrength: PropTypes.number.isRequired,
    tiltDamping: PropTypes.number.isRequired,
    wellRadius: PropTypes.number.isRequired,
    wellStrength: PropTypes.number.isRequired,
    wellMaxSpeed: PropTypes.number.isRequired,
    wellHoldMs: PropTypes.number.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
