# Tamagotchi Unit C: Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the palette Play button into a short timing-based minigame (5 rounds, tap near each round's target moment) whose accuracy determines the happiness reward, replacing its previous flat `playWithPet` call.

**Architecture:** A new, pure, DOM-free `lib/tamagotchi/minigame.js` holds round generation and scoring math. A new `MinigameOverlay` React component in `pages/tamagotchi/index.jsx` drives the round timing (via `setTimeout`) and calls those pure functions, calling back into the page with a final results array once all rounds resolve or the player cancels.

**Tech Stack:** Vanilla JS (no TypeScript), Vitest + jsdom for unit tests, React 18 function components, `vi.useFakeTimers()` for the timer-driven page test.

**Spec:** `docs/superpowers/specs/2026-09-05-tamagotchi-game-design.md` (see "Unit C: Minigame" and "Conflict Boundaries")

## Global Constraints

- This is Unit C only, developed independently of Unit A (Evolution) and Unit B (Sickness) in a separate session/branch, starting from the same already-committed baseline. Do not wait for or reference their work.
- Baseline is already committed: `PLAY_AMOUNT = 25` (the minigame's ceiling reward) and `PET_TAP_AMOUNT = 10` (the pet-tap pat's smaller, separate reward) already exist in `lib/tamagotchi/simulation.js`. The pet-tap path (`data-testid="pet"`, `handlePlay`) already uses `PET_TAP_AMOUNT` — do not change it; this unit only touches the **palette** Play button.
- No death, no permanent stat loss, no failure states (spec Non-goals). Canceling the minigame must not penalize the pet — it just discards the session, no `playWithPet` call at all.
- No changes to `lib/aquarium/*` or `pages/aquarium/*`, and no changes to `lib/tamagotchi/creatures.js` or sickness code.
- **`computePlayAmount` must never see a short or empty results array.** A round the player doesn't tap in time still needs an entry (`{ hit: false, accuracy: 0 }`) once its window closes — never omitted. Skipping this would let `computePlayAmount` divide by zero (`0/0` = `NaN`), which would persist into `localStorage` as `null` and permanently corrupt the happiness stat on the next load. `computePlayAmount` itself does not guard against this — the overlay's job (Task 4) is to guarantee a full-length array before ever calling it.
- Airbnb ESLint config is active (`.eslintrc.yml`) — React components must be function declarations, not arrow functions (`react/function-component-definition`). Run `npx eslint <changed files>` before each commit.

---

### Task 1: `generateRounds`

**Files:**
- Create: `lib/tamagotchi/minigame.js`
- Create: `lib/tamagotchi/minigame.test.js`

**Interfaces:**
- Consumes: `clamp` from `lib/random.js` (not needed by this task, but the file will need it by Task 2 — fine to add the import now or in Task 2).
- Produces: `ROUND_COUNT = 5`, `HIT_WINDOW_MS = 400`, `MIN_ROUND_SPACING_MS = 600` (exported constants), and `generateRounds(count, rng = Math.random) => [{ targetAt }]`, strictly increasing, each at least `MIN_ROUND_SPACING_MS` apart, first `targetAt` at least `MIN_ROUND_SPACING_MS` after `0`. Consumed by Task 4 (`MinigameOverlay`).

- [ ] **Step 1: Write the failing tests**

Create `lib/tamagotchi/minigame.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateRounds, MIN_ROUND_SPACING_MS } from './minigame';

describe('generateRounds', () => {
  it('returns exactly `count` rounds', () => {
    expect(generateRounds(5, () => 0)).toHaveLength(5);
  });

  it('produces strictly increasing targetAt values, each at least MIN_ROUND_SPACING_MS apart', () => {
    const rounds = generateRounds(5, () => 0.5);
    for (let i = 1; i < rounds.length; i += 1) {
      expect(rounds[i].targetAt - rounds[i - 1].targetAt).toBeGreaterThanOrEqual(MIN_ROUND_SPACING_MS);
    }
  });

  it('places the first round at least MIN_ROUND_SPACING_MS after 0', () => {
    const rounds = generateRounds(5, () => 0);
    expect(rounds[0].targetAt).toBeGreaterThanOrEqual(MIN_ROUND_SPACING_MS);
  });

  it('is deterministic for a fixed rng, spacing rounds exactly MIN_ROUND_SPACING_MS apart when rng returns 0', () => {
    const rounds = generateRounds(5, () => 0);
    expect(rounds.map((r) => r.targetAt)).toEqual([600, 1200, 1800, 2400, 3000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/minigame.test.js`
Expected: FAIL — `lib/tamagotchi/minigame.js` does not exist yet.

- [ ] **Step 3: Implement**

Create `lib/tamagotchi/minigame.js`:

```js
// Pure round-generation and scoring math for the palette Play minigame. No
// DOM/React/timers here — those live in MinigameOverlay (pages/tamagotchi),
// which is exercised by manual verification instead of unit tests; this
// file is what the unit tests below cover.
export const ROUND_COUNT = 5;
export const HIT_WINDOW_MS = 400;
export const MIN_ROUND_SPACING_MS = 600;
// Random slack added on top of the minimum spacing, so rounds don't land
// on a perfectly predictable metronome.
const ROUND_JITTER_MS = 400;

export const generateRounds = (count, rng = Math.random) => {
  const rounds = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    cursor += MIN_ROUND_SPACING_MS + rng() * ROUND_JITTER_MS;
    rounds.push({ targetAt: cursor });
  }
  return rounds;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/minigame.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/minigame.js lib/tamagotchi/minigame.test.js
git commit -m "feat(tamagotchi): generate minigame round timings"
```

---

### Task 2: `scoreTap`

**Files:**
- Modify: `lib/tamagotchi/minigame.js`
- Modify: `lib/tamagotchi/minigame.test.js`

**Interfaces:**
- Consumes: `clamp` from `lib/random.js`.
- Produces: `scoreTap(round, tapOffsetMs) => { hit: boolean, accuracy: number }` — `hit` when the tap is within `HIT_WINDOW_MS` of `round.targetAt`; `accuracy` falls off linearly from `1` at a perfect tap to `0` at the window edge, clamped so an even-later tap doesn't go negative. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/minigame.test.js` (add `scoreTap` and `HIT_WINDOW_MS` to the import):

```js
describe('scoreTap', () => {
  it('scores a perfectly-timed tap as a full-accuracy hit', () => {
    const round = { targetAt: 1000 };
    expect(scoreTap(round, 1000)).toEqual({ hit: true, accuracy: 1 });
  });

  it('scores a tap partway into the window with linear falloff', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS / 2);
    expect(result.hit).toBe(true);
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it('scores a tap exactly at the window edge as a hit with zero accuracy', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS);
    expect(result.hit).toBe(true);
    expect(result.accuracy).toBe(0);
  });

  it('scores a tap outside the window as a miss with zero (not negative) accuracy', () => {
    const round = { targetAt: 1000 };
    const result = scoreTap(round, 1000 + HIT_WINDOW_MS * 2);
    expect(result.hit).toBe(false);
    expect(result.accuracy).toBe(0);
  });

  it('scores symmetrically for an early tap', () => {
    const round = { targetAt: 1000 };
    expect(scoreTap(round, 1000 - HIT_WINDOW_MS / 2).accuracy).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/minigame.test.js -t scoreTap`
Expected: FAIL with "scoreTap is not defined".

- [ ] **Step 3: Implement**

Add to `lib/tamagotchi/minigame.js` (add the `clamp` import at the top):

```js
import { clamp } from '../random';
```

```js
export const scoreTap = (round, tapOffsetMs) => {
  const dist = Math.abs(tapOffsetMs - round.targetAt);
  const hit = dist <= HIT_WINDOW_MS;
  const accuracy = clamp(1 - dist / HIT_WINDOW_MS, 0, 1);
  return { hit, accuracy };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/minigame.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/minigame.js lib/tamagotchi/minigame.test.js
git commit -m "feat(tamagotchi): score minigame taps by timing accuracy"
```

---

### Task 3: `computePlayAmount`

**Files:**
- Modify: `lib/tamagotchi/minigame.js`
- Modify: `lib/tamagotchi/minigame.test.js`

**Interfaces:**
- Consumes: `PLAY_AMOUNT` from `lib/tamagotchi/simulation.js` (already exists, the ceiling reward).
- Produces: `MIN_PLAY_AMOUNT = 10` (exported), `computePlayAmount(results) => number`, `results` required to be exactly `ROUND_COUNT` entries (caller's contract — see Global Constraints; this function does not itself guard against a short array). Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `lib/tamagotchi/minigame.test.js` (add `computePlayAmount`, `MIN_PLAY_AMOUNT` to the import, and import `PLAY_AMOUNT` from `./simulation`):

```js
describe('computePlayAmount', () => {
  const perfectResults = Array.from({ length: 5 }, () => ({ hit: true, accuracy: 1 }));
  const missedResults = Array.from({ length: 5 }, () => ({ hit: false, accuracy: 0 }));

  it('returns the full PLAY_AMOUNT for a perfect session', () => {
    expect(computePlayAmount(perfectResults)).toBe(PLAY_AMOUNT);
  });

  it('returns MIN_PLAY_AMOUNT for an all-miss session', () => {
    expect(computePlayAmount(missedResults)).toBe(MIN_PLAY_AMOUNT);
  });

  it('interpolates linearly for a mixed-accuracy session', () => {
    const mixed = [
      { hit: true, accuracy: 1 },
      { hit: true, accuracy: 1 },
      { hit: false, accuracy: 0 },
      { hit: false, accuracy: 0 },
      { hit: true, accuracy: 0.5 },
    ];
    // average accuracy = (1 + 1 + 0 + 0 + 0.5) / 5 = 0.5
    expect(computePlayAmount(mixed)).toBeCloseTo(MIN_PLAY_AMOUNT + (PLAY_AMOUNT - MIN_PLAY_AMOUNT) * 0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tamagotchi/minigame.test.js -t computePlayAmount`
Expected: FAIL with "computePlayAmount is not defined".

- [ ] **Step 3: Implement**

Add to `lib/tamagotchi/minigame.js` (add the import at the top):

```js
import { PLAY_AMOUNT } from './simulation';
```

```js
export const MIN_PLAY_AMOUNT = 10;

// Caller's contract: results must be exactly ROUND_COUNT entries, one per
// round in order — a round the player never tapped is still present as
// { hit: false, accuracy: 0 }, never omitted. This function does not guard
// against a short/empty array; that guarantee lives in MinigameOverlay.
export const computePlayAmount = (results) => {
  const totalAccuracy = results.reduce((sum, result) => sum + result.accuracy, 0);
  const averageAccuracy = totalAccuracy / results.length;
  return MIN_PLAY_AMOUNT + (PLAY_AMOUNT - MIN_PLAY_AMOUNT) * averageAccuracy;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi/minigame.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tamagotchi/minigame.js lib/tamagotchi/minigame.test.js
git commit -m "feat(tamagotchi): compute minigame happiness reward from accuracy"
```

---

### Task 4: `MinigameOverlay`, palette Play rewiring, and page tests

**Files:**
- Modify: `pages/tamagotchi/index.jsx`
- Modify: `pages/tamagotchi/index.module.css`
- Modify: `__tests__/pages/tamagotchi/index.test.jsx`

**Interfaces:**
- Consumes: `generateRounds`, `scoreTap`, `computePlayAmount`, `ROUND_COUNT`, `HIT_WINDOW_MS`, `MIN_PLAY_AMOUNT` (Tasks 1–3); `playWithPet` (already imported in `index.jsx`).
- Produces: no new exports — this wires the minigame into the page. Rewrites the one existing test the spec calls out (`'playing raises happiness'`, currently targeting the palette Play button) to target pet-tap instead, and adds new tests for the overlay. This is the only task in this unit that touches `index.test.jsx`.

- [ ] **Step 1: Write the failing/updated tests**

In `__tests__/pages/tamagotchi/index.test.jsx`:

Add `act` to the RTL import: `import { render, screen, fireEvent, act } from '@testing-library/react';`
Add `MIN_PLAY_AMOUNT` import: `import { MIN_PLAY_AMOUNT } from '../../../lib/tamagotchi/minigame';`

Replace the existing test:

```js
  it('playing raises happiness', () => {
    seedPet({ happiness: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(readPet().happiness).toBeGreaterThan(10);
  });
```

with:

```js
  it('tapping the pet raises happiness', () => {
    seedPet({ happiness: 10 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByTestId('pet'));
    expect(readPet().happiness).toBeGreaterThan(10);
  });

  it('opens the minigame overlay from the palette Play button', () => {
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByTestId('minigame-overlay')).toBeInTheDocument();
  });

  it('completing a minigame session with every round missed still raises happiness by the minimum amount', () => {
    vi.useFakeTimers();
    seedPet({ happiness: 0 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(readPet().happiness).toBe(MIN_PLAY_AMOUNT);
    expect(screen.queryByTestId('minigame-overlay')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('canceling the minigame overlay does not change happiness', () => {
    vi.useFakeTimers();
    seedPet({ happiness: 50 });
    render(<Tamagotchi />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(readPet().happiness).toBe(50);
    expect(screen.queryByTestId('minigame-overlay')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx vitest run __tests__/pages/tamagotchi/index.test.jsx`
Expected: FAIL — the palette Play button still calls `handlePlay` directly (no overlay exists yet), so `getByTestId('minigame-overlay')` and `getByRole('button', { name: 'Cancel' })` don't exist.

- [ ] **Step 3: Add overlay styles**

Append to `pages/tamagotchi/index.module.css`:

```css
.minigameOverlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 1rem;
  color: #eee;
}

.minigameClose {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.1rem;
  cursor: pointer;
}

.minigameTap {
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 6rem;
  height: 6rem;
  font-size: 2.5rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Implement `MinigameOverlay` and rewire the palette Play button**

In `pages/tamagotchi/index.jsx`, add the minigame import:

```js
import {
  generateRounds,
  scoreTap,
  computePlayAmount,
  ROUND_COUNT,
  HIT_WINDOW_MS,
} from '../../lib/tamagotchi/minigame';
```

Add a new component, placed alongside `NeedBar` (same pattern — a local function component in this file):

```jsx
function MinigameOverlay({ onComplete, onCancel }) {
  const [rounds] = useState(() => generateRounds(ROUND_COUNT));
  const [roundIndex, setRoundIndex] = useState(0);
  const resultsRef = useRef([]);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (roundIndex >= ROUND_COUNT) {
      onComplete(resultsRef.current);
      return undefined;
    }
    const round = rounds[roundIndex];
    const msUntilWindowCloses = round.targetAt + HIT_WINDOW_MS - (Date.now() - startRef.current);
    const id = setTimeout(() => {
      resultsRef.current = [...resultsRef.current, { hit: false, accuracy: 0 }];
      setRoundIndex((i) => i + 1);
    }, Math.max(msUntilWindowCloses, 0));
    return () => clearTimeout(id);
  }, [roundIndex, rounds, onComplete]);

  const handleTap = () => {
    if (roundIndex >= ROUND_COUNT) return;
    const tapOffsetMs = Date.now() - startRef.current;
    resultsRef.current = [...resultsRef.current, scoreTap(rounds[roundIndex], tapOffsetMs)];
    setRoundIndex((i) => i + 1);
  };

  return (
    <div
      className={styles.minigameOverlay}
      data-testid="minigame-overlay"
      role="dialog"
      aria-label="Play minigame"
    >
      <button type="button" className={styles.minigameClose} aria-label="Cancel" onClick={onCancel}>
        ✕
      </button>
      <button type="button" className={styles.minigameTap} aria-label="Tap" onClick={handleTap}>
        🎯
      </button>
      <p>{`Round ${Math.min(roundIndex + 1, ROUND_COUNT)} of ${ROUND_COUNT}`}</p>
    </div>
  );
}
MinigameOverlay.propTypes = {
  onComplete: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
```

Inside the `Tamagotchi` component, add state and handlers right after the `commit` callback (before `handleFeed`):

```js
  const [minigameActive, setMinigameActive] = useState(false);
  const handleOpenMinigame = () => setMinigameActive(true);
  const handleMinigameComplete = (results) => {
    setMinigameActive(false);
    commit((prev) => playWithPet(prev, computePlayAmount(results)), 'play');
  };
  const handleMinigameCancel = () => setMinigameActive(false);
```

Change the **palette** Play button's `onClick` (the one inside `.palette`, not the pet-tap button inside `.screen`) from `handlePlay` to `handleOpenMinigame`:

```jsx
        <button type="button" className={styles.action} aria-label="Play" onClick={handleOpenMinigame}>
          🎾
        </button>
```

Render the overlay right after the closing `</div>` of `.screen`, before `.needs`:

```jsx
      {minigameActive && (
        <MinigameOverlay onComplete={handleMinigameComplete} onCancel={handleMinigameCancel} />
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/tamagotchi __tests__/pages/tamagotchi`
Expected: PASS, all tests green — including every other pre-existing test in `index.test.jsx` (Feed, Sleep toggle, poop, sound toggle), all unaffected by this change.

- [ ] **Step 6: Lint**

Run: `npx eslint pages/tamagotchi/index.jsx`
Expected: no errors (check in particular that `MinigameOverlay` is a function declaration, not an arrow function, and has `propTypes`).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open `/tamagotchi`.
- Click the palette Play button (🎾) — confirm the overlay appears over the pet, showing "Round 1 of 5".
- Tap the 🎯 button a few times near when you'd guess each round lands — confirm the round counter advances and the overlay closes after 5 rounds, with happiness increasing.
- Reopen and click ✕ (Cancel) partway through — confirm the overlay closes immediately with no happiness change.
- Confirm the pet-tap (tapping the pet sprite itself) still works instantly with no overlay, for its own smaller reward.

- [ ] **Step 8: Commit**

```bash
git add pages/tamagotchi/index.jsx pages/tamagotchi/index.module.css __tests__/pages/tamagotchi/index.test.jsx
git commit -m "feat(tamagotchi): add timing minigame to the palette Play button"
```

---

## Self-Review Notes

- **Spec coverage:** `ROUND_COUNT`/`HIT_WINDOW_MS`/`MIN_ROUND_SPACING_MS` and `generateRounds` (Task 1), `scoreTap`'s linear-falloff formula (Task 2), `computePlayAmount`'s `MIN_PLAY_AMOUNT`-anchored interpolation and its no-guard contract (Task 3), and the overlay's full-length-results guarantee, cancel-with-no-`playWithPet`-call path, and the rewritten + new page tests (Task 4) all map to the corresponding spec bullets.
- **NaN safety verified structurally, not just asserted:** `MinigameOverlay`'s `useEffect` always appends exactly one result per round — either from `handleTap` (a real tap) or the timeout fallback (`{ hit: false, accuracy: 0 }`) — and only calls `onComplete` once `roundIndex >= ROUND_COUNT`, so `computePlayAmount` never receives a short array in practice, matching the Global Constraints requirement.
- **Type/name consistency check:** `MinigameOverlay`'s props (`onComplete`, `onCancel`) match exactly what `handleMinigameComplete`/`handleMinigameCancel` are named and how they're passed in Task 4's JSX. `computePlayAmount`'s parameter name (`results`) matches what `onComplete` receives and forwards.
- **Conflict boundaries respected:** this plan never touches `lib/tamagotchi/creatures.js`, `lib/tamagotchi/simulation.js`'s `applyElapsed`/`grow()`, or `sound.js`; the pet-tap button's handler (`handlePlay`) and its existing `PET_TAP_AMOUNT` usage are untouched — only the separate palette Play button's `onClick` changes.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-tamagotchi-unit-c-minigame.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
