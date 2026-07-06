import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useMemo, useState } from 'react';
import {
  REPETITION_MIN,
  REPETITION_MAX,
  calculateOneRmEpley,
  formatWeight,
  buildPercentageTable,
  buildRepMaxTable,
} from '../../lib/epley';
import { pwaMetaTags } from '../../components/layout';
import styles from './index.module.css';

export default function FitnessCalculator() {
  const { basePath } = useRouter();
  const [repetitions, setRepetitions] = useState(5);
  const [weight, setWeight] = useState(100);

  const handleNumberInputChange = (setter) => (event) => {
    const { value } = event.target;
    if (value === '') {
      setter(null);
      return;
    }

    setter(Number(value));
  };

  const calculation = useMemo(() => {
    if (
      !Number.isFinite(repetitions) ||
      repetitions < REPETITION_MIN ||
      repetitions > REPETITION_MAX
    ) {
      return { error: `Enter repetitions between ${REPETITION_MIN} and ${REPETITION_MAX}.` };
    }

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
  const repetitionDisplay = Number.isFinite(repetitions)
    ? `${repetitions} rep${repetitions === 1 ? '' : 's'}`
    : '--';

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
              min="0"
              value={weight ?? ''}
              onChange={handleNumberInputChange(setWeight)}
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span>Repetitions ({REPETITION_MIN}-{REPETITION_MAX})</span>
            <input
              type="number"
              min={REPETITION_MIN}
              max={REPETITION_MAX}
              value={repetitions ?? ''}
              onChange={handleNumberInputChange(setRepetitions)}
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
