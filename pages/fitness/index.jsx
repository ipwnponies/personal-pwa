import React, { useMemo, useState } from 'react';

const rpeToRirLookup = {
  10: 0,
  9.5: 0.5,
  9: 1,
  8.5: 1.5,
  8: 2,
  7.5: 2.5,
  7: 3,
  6.5: 3.5,
  6: 4,
};

function getRirForRpe(rpe) {
  return { rpe, rir: rpeToRirLookup[rpe] };
}

function calculateOneRmEpley(weight, reps, rir) {
  const effectiveReps = Math.max(reps + rir - 1, 0);
  return weight * (1 + effectiveReps / 30);
}

function calculateWeightFromOneRm(oneRm, reps, rir) {
  const effectiveReps = Math.max(reps + rir - 1, 0);
  return oneRm / (1 + effectiveReps / 30);
}

function buildRepMaxTable(estimatedOneRm) {
  return Array.from({ length: 10 }, (_, index) => {
    const repCount = index + 1;
    return {
      repCount,
      weight: calculateWeightFromOneRm(estimatedOneRm, repCount, 0),
    };
  });
}

export default function FitnessRpeCalculator() {
  const [repetitions, setRepetitions] = useState(5);
  const [weight, setWeight] = useState(100);
  const [rpe, setRpe] = useState(8.5);

  const calculation = useMemo(() => {
    const repsInt = Number(repetitions);
    const weightNum = Number(weight);
    const rpeNum = Number(rpe);

    if (!Number.isFinite(repsInt) || repsInt <= 0 || repsInt > 10) {
      return { error: 'Enter repetitions between 1 and 10.' };
    }

    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      return { error: 'Enter a working weight greater than 0.' };
    }

    if (!Number.isFinite(rpeNum) || rpeNum < 6 || rpeNum > 10) {
      return { error: 'Enter an RPE value between 6 and 10.' };
    }

    const { rpe: mappedRpe, rir } = getRirForRpe(rpeNum);

    if (typeof rir !== 'number') {
      return { error: 'Enter an RPE in 0.5 increments between 6 and 10.' };
    }

    const estimatedOneRm = calculateOneRmEpley(weightNum, repsInt, rir);
    const repMaxes = buildRepMaxTable(estimatedOneRm);

    return {
      mappedRpe,
      rir,
      estimatedOneRm,
      repMaxes,
    };
  }, [rpe, repetitions, weight]);

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
          <span>Repetitions (1-10)</span>
          <input
            type="number"
            min="1"
            max="10"
            value={repetitions}
            onChange={(event) => setRepetitions(event.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>Weight used</span>
          <input
            type="number"
            min="0"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>Exertion rating (RPE 6-10)</span>
          <input
            type="number"
            min="6"
            max="10"
            step="0.5"
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>
      </form>

      {calculation.error ? (
        <p style={{ color: '#b00020' }}>{calculation.error}</p>
      ) : (
        <section>
          <p style={{ marginBottom: '0.75rem' }}>
            Using the Epley formula with an RPE-to-RIR adjustment (RPE{' '}
            {calculation.mappedRpe.toFixed(1)} ≈ {calculation.rir.toFixed(1)} reps in reserve), your
            estimated one-rep max is <strong>{calculation.estimatedOneRm.toFixed(1)} units</strong>.
          </p>

          <div style={{ overflowX: 'auto' }}>
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
                      {entry.weight.toFixed(1)}
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
