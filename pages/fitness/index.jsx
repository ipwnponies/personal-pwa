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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {pwaMetaTags(basePath, {
          manifestPath: 'fitness-manifest.json',
          appName: 'Zero-to-Hero App',
          description: 'Estimate your one-rep max and rep-max training percentages',
          path: '/fitness',
          iconPrefix: 'fitness-launchericon',
          appleIconPrefix: 'fitness-apple-touch-icon',
        })}
      </Head>
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Rep-Max Calculator</h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              padding: '1rem',
              background: '#fafafa',
            }}
          >
            <p style={{ margin: 0, color: '#555' }}>Estimated 1RM</p>
            <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
              {estimatedOneRmDisplay} units
            </p>
            <p style={{ margin: '0.35rem 0 0', color: '#777', fontSize: '0.9rem' }}>
              Based on {repetitionDisplay}
            </p>
          </div>
        </div>

        <form
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Weight used</span>
            <input
              type="number"
              min="0"
              value={weight ?? ''}
              onChange={handleNumberInputChange(setWeight)}
              style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Repetitions ({REPETITION_MIN}-{REPETITION_MAX})</span>
            <input
              type="number"
              min={REPETITION_MIN}
              max={REPETITION_MAX}
              value={repetitions ?? ''}
              onChange={handleNumberInputChange(setRepetitions)}
              style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </label>

        </form>

        {calculation.error ? (
          <p style={{ color: '#b00020' }}>{calculation.error}</p>
        ) : (
          <section>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  overflowX: 'auto',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ padding: '0.75rem', borderBottom: '1px solid #f2f2f2' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Projected Rep Maxes</h2>
                  <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                    Reps taken to failure using the estimated 1RM.
                  </p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.5rem' }}>
                        Reps to Failure
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.5rem' }}>
                        Estimated Weight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.repMaxes.map((entry) => (
                      <tr key={entry.repCount}>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                          {entry.repCount} rep{entry.repCount > 1 ? 's' : ''}
                        </td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                          {formatWeight(entry.weight)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ padding: '0.75rem', borderBottom: '1px solid #f2f2f2' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>1RM Percentage Guide</h2>
                  <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                    Quick reference for popular training percentages.
                  </p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.5rem' }}>
                        % of 1RM
                      </th>
                      <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.5rem' }}>
                        Estimated Weight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.percentageBreakdown.map((entry) => (
                      <tr key={entry.percentage}>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                          {entry.percentage}%
                        </td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.5rem' }}>
                          {formatWeight(entry.weight)}
                        </td>
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
