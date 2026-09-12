import React from 'react';
import PropTypes from 'prop-types';
import { useShareResult } from '../../lib/useShareResult';
import styles from './ShareResultButton.module.css';

const STATUS_TEXT = {
  idle: '',
  shared: 'Shared',
  copied: 'Copied',
  error: "Couldn't copy",
};

export default function ShareResultButton({ text, label }) {
  const { share, status } = useShareResult();

  return (
    <div className={styles.shareRow}>
      <button type="button" className={styles.shareButton} onClick={() => share(text)}>
        {label}
      </button>
      {/* Rendered even while idle so the live region exists before it has content. */}
      <span className={styles.shareStatus} role="status" aria-live="polite">
        {STATUS_TEXT[status]}
      </span>
    </div>
  );
}

ShareResultButton.propTypes = {
  text: PropTypes.string.isRequired,
  label: PropTypes.string,
};

ShareResultButton.defaultProps = {
  label: 'SHARE',
};
