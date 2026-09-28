import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../pages/random/index.module.css';

export default function HistoryList({ title, entries }) {
  if (entries.length === 0) return null;

  return (
    <div className={styles.historyList}>
      <span className={styles.historyTitle}>{title}</span>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.historyRow}>
          <span className={styles.historyLabel}>{entry.label}</span>
          <span className={styles.historyTime}>
            {new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

HistoryList.propTypes = {
  title: PropTypes.string.isRequired,
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired,
    }),
  ).isRequired,
};
