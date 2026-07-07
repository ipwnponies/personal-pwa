import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useMemo, useState } from 'react';
import {
  REPETITION_MIN,
  calculateOneRmEpley,
  formatWeight,
  buildPercentageTable,
  buildRepMaxTable,
} from '../../lib/epley';
import { useSwipeNumber } from '../../lib/useSwipeNumber';
import { pwaMetaTags } from '../../components/layout';
import styles from './index.module.css';

export default function FitnessCalculator() {
  const { basePath } = useRouter();
  const [repetitions, setRepetitions] = useState(5);
  const [weight, setWeight] = useState(100);

  const weightField = useSwipeNumber(weight, setWeight, 0, Infinity);
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
          <label className={styles.field}>
            <span>Weight used</span>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={weightField.inputValue}
              placeholder={weightField.placeholder}
              onChange={weightField.onChange}
              onFocus={weightField.onFocus}
              onBlur={weightField.onBlur}
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span>Repetitions</span>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={REPETITION_MIN}
              value={repsField.inputValue}
              placeholder={repsField.placeholder}
              onChange={repsField.onChange}
              onFocus={repsField.onFocus}
              onBlur={repsField.onBlur}
              onTouchStart={repsField.onTouchStart}
              onTouchMove={repsField.onTouchMove}
              onTouchEnd={repsField.onTouchEnd}
              className={styles.input}
            />
          </label>

        </form>

        {calculation.error ? (
          <p className={styles.errorText}>{calculation.error}</p>
        ) : (
          <section>
            <div className={styles.resultsGrid}>
              <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                  <h2 className={styles.tableTitle}>Projected Rep Maxes</h2>
                  <p className={styles.tableSubtitle}>
                    Reps taken to failure using the estimated 1RM.
                  </p>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Reps to Failure</th>
                      <th className={styles.th}>Estimated Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.repMaxes.map((entry) => (
                      <tr key={entry.repCount}>
                        <td className={styles.td}>
                          {entry.repCount} rep{entry.repCount > 1 ? 's' : ''}
                        </td>
                        <td className={styles.td}>{formatWeight(entry.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                  <h2 className={styles.tableTitle}>1RM Percentage Guide</h2>
                  <p className={styles.tableSubtitle}>
                    Quick reference for popular training percentages.
                  </p>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>% of 1RM</th>
                      <th className={styles.th}>Estimated Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.percentageBreakdown.map((entry) => (
                      <tr key={entry.percentage}>
                        <td className={styles.td}>{entry.percentage}%</td>
                        <td className={styles.td}>{formatWeight(entry.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
