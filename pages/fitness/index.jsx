import React, { useMemo, useState } from 'react';

const rpeChart = {
  10: {
    1: 100,
    2: 95.5,
    3: 92.2,
    4: 89.2,
    5: 86.3,
    6: 83.7,
    7: 81.1,
    8: 78.6,
    9: 76.2,
    10: 73.9,
  },
  9.5: {
    1: 97.8,
    2: 94.5,
    3: 91.3,
    4: 88.3,
    5: 85.7,
    6: 83.1,
    7: 80.6,
    8: 78.2,
    9: 75.8,
    10: 73.6,
  },
  9: {
    1: 95.5,
    2: 92.2,
    3: 89.2,
    4: 86.3,
    5: 83.7,
    6: 81.1,
    7: 78.6,
    8: 76.2,
    9: 73.9,
    10: 71.7,
  },
  8.5: {
    1: 92.2,
    2: 89.2,
    3: 86.3,
    4: 83.7,
    5: 81.1,
    6: 78.6,
    7: 76.2,
    8: 73.9,
    9: 71.7,
    10: 69.5,
  },
  8: {
    1: 89.2,
    2: 86.3,
    3: 83.7,
    4: 81.1,
    5: 78.6,
    6: 76.2,
    7: 73.9,
    8: 71.7,
    9: 69.5,
    10: 67.3,
  },
  7.5: {
    1: 86.3,
    2: 83.7,
    3: 81.1,
    4: 78.6,
    5: 76.2,
    6: 73.9,
    7: 71.7,
    8: 69.5,
    9: 67.3,
    10: 65.2,
  },
  7: {
    1: 83.7,
    2: 81.1,
    3: 78.6,
    4: 76.2,
    5: 73.9,
    6: 71.7,
    7: 69.5,
    8: 67.3,
    9: 65.2,
    10: 63.2,
  },
  6.5: {
    1: 81.1,
    2: 78.6,
    3: 76.2,
    4: 73.9,
    5: 71.7,
    6: 69.5,
    7: 67.3,
    8: 65.2,
    9: 63.2,
    10: 61.1,
  },
  6: {
    1: 78.6,
    2: 76.2,
    3: 73.9,
    4: 71.7,
    5: 69.5,
    6: 67.3,
    7: 65.2,
    8: 63.2,
    9: 61.1,
    10: 59.2,
  },
};

function getNearestChart(rpe) {
  const available = Object.keys(rpeChart).map(parseFloat);
  return available.reduce((prev, current) => {
    return Math.abs(current - rpe) < Math.abs(prev - rpe) ? current : prev;
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

    const nearestRpe = getNearestChart(rpeNum);
    const percentAtInput = rpeChart[nearestRpe][repsInt];

    if (!percentAtInput) {
      return { error: 'No chart data for that repetition and RPE combination.' };
    }

    const estimatedOneRm = weightNum / (percentAtInput / 100);
    const repMaxes = Object.entries(rpeChart[10]).map(([repCount, percent]) => {
      return {
        repCount: Number(repCount),
        weight: estimatedOneRm * (percent / 100),
      };
    });

    return {
      nearestRpe,
      percentAtInput,
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
            Using the nearest chart entry (RPE {calculation.nearestRpe.toFixed(1)} at{' '}
            {repetitions} reps ≈ {calculation.percentAtInput}% of 1RM), your estimated
            one-rep max is{' '}
            <strong>{calculation.estimatedOneRm.toFixed(1)} units</strong>.
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
