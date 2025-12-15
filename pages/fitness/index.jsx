import React, { useMemo, useState } from 'react';

const REPETITION_MIN = 1;
const REPETITION_MAX = 30;
const REPETITION_RANGE = REPETITION_MAX - REPETITION_MIN + 1;

function epleyRatio(reps, rir) {
  if (reps < REPETITION_MIN) throw new Error("What's the point of 0 reps, get outta here")
  if (rir < 0) throw new Error("rir must be >= 0");

  const effectiveReps = reps + rir
  return 1 + (effectiveReps - 1) / 30;
}

function calculateOneRmEpley(weight, reps, rir) {
  return weight * epleyRatio(reps, rir);
}

function calculateWeightFromOneRm(oneRm, reps, rir) {
  return oneRm / epleyRatio(reps, rir);
}

function formatWeight(weight) {
  return Number.isFinite(weight) ? weight.toFixed(0) : '-';
}

function buildPercentageTable(estimatedOneRm) {
  const percentages = [];

  for (let percentage = 100; percentage >= 50; percentage -= 5) {
    percentages.push({
      percentage,
      weight: (estimatedOneRm * percentage) / 100,
    });
  }

  return percentages;
}

function buildRepMaxTable(estimatedOneRm) {
  return Array.from({ length: REPETITION_RANGE }, (_, index) => {
    const repCount = REPETITION_MIN + index;
    return {
      repCount,
      weight: calculateWeightFromOneRm(estimatedOneRm, repCount, 0),
    };
  });
}

export default function FitnessRpeCalculator() {
  const [repetitions, setRepetitions] = useState(5);
  const [weight, setWeight] = useState(100);
  const [rir, setRir] = useState(2);

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

    if (!Number.isFinite(rir) || rir < 0) {
      return { error: 'Enter a valid RIR value.' };
    }

    const estimatedOneRm = calculateOneRmEpley(weight, repetitions, rir);
    const repMaxes = buildRepMaxTable(estimatedOneRm);
    const percentageBreakdown = buildPercentageTable(estimatedOneRm);

    return {
      rir,
      estimatedOneRm,
      repMaxes,
      percentageBreakdown,
    };
  }, [rir, repetitions, weight]);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>RPE Rep-Max Calculator</h1>
      <p style={{ marginBottom: '1.5rem', color: '#444' }}>
        Enter the reps, weight, and RPE of a recent set to estimate your one-rep max and
        see projected rep-maxes across the rep range.
      </p>

      <form
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>Repetitions ({REPETITION_MIN}-{REPETITION_MAX})</span>
          <input
            type="number"
            min={REPETITION_MIN}
            max={REPETITION_MAX}
            value={repetitions}
            onChange={(event) => setRepetitions(Number(event.target.value))}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>Weight used</span>
          <input
            type="number"
            min="0"
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>Exertion rating (RPE 0-10)</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={rir}
            onChange={(event) => setRir(Number(event.target.value))}
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
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
                {formatWeight(calculation.estimatedOneRm)} units
              </p>
              <p style={{ margin: '0.35rem 0 0', color: '#777', fontSize: '0.9rem' }}>
                Based on {repetitions} rep{repetitions === 1 ? '' : 's'} @ RPE {10 - rir}
              </p>
            </div>
            <div
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                padding: '1rem',
                background: '#fafafa',
              }}
            >
              <p style={{ margin: 0, color: '#555' }}>Inputs</p>
              <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.25rem', color: '#555' }}>
                <li>
                  Weight used: <strong>{formatWeight(weight)}</strong>
                </li>
                <li>
                  Repetitions: <strong>{repetitions}</strong>
                </li>
                <li>
                  RPE: <strong>{10 - rir}</strong>
                </li>
              </ul>
            </div>
          </div>

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
                  Reps taken to RPE 10 using the estimated 1RM.
                </p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: '0.5rem' }}>
                      Reps @ RPE 10
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
  );
}
