import Head from 'next/head';
import { useRouter } from 'next/router';
import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  REPETITION_MIN,
  calculateOneRmEpley,
  calculatePercentageOfOneRm,
  roundToNearestFivePercent,
  formatWeight,
  buildPercentageTable,
  buildRepMaxTable,
} from '../../lib/epley';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { pwaMetaTags } from '../../components/layout';
import styles from './index.module.css';

const STORAGE_KEY = 'fitness-inputs';
const WEIGHT_SWIPE_STEP = 5;

function loadStoredInputs() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function ResultTable({ title, subtitle, columnLabels, rows, rowKey, rowLabel, rowValue, highlightedKey }) {
  const highlightedRowRef = useRef(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(timeout);
  }, [highlightedKey]);

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeader}>
        <h2 className={styles.tableTitle}>{title}</h2>
        <p className={styles.tableSubtitle}>{subtitle}</p>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>{columnLabels[0]}</th>
              <th className={styles.th}>{columnLabels[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isHighlighted = key === highlightedKey;
              return (
                <tr
                  key={key}
                  ref={isHighlighted ? highlightedRowRef : undefined}
                  className={isHighlighted ? styles.rowHighlighted : undefined}
                >
                  <td className={styles.td}>{rowLabel(row)}</td>
                  <td className={styles.td}>{rowValue(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ResultTable.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
  columnLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  rowKey: PropTypes.func.isRequired,
  rowLabel: PropTypes.func.isRequired,
  rowValue: PropTypes.func.isRequired,
  highlightedKey: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

function SwipeNumberField({ label, field, min }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.swipeInputWrap}>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={min}
          value={field.inputValue}
          placeholder={field.placeholder}
          onChange={field.onChange}
          onFocus={field.onFocus}
          onBlur={field.onBlur}
          onKeyDown={field.onKeyDown}
          onTouchStart={field.onTouchStart}
          onTouchMove={field.onTouchMove}
          onTouchEnd={field.onTouchEnd}
          className={styles.input}
        />
        <span className={`${styles.swipeChevrons} ${styles.swipeHint}`} aria-hidden="true">
          <span>▲</span>
          <span>▼</span>
        </span>
      </div>
    </label>
  );
}

SwipeNumberField.propTypes = {
  label: PropTypes.string.isRequired,
  field: PropTypes.shape({
    inputValue: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    placeholder: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    onFocus: PropTypes.func.isRequired,
    onBlur: PropTypes.func.isRequired,
    onKeyDown: PropTypes.func.isRequired,
    onTouchStart: PropTypes.func.isRequired,
    onTouchMove: PropTypes.func.isRequired,
    onTouchEnd: PropTypes.func.isRequired,
  }).isRequired,
  min: PropTypes.number.isRequired,
};

export default function FitnessCalculator() {
  const { basePath } = useRouter();
  const [weight, setWeight] = useState(100);
  const [repetitions, setRepetitions] = useState(5);
  const [hydrated, setHydrated] = useState(false);

  // Read must happen in an effect, not a lazy useState initializer: the server has no
  // localStorage, so a synchronous read would make the client's first render diverge
  // from the server-rendered HTML and trigger a hydration mismatch.
  useEffect(() => {
    const stored = loadStoredInputs();
    if (stored) {
      if (Number.isFinite(stored.weight) && stored.weight > 0) setWeight(stored.weight);
      if (Number.isFinite(stored.repetitions) && stored.repetitions >= REPETITION_MIN) {
        setRepetitions(stored.repetitions);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ weight, repetitions }));
  }, [weight, repetitions, hydrated]);

  const weightField = useSwipeNumber(weight, setWeight, 0, Infinity, WEIGHT_SWIPE_STEP);
  const repsField = useSwipeNumber(repetitions, setRepetitions, REPETITION_MIN, Infinity);

  const calculation = useMemo(() => {
    if (!Number.isFinite(weight) || weight <= 0) {
      return { error: 'Enter a working weight greater than 0.' };
    }

    const estimatedOneRm = calculateOneRmEpley(weight, repetitions);
    const repMaxes = buildRepMaxTable(estimatedOneRm);
    const percentageBreakdown = buildPercentageTable(estimatedOneRm);

    return {
      estimatedOneRm,
      repMaxes,
      percentageBreakdown,
    };
  }, [repetitions, weight]);

  const estimatedOneRmDisplay = calculation.error ? '--' : formatWeight(calculation.estimatedOneRm);
  const repetitionDisplay = `${repetitions} rep${repetitions === 1 ? '' : 's'}`;
  const highlightedPercent = calculation.error
    ? null
    : roundToNearestFivePercent(calculatePercentageOfOneRm(repetitions));

  return (
    <>
      <Head>
        {pwaMetaTags(basePath, {
          manifestPath: 'fitness-manifest.json',
          appName: 'Zero-to-Hero App',
          description: 'Estimate your one-rep max and rep-max training percentages',
          path: '/fitness',
          iconPrefix: 'fitness-launchericon',
          appleIconPrefix: 'fitness-apple-touch-icon',
          splashFileName: 'splash-fitness-1536x2048.png',
        })}
      </Head>
      <main className={styles.main}>
        <h1 className={styles.heading}>Rep-Max Calculator</h1>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Estimated 1RM</p>
            <p className={styles.summaryValue}>{estimatedOneRmDisplay} units</p>
            <p className={styles.summarySubtext}>Based on {repetitionDisplay}</p>
          </div>
        </div>

        <form className={styles.form}>
          <SwipeNumberField label="Weight used" field={weightField} min={0} />
          <SwipeNumberField label="Repetitions" field={repsField} min={REPETITION_MIN} />
        </form>

        {calculation.error ? (
          <p className={styles.errorText}>{calculation.error}</p>
        ) : (
          <section>
            <div className={styles.resultsGrid}>
              <ResultTable
                title="Projected Rep Maxes"
                subtitle="Reps taken to failure using the estimated 1RM."
                columnLabels={['Reps to Failure', 'Estimated Weight']}
                rows={calculation.repMaxes}
                rowKey={(entry) => entry.repCount}
                rowLabel={(entry) => `${entry.repCount} rep${entry.repCount > 1 ? 's' : ''}`}
                rowValue={(entry) => formatWeight(entry.weight)}
                highlightedKey={Math.round(repetitions)}
              />

              <ResultTable
                title="1RM Percentage Guide"
                subtitle="Quick reference for popular training percentages."
                columnLabels={['% of 1RM', 'Estimated Weight']}
                rows={calculation.percentageBreakdown}
                rowKey={(entry) => entry.percentage}
                rowLabel={(entry) => `${entry.percentage}%`}
                rowValue={(entry) => formatWeight(entry.weight)}
                highlightedKey={highlightedPercent}
              />
            </div>
          </section>
        )}
      </main>
    </>
  );
}
