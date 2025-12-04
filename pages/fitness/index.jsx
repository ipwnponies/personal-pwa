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

    return {
      rir,
      estimatedOneRm,
      repMaxes,
    };
  }, [rir, repetitions, weight]);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
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
          <p style={{ marginBottom: '0.75rem' }}>
            Using the Epley formula, your
            estimated one-rep max is <strong>{calculation.estimatedOneRm.toFixed(0)} units</strong>.
          </p>

          <div
            style={{
              overflowX: 'auto',
              maxHeight: '360px',
              overflowY: 'auto',
              border: '1px solid #eee',
              borderRadius: '8px',
            }}
          >
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
                      {entry.weight.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
