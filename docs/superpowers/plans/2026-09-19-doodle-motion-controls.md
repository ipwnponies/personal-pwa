# Doodle Motion Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the doodle sandbox three device-motion features — an iOS permission gate, shake-to-scatter, and opt-in tilt gravity.

**Architecture:** Three layers, each testable on its own. Pure math lives in `lib/doodleShapes.js` (`scatterShapes`, velocity clamp, gravity/damping inside `advanceShape`). Event plumbing lives in two small hooks (`lib/useMotionPermission.js`, `lib/useDeviceTilt.js`) plus the existing `lib/useShakeDetection.js`. `components/doodle/DoodleCanvas.jsx` is the only place that threads live tuning state and permission state into those layers, matching the existing pattern documented in `.claude/rules/doodle.md`.

**Tech Stack:** React 18 hooks, Next.js pages router, Vitest + jsdom + React Testing Library, CSS Modules. No new dependencies.

**Spec:** the task description in this session, plus `.claude/rules/doodle.md` (doodle conventions) and `AGENTS.md` (repo conventions). The review findings that shaped this plan are recorded in "Design Decisions" below.

---

## Global Constraints

- **No new dependencies.** Do not touch `package.json` or `package-lock.json`.
- **JavaScript only.** No TypeScript files.
- **Any file containing JSX needs a `.jsx` extension**, including hooks and test files.
- **Tests co-located** next to their source (`lib/foo.js` → `lib/foo.test.js`). Never under `pages/`.
- **`prop-types` on every component**; Airbnb ESLint rules; Prettier formatting.
- **TDD**: failing test first, watch it fail, minimal implementation, watch it pass.
- **Exactly 3 commits, in this order:** permission-gate, shake-to-scatter, tilt-gravity. Tasks 1–2 land in commit 1, tasks 3–7 in commit 2, tasks 8–11 in commit 3. Intermediate tasks run tests but **do not commit**; the last task in each group commits the whole group.
- **Before each commit:** `npm test` and `npm run lint` must both pass.
- **Commit scope is `doodle`** (`type(doodle): description`, Conventional Commits) — see Design Decision 7.
- **rng threading** (`.claude/rules/doodle.md`): any pure function making a random choice takes `rng = Math.random` as a parameter and never calls `Math.random()` directly.
- **Tuning-panel convention** (`.claude/rules/doodle.md`): a constant that shapes physics/particle *feel* is exposed in `TuningPanel.jsx` and persisted under the `doodle-tuning` localStorage key; the owning `lib/` module still exports a `DEFAULT_*` constant and takes the tunable as an optional trailing parameter defaulting to it.
- **Toolbar budget: at most 6 buttons visible at once.** At 48px each with a 0.5rem gap, 7 buttons is 384px and overflows a 375px phone viewport. See Design Decision 3.

---

## Design Decisions

These resolve gaps and risks found reviewing the spec against the current code. An implementer should follow them rather than re-deriving.

**1. Velocity mutation needs a new API — two different ones.** `lib/useDoodleObjects.js` currently exposes `spawnShape`, `startStroke`, `appendStrokePoint`, `moveShape`, `transformShape`, `popShape`, `advance`, `clear`. Nothing writes `vx`/`vy`.
- **Shake (one-shot)** gets a new `applyToShapes(transform)` mutator — one `commit()` per shake.
- **Tilt (every frame)** does **not** use that mutator. `advance()` already rebuilds the array and commits once per rAF tick; a second per-frame commit would double the array rebuild and React setState per frame. Tilt instead threads an acceleration vector through `advance()` into `advanceShape()`.

**2. Tilt needs damping, not just a speed cap.** `advanceShape` bounces perfectly elastically (`vy = -Math.abs(vy)`) with no damping. Constant downward acceleration plus that bounce plus discrete Euler integration gives a jittery, never-settling pile at the bottom edge, and a pile means constant overlap, which feeds `resolveCollisions`'s merge branch and eats the canvas into a few huge shapes. Fix: `advanceShape` gains an optional exponential velocity damping term that is **zero unless tilt is on**. Existing non-tilt play is bit-for-bit unchanged, and tilt gets a settle.

**3. Toolbar button budget.** The toolbar has 5 buttons today (mode, clear, mute, trails, tuning). Adding a permission button and a tilt toggle naively makes 7, which overflows a phone. Instead they are mutually exclusive by state:

| Permission status | Extra buttons | Total |
|---|---|---|
| `unknown` (pre-mount / SSR) | none | 5 |
| `needed` (iOS, not yet asked) | permission | 6 |
| `denied` (iOS, refused) | permission (different label) | 6 |
| `granted` (iOS, allowed) | tilt toggle | 6 |
| `not-needed` (Android/desktop) | tilt toggle | 6 |

**4. Permission status must be resolved in a mount effect, not a lazy `useState` initializer.** The doodle page server-renders. `typeof DeviceMotionEvent` is `undefined` on the server but a function on iOS Safari, so a lazy initializer diverges from server HTML and triggers a hydration mismatch. `useDoodleObjects.js:43-48` documents this exact rule for localStorage. Hence the `unknown` state above.

**5. Extract the permission logic to `lib/useMotionPermission.js`** rather than inlining it in `DoodleCanvas.jsx`. `pages/random/MagicEightBall.jsx:43-51` already hand-rolls the same feature-detect-and-request. A hook is unit-testable and MagicEightBall can adopt it later (**not** in these commits).

**6. Shake impulse and max speed belong in the tuning panel.** `.claude/rules/doodle.md` says any constant shaping physics feel is live-tunable. The spec only called out `tiltStrength`. `shakeImpulse`, `maxSpeed`, `tiltStrength`, and `tiltDamping` all qualify. `maxSpeed` is shared by shake and tilt, so it is introduced in commit 2.

**7. Commit scope is `doodle`.** `AGENTS.md` says to use the `scope:` from the matching `.claude/rules/*.md`. Commits 2 and 3 also touch `lib/` files, which `.claude/rules/doodle.md`'s `paths` do not list even though the rule file documents them. Reading that as "one module plus unowned files", `doodle` is the right scope. **Follow-up, not part of these commits:** widen `.claude/rules/doodle.md`'s `paths` to include `lib/doodle*` and `lib/useDoodle*`.

**8. Landscape orientation is out of scope.** `beta` and `gamma` swap meaning when the screen rotates, so tilt gravity points sideways in landscape. Both are clamped to ±45° (gamma is also numerically unstable near vertical). Document the limitation in a code comment; do not handle it.

**9. `advanceShape` gains a default speed ceiling of 600 px/s.** This is a real behavior change for all play, not just tilt. Nothing in the codebase currently produces a shape faster than ~250 px/s (drift tuning maxes at 100; split children multiply by at most 2.5), so no existing test changes.

**10. Shake plays a fixed C-E-A triad from `NOTES`, not a random one.** Deterministic, no extra rng draws, and `NOTES` is a C-major pentatonic so any subset is consonant.

---

## File Structure

**Created:**
- `lib/useMotionPermission.js` — feature-detects and requests `DeviceMotionEvent`/`DeviceOrientationEvent` permission; owns the permission status machine.
- `lib/useMotionPermission.test.js`
- `lib/useDeviceTilt.js` — `deviceorientation` listener writing into a ref, plus the pure `tiltToAcceleration` mapper and its tuning defaults.
- `lib/useDeviceTilt.test.js`

**Modified:**
- `lib/doodleShapes.js` — add `scatterShapes`, `clampSpeed`, `DEFAULT_SHAKE_IMPULSE`, `DEFAULT_MAX_SPEED`; extend `advanceShape` with optional `accel`/`damping`/`maxSpeed`.
- `lib/doodleShapes.test.js`
- `lib/doodleSound.js` — add a `delay` option to the private `tone` helper and a public `playChord`.
- `lib/doodleSound.test.js`
- `lib/useDoodleObjects.js` — add `applyToShapes`; pass a `physics` object through `advance` to `advanceShape`.
- `lib/useDoodleObjects.test.jsx`
- `components/doodle/TuningPanel.jsx` — 4 new fields + propTypes.
- `components/doodle/TuningPanel.test.jsx`
- `components/doodle/DoodleCanvas.jsx` — permission button, shake wiring, tilt toggle, tilt threading into the rAF loop, 4 new `DEFAULT_TUNING` entries.
- `components/doodle/DoodleCanvas.test.jsx`

**Untouched:** `pages/doodle/index.jsx`, `lib/useShakeDetection.js`, `lib/doodlePhysics.js`, `lib/doodleParticles.js`, `components/doodle/doodle.module.css`, `pages/random/MagicEightBall.jsx`.

---

# Commit 1 — Permission gate

Tasks 1–2. Deliverable: a toolbar button, shown only where `requestPermission` exists, that requests both permissions on tap and tracks the outcome. No visible effect on the canvas yet — shake and tilt arrive in commits 2 and 3.

---

### Task 1: `lib/useMotionPermission.js`

**Files:**
- Create: `lib/useMotionPermission.js`
- Test: `lib/useMotionPermission.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PERMISSION_UNKNOWN = 'unknown'`, `PERMISSION_NEEDED = 'needed'`, `PERMISSION_NOT_NEEDED = 'not-needed'`, `PERMISSION_GRANTED = 'granted'`, `PERMISSION_DENIED = 'denied'` (all `string`)
  - `motionPermissionRequesters(): Array<() => Promise<string>>`
  - `useMotionPermission(): { status: string, request: () => Promise<string>, motionEnabled: boolean }`

- [ ] **Step 1: Write the failing test**

Create `lib/useMotionPermission.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useMotionPermission,
  motionPermissionRequesters,
  PERMISSION_NEEDED,
  PERMISSION_NOT_NEEDED,
  PERMISSION_GRANTED,
  PERMISSION_DENIED,
} from './useMotionPermission';

const stubGates = ({ motion, orientation }) => {
  if (motion) vi.stubGlobal('DeviceMotionEvent', { requestPermission: motion });
  if (orientation) vi.stubGlobal('DeviceOrientationEvent', { requestPermission: orientation });
};

describe('useMotionPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('motionPermissionRequesters finds nothing when neither API gates permission', () => {
    expect(motionPermissionRequesters()).toHaveLength(0);
  });

  it('motionPermissionRequesters finds both gated APIs', () => {
    stubGates({ motion: vi.fn(), orientation: vi.fn() });
    expect(motionPermissionRequesters()).toHaveLength(2);
  });

  it('settles on not-needed when no API gates permission', () => {
    const { result } = renderHook(() => useMotionPermission());
    expect(result.current.status).toBe(PERMISSION_NOT_NEEDED);
    expect(result.current.motionEnabled).toBe(true);
  });

  it('settles on needed when an API gates permission, and motion stays disabled', () => {
    stubGates({ motion: vi.fn().mockResolvedValue('granted') });
    const { result } = renderHook(() => useMotionPermission());
    expect(result.current.status).toBe(PERMISSION_NEEDED);
    expect(result.current.motionEnabled).toBe(false);
  });

  it('request calls every gated API and reports granted when all allow', async () => {
    const motion = vi.fn().mockResolvedValue('granted');
    const orientation = vi.fn().mockResolvedValue('granted');
    stubGates({ motion, orientation });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(motion).toHaveBeenCalledTimes(1);
    expect(orientation).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(PERMISSION_GRANTED);
    expect(result.current.motionEnabled).toBe(true);
  });

  it('reports denied when any gated API refuses', async () => {
    stubGates({
      motion: vi.fn().mockResolvedValue('granted'),
      orientation: vi.fn().mockResolvedValue('denied'),
    });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(result.current.status).toBe(PERMISSION_DENIED);
    expect(result.current.motionEnabled).toBe(false);
  });

  it('reports denied when a gated API throws', async () => {
    stubGates({ motion: vi.fn().mockRejectedValue(new Error('no user gesture')) });
    const { result } = renderHook(() => useMotionPermission());
    await act(async () => { await result.current.request(); });
    expect(result.current.status).toBe(PERMISSION_DENIED);
  });

  it('request is a no-op that reports not-needed when nothing gates permission', async () => {
    const { result } = renderHook(() => useMotionPermission());
    let outcome;
    await act(async () => { outcome = await result.current.request(); });
    expect(outcome).toBe(PERMISSION_NOT_NEEDED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/useMotionPermission.test.js`
Expected: FAIL — `Failed to resolve import "./useMotionPermission"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/useMotionPermission.js`:

```js
import { useCallback, useEffect, useState } from 'react';

// iOS Safari 13+ refuses to deliver devicemotion/deviceorientation events
// until the page calls DeviceMotionEvent.requestPermission() (and the
// orientation equivalent) from inside a user gesture. Android and desktop
// expose no requestPermission at all and deliver both events
// unconditionally, so `typeof ...requestPermission !== 'function'` is the
// "no gate here" signal.
export const PERMISSION_UNKNOWN = 'unknown';
export const PERMISSION_NEEDED = 'needed';
export const PERMISSION_NOT_NEEDED = 'not-needed';
export const PERMISSION_GRANTED = 'granted';
export const PERMISSION_DENIED = 'denied';

const requesterFor = (name) => {
  const Ctor = globalThis[name];
  if (!Ctor || typeof Ctor.requestPermission !== 'function') return null;
  return () => Ctor.requestPermission();
};

// Both APIs are gated independently on iOS. Shake needs devicemotion and
// tilt needs deviceorientation, so ask for whichever of the two actually
// gates — one user tap covers both.
export function motionPermissionRequesters() {
  return [requesterFor('DeviceMotionEvent'), requesterFor('DeviceOrientationEvent')]
    .filter(Boolean);
}

export function useMotionPermission() {
  // Resolved in a mount effect rather than a lazy initializer: the doodle
  // page server-renders, where these globals don't exist, so deciding at
  // first render would diverge from the server HTML and trip a hydration
  // mismatch (same rule as the localStorage read in useDoodleObjects).
  const [status, setStatus] = useState(PERMISSION_UNKNOWN);

  useEffect(() => {
    setStatus(motionPermissionRequesters().length > 0 ? PERMISSION_NEEDED : PERMISSION_NOT_NEEDED);
  }, []);

  const request = useCallback(async () => {
    const requesters = motionPermissionRequesters();
    if (requesters.length === 0) {
      setStatus(PERMISSION_NOT_NEEDED);
      return PERMISSION_NOT_NEEDED;
    }
    let next = PERMISSION_GRANTED;
    try {
      const results = await Promise.all(requesters.map((requestOne) => requestOne()));
      if (results.some((result) => result !== 'granted')) next = PERMISSION_DENIED;
    } catch {
      // Thrown when called outside a user gesture, or on a browser that
      // exposes requestPermission but rejects it — treat as a refusal.
      next = PERMISSION_DENIED;
    }
    setStatus(next);
    return next;
  }, []);

  return {
    status,
    request,
    motionEnabled: status === PERMISSION_GRANTED || status === PERMISSION_NOT_NEEDED,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/useMotionPermission.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Do NOT commit yet** — Task 2 completes commit 1.

---

### Task 2: Permission button in `DoodleCanvas` (completes commit 1)

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx` (imports at the top; toolbar JSX at `DoodleCanvas.jsx:513-560`)
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `useMotionPermission`, `PERMISSION_NEEDED`, `PERMISSION_DENIED` from Task 1.
- Produces: `motionEnabled` (boolean) and `permissionStatus` (string) in `DoodleCanvas` scope, consumed by Task 11's tilt toggle.

- [ ] **Step 1: Write the failing test**

Append to the `describe('DoodleCanvas', ...)` block in `components/doodle/DoodleCanvas.test.jsx`:

```js
  it('shows no motion-permission button when the platform does not gate motion', () => {
    const { queryByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(queryByLabelText('Enable motion controls')).toBeNull();
  });

  it('shows a motion-permission button when the platform gates motion', () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Enable motion controls')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('tapping the motion-permission button requests permission and hides the button', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission });
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission });
    const { getByLabelText, queryByLabelText } = render(
      <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
    );
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(queryByLabelText('Enable motion controls')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('keeps a labelled button visible when motion permission is denied', async () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('denied') });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(getByLabelText('Motion controls blocked')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
```

Note: `vi.stubGlobal` must run **before** `render`, because the hook resolves status in a mount effect.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx -t 'motion-permission'`
Expected: FAIL — `Unable to find a label with the text of: Enable motion controls`.

- [ ] **Step 3: Write minimal implementation**

In `components/doodle/DoodleCanvas.jsx`, add the import beside the other `lib` imports:

```jsx
import {
  useMotionPermission, PERMISSION_NEEDED, PERMISSION_DENIED,
} from '../../lib/useMotionPermission';
```

Inside the component, next to the other state declarations (after the `mode` state around `DoodleCanvas.jsx:97`):

```jsx
  // iOS gates devicemotion/deviceorientation behind a tap; everywhere else
  // `motionEnabled` is true from mount with no button ever shown. Shake
  // (commit 2) and tilt (commit 3) both hang off this.
  const { status: permissionStatus, request: requestMotionPermission, motionEnabled } = useMotionPermission();
```

In the toolbar, before the tuning (⚙️) button:

```jsx
        {(permissionStatus === PERMISSION_NEEDED || permissionStatus === PERMISSION_DENIED) && (
          <button
            type="button"
            className={styles.toolButton}
            aria-label={permissionStatus === PERMISSION_DENIED ? 'Motion controls blocked' : 'Enable motion controls'}
            onClick={requestMotionPermission}
          >
            {permissionStatus === PERMISSION_DENIED ? '🚷' : '📱'}
          </button>
        )}
```

`motionEnabled` is unused until commit 3. Add this comment above the destructure so the lint rule and a reader both see why:

```jsx
  // `motionEnabled` gates the tilt toggle added in the tilt-gravity commit.
```

If ESLint flags `motionEnabled` as unused, keep it — it is a destructured object property, which Airbnb's `no-unused-vars` does not flag by default. Verify in Step 4's lint run rather than pre-emptively working around it.

- [ ] **Step 4: Run the full suite and lint**

Run: `npm test`
Expected: PASS, including the 4 new DoodleCanvas tests and all 8 `useMotionPermission` tests.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/useMotionPermission.js lib/useMotionPermission.test.js \
  components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "$(cat <<'EOF'
feat(doodle): gate device motion behind a permission button

iOS Safari refuses to deliver devicemotion and deviceorientation events
until both APIs' requestPermission() is called from a user gesture, so the
shake and tilt features landing next need a tap to unlock them. Android and
desktop expose no requestPermission, so no button is shown there at all.

Permission status is resolved in a mount effect rather than at first render
because the doodle page server-renders, where the motion globals do not
exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XcvB47URPm7Yj7xpoP4r8k
EOF
)"
```

---

# Commit 2 — Shake to scatter

Tasks 3–7. Deliverable: shaking the device kicks every shape outward from the canvas centre, spawns a burst per shape, and plays a chord.

---

### Task 3: `scatterShapes` and the velocity clamp

**Files:**
- Modify: `lib/doodleShapes.js`
- Test: `lib/doodleShapes.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_SHAKE_IMPULSE = 260` (px/s), `DEFAULT_MAX_SPEED = 600` (px/s)
  - `clampSpeed(vx: number, vy: number, maxSpeed: number): { vx: number, vy: number }`
  - `scatterShapes(shapes: Shape[], centerX: number, centerY: number, rng?: () => number, impulse?: number, maxSpeed?: number): Shape[]`

- [ ] **Step 1: Write the failing test**

Add to the import list at the top of `lib/doodleShapes.test.js`:

```js
  scatterShapes, clampSpeed, DEFAULT_SHAKE_IMPULSE, DEFAULT_MAX_SPEED,
```

Append inside `describe('doodleShapes', ...)`:

```js
  it('clampSpeed leaves a velocity under the ceiling alone', () => {
    expect(clampSpeed(3, 4, 100)).toEqual({ vx: 3, vy: 4 });
  });

  it('clampSpeed scales an over-ceiling velocity down, preserving direction', () => {
    const { vx, vy } = clampSpeed(300, 400, 100); // speed 500
    expect(vx).toBeCloseTo(60);
    expect(vy).toBeCloseTo(80);
  });

  it('clampSpeed leaves a zero velocity alone', () => {
    expect(clampSpeed(0, 0, 100)).toEqual({ vx: 0, vy: 0 });
  });

  it('scatterShapes kicks a shape directly away from the centre', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 600, y: 500, vx: 0, vy: 0,
    };
    // rng draw order per shape: magnitude jitter only (the shape is off-centre,
    // so no fallback angle is drawn). 0.5 -> impulse * (0.5 + 0.5) = impulse.
    const [out] = scatterShapes([shape], 500, 500, seq([0.5]), 260, 600);
    expect(out.vx).toBeCloseTo(260);
    expect(out.vy).toBeCloseTo(0);
  });

  it('scatterShapes adds to existing velocity rather than replacing it', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 400, vx: 0, vy: -40,
    };
    const [out] = scatterShapes([shape], 500, 500, seq([0.5]), 260, 600);
    expect(out.vy).toBeCloseTo(-300);
  });

  it('scatterShapes gives a shape sitting exactly on the centre a random direction', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 500, vx: 0, vy: 0,
    };
    // rng draw order: fallback angle first (0 -> 0 rad), then magnitude jitter.
    const [out] = scatterShapes([shape], 500, 500, seq([0, 0.5]), 260, 600);
    expect(out.vx).toBeCloseTo(260);
    expect(out.vy).toBeCloseTo(0);
  });

  it('scatterShapes clamps the result to maxSpeed', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 600, y: 500, vx: 500, vy: 0,
    };
    const [out] = scatterShapes([shape], 500, 500, seq([0.5]), 260, 600);
    expect(out.vx).toBeCloseTo(600);
  });

  it('scatterShapes preserves every other shape field', () => {
    const shape = {
      id: 'a', kind: 'shape', shapeType: 'star', color: '#fff', size: 40, x: 600, y: 500, vx: 0, vy: 0,
    };
    const [out] = scatterShapes([shape], 500, 500, seq([0.5]));
    expect(out).toMatchObject({
      id: 'a', kind: 'shape', shapeType: 'star', color: '#fff', size: 40, x: 600, y: 500,
    });
  });

  it('scatterShapes defaults impulse and maxSpeed to the exported constants', () => {
    expect(DEFAULT_SHAKE_IMPULSE).toBe(260);
    expect(DEFAULT_MAX_SPEED).toBe(600);
    const shape = {
      id: 'a', kind: 'shape', x: 600, y: 500, vx: 0, vy: 0,
    };
    const [out] = scatterShapes([shape], 500, 500, seq([0.5]));
    expect(out.vx).toBeCloseTo(DEFAULT_SHAKE_IMPULSE);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/doodleShapes.test.js -t scatterShapes`
Expected: FAIL — `scatterShapes is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/doodleShapes.js`, add after the `SPLIT_GRACE_S` declaration:

```js
// Per-shape velocity kick applied by a shake (px/s), before the +/-50%
// jitter below. Tunable — see TuningPanel.jsx.
export const DEFAULT_SHAKE_IMPULSE = 260;
// Hard ceiling on any shape's speed (px/s). Nothing in normal play comes
// near it (drift tops out around 100, split children around 250); it exists
// so a repeated shake, or sustained tilt gravity, can't accelerate a shape
// past the point where it tunnels through a wall in one frame.
export const DEFAULT_MAX_SPEED = 600;
```

Add near the other private helpers (after `driftSpeed`):

```js
// Scales a velocity back to maxSpeed while preserving its direction.
export const clampSpeed = (vx, vy, maxSpeed) => {
  const speed = Math.hypot(vx, vy);
  if (speed === 0 || speed <= maxSpeed) return { vx, vy };
  const scale = maxSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
};
```

Add after `advanceShape`:

```js
// Kicks every shape away from (centerX, centerY) — the whole-canvas reaction
// to a device shake. The impulse ADDS to existing velocity rather than
// replacing it, so a shake feels like a push on shapes already in motion.
//
// rng draw order per shape: a fallback angle first, but only for a shape
// sitting exactly on the centre (which has no outward direction of its own),
// then one magnitude jitter draw. Jitter spans +/-50% of `impulse` so a
// scatter fans out instead of moving every shape at identical speed.
export function scatterShapes(
  shapes,
  centerX,
  centerY,
  rng = Math.random,
  impulse = DEFAULT_SHAKE_IMPULSE,
  maxSpeed = DEFAULT_MAX_SPEED,
) {
  return shapes.map((shape) => {
    const dx = shape.x - centerX;
    const dy = shape.y - centerY;
    const dist = Math.hypot(dx, dy);
    const angle = dist > 0 ? Math.atan2(dy, dx) : rng() * Math.PI * 2;
    const magnitude = impulse * (0.5 + rng());
    const { vx, vy } = clampSpeed(
      shape.vx + Math.cos(angle) * magnitude,
      shape.vy + Math.sin(angle) * magnitude,
      maxSpeed,
    );
    return { ...shape, vx, vy };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/doodleShapes.test.js`
Expected: PASS — the 9 new tests plus every pre-existing `doodleShapes` test (no rng-parity change: `createShape` and `splitShape` are untouched).

- [ ] **Step 5: Do NOT commit yet** — Task 7 completes commit 2.

---

### Task 4: `playChord` in `doodleSound`

**Files:**
- Modify: `lib/doodleSound.js`
- Test: `lib/doodleSound.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createDoodleSound().playChord(freqs: number[]): void`

- [ ] **Step 1: Write the failing test**

Append inside `describe('doodleSound', ...)` in `lib/doodleSound.test.js`:

```js
  it('playChord creates one oscillator per frequency', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.playChord([261.63, 329.63, 440]);
    expect(createOscillator).toHaveBeenCalledTimes(3);
  });

  it('playChord stays silent when muted', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.setMuted(true);
    sound.playChord([261.63, 329.63, 440]);
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('playChord tolerates an empty frequency list', () => {
    const { createOscillator } = installMockAudio();
    const sound = createDoodleSound();
    sound.playChord([]);
    expect(createOscillator).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/doodleSound.test.js -t playChord`
Expected: FAIL — `sound.playChord is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/doodleSound.js`, add a `delay` option to the private `tone` helper. Change its signature and the `now` line:

```js
  const tone = (freq, {
    duration = 0.25, type = 'sine', gain = 0.2, delay = 0,
  } = {}) => {
```

and

```js
      const now = audio.currentTime + delay;
```

Then add to the returned object, after `playPop`:

```js
    // A rolled chord: same envelope as playNote, but each note starts 60ms
    // after the previous one so the notes read as an arpeggio rather than
    // one thick blob. Scheduled on the AudioContext clock rather than with
    // setTimeout, so it stays synchronous and doesn't drift.
    playChord: (freqs) => freqs.forEach((freq, i) => tone(freq, {
      type: 'sine', duration: 0.5, gain: 0.15, delay: i * 0.06,
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/doodleSound.test.js`
Expected: PASS — 3 new tests plus every pre-existing `doodleSound` test (`delay` defaults to 0, so `playNote`/`playStroke`/`playPop` are unchanged).

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 5: `applyToShapes` in `useDoodleObjects`

**Files:**
- Modify: `lib/useDoodleObjects.js`
- Test: `lib/useDoodleObjects.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useDoodleObjects(rng).applyToShapes(transform: (shapes: Shape[]) => Shape[]): void`

- [ ] **Step 1: Write the failing test**

Append inside `describe('useDoodleObjects', ...)` in `lib/useDoodleObjects.test.jsx`:

```js
  it('applyToShapes replaces every shape with the transform result', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.spawnShape(10, 20); });
    act(() => { result.current.spawnShape(30, 40); });
    act(() => {
      result.current.applyToShapes((shapes) => shapes.map((s) => ({ ...s, vx: 999 })));
    });
    expect(result.current.objects.every((o) => o.vx === 999)).toBe(true);
  });

  it('applyToShapes leaves strokes untouched and keeps array order', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let strokeId;
    act(() => { strokeId = result.current.startStroke(0, 0); });
    act(() => { result.current.spawnShape(10, 20); });
    act(() => {
      result.current.applyToShapes((shapes) => shapes.map((s) => ({ ...s, vx: 999 })));
    });
    expect(result.current.objects[0].id).toBe(strokeId);
    expect(result.current.objects[0].kind).toBe('stroke');
    expect(result.current.objects[0].vx).toBeUndefined();
    expect(result.current.objects[1].vx).toBe(999);
  });

  it('applyToShapes is a no-op when there are no shapes', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    act(() => { result.current.startStroke(0, 0); });
    const before = result.current.objects;
    const transform = vi.fn();
    act(() => { result.current.applyToShapes(transform); });
    expect(transform).not.toHaveBeenCalled();
    expect(result.current.objects).toBe(before);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/useDoodleObjects.test.jsx -t applyToShapes`
Expected: FAIL — `result.current.applyToShapes is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/useDoodleObjects.js`, add after `popShape`:

```js
  // Hands every shape (never strokes) to `transform` and writes the result
  // back by id, preserving the array's original interleave. This is the
  // whole-canvas velocity hook — one commit per call, for one-shot effects
  // like a shake scatter. Per-frame forces do NOT belong here: `advance`
  // already rebuilds and commits the array once per tick, so they go through
  // its `physics` argument instead.
  const applyToShapes = useCallback((transform) => {
    const prev = objectsRef.current;
    const shapes = prev.filter((o) => o.kind === 'shape');
    if (shapes.length === 0) return;
    const byId = new Map(transform(shapes).map((s) => [s.id, s]));
    commit(prev.map((o) => byId.get(o.id) || o));
  }, [commit]);
```

Add `applyToShapes` to the returned object, after `popShape`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/useDoodleObjects.test.jsx`
Expected: PASS — 3 new tests plus every pre-existing test.

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 6: `shakeImpulse` and `maxSpeed` tuning fields

**Files:**
- Modify: `components/doodle/TuningPanel.jsx`
- Modify: `components/doodle/DoodleCanvas.jsx` (`DEFAULT_TUNING` at `DoodleCanvas.jsx:52-58`)
- Test: `components/doodle/TuningPanel.test.jsx`

**Interfaces:**
- Consumes: `DEFAULT_SHAKE_IMPULSE`, `DEFAULT_MAX_SPEED` from Task 3.
- Produces: `tuning.shakeImpulse` and `tuning.maxSpeed` (both `number`) available in `DoodleCanvas`.

- [ ] **Step 1: Write the failing test**

In `components/doodle/TuningPanel.test.jsx`, extend `baseTuning`:

```js
const baseTuning = {
  maxParticles: 150,
  dustMaxAge: 0.3,
  dustFrameInterval: 3,
  driftMin: 18,
  driftMax: 18,
  shakeImpulse: 260,
  maxSpeed: 600,
};
```

Append inside `describe('TuningPanel', ...)`:

```js
  it('renders the shake tuning fields', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Shake impulse (px/s)').value).toBe('260');
    expect(getByLabelText('Max shape speed (px/s)').value).toBe('600');
  });

  it('calls onChange for the shake impulse field', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Shake impulse (px/s)'), { target: { value: '400' } });
    expect(onChange).toHaveBeenCalledWith('shakeImpulse', 400);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Shake impulse (px/s)`.

- [ ] **Step 3: Write minimal implementation**

In `components/doodle/TuningPanel.jsx`, append to `FIELDS`:

```js
  {
    key: 'shakeImpulse', label: 'Shake impulse (px/s)', min: 0, max: 1000, step: 10,
  },
  {
    key: 'maxSpeed', label: 'Max shape speed (px/s)', min: 50, max: 2000, step: 50,
  },
```

Append to `TuningPanel.propTypes.tuning`:

```js
    shakeImpulse: PropTypes.number.isRequired,
    maxSpeed: PropTypes.number.isRequired,
```

In `components/doodle/DoodleCanvas.jsx`, extend the `doodleShapes` import:

```jsx
import {
  MIN_SIZE, MAX_SIZE, NOTES, scatterShapes, DEFAULT_SHAKE_IMPULSE, DEFAULT_MAX_SPEED,
} from '../../lib/doodleShapes';
```

and extend `DEFAULT_TUNING`:

```js
  shakeImpulse: DEFAULT_SHAKE_IMPULSE,
  maxSpeed: DEFAULT_MAX_SPEED,
```

(`NOTES` and `scatterShapes` are used in Task 7; importing them now keeps this one import edit. If lint flags them as unused at this point, complete Task 7 before running lint.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 7: Wire shake into `DoodleCanvas` (completes commit 2)

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `scatterShapes` (Task 3), `playChord` (Task 4), `applyToShapes` (Task 5), `tuning.shakeImpulse`/`tuning.maxSpeed` (Task 6), `useShakeDetection` (existing).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add this helper next to `mockSound` at the top of `components/doodle/DoodleCanvas.test.jsx`, and add `playChord: vi.fn(),` to the `mockSound` factory:

```js
const dispatchShake = () => {
  const quiet = new Event('devicemotion');
  quiet.accelerationIncludingGravity = { x: 0, y: 0, z: 0 };
  window.dispatchEvent(quiet);
  const jolt = new Event('devicemotion');
  jolt.accelerationIncludingGravity = { x: 0, y: 0, z: 40 };
  window.dispatchEvent(jolt);
};
```

Append inside `describe('DoodleCanvas', ...)`:

```js
  it('a shake plays a chord and spawns a burst per shape', () => {
    const sound = mockSound();
    const { container } = render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(shapeGroups(container)).toHaveLength(1);

    act(() => dispatchShake());

    expect(sound.playChord).toHaveBeenCalledTimes(1);
    // spawnBurst emits 8 'burst' particles, each rendered as an svg <line>.
    expect(container.querySelectorAll('svg line')).toHaveLength(8);
    // The shape survives a shake — it is pushed, not popped.
    expect(shapeGroups(container)).toHaveLength(1);
  });

  it('a shake on an empty canvas plays nothing', () => {
    const sound = mockSound();
    render(<DoodleCanvas rng={seq([0.3])} sound={sound} />);
    act(() => dispatchShake());
    expect(sound.playChord).not.toHaveBeenCalled();
  });

  it('a shake leaves strokes alone', () => {
    const { container, getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Switch to draw mode'));
    const svg = stage(container);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(strokes(container)).toHaveLength(1);
    act(() => dispatchShake());
    expect(strokes(container)).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx -t shake`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Write minimal implementation**

In `components/doodle/DoodleCanvas.jsx`, add the import:

```jsx
import { useShakeDetection } from '../../lib/useShakeDetection';
```

Add `useCallback` to the React import. Add `applyToShapes` to the `useDoodleObjects` destructure at `DoodleCanvas.jsx:60-62`.

Add near the other module-level constants:

```js
// A fixed C-E-A triad drawn from the pentatonic NOTES scale. Fixed rather
// than randomized so a shake always sounds like the same event, and
// consonant with whatever notes the shapes themselves are carrying.
const SHAKE_CHORD = [NOTES[0], NOTES[2], NOTES[4]];
```

Add after `handleShapeTap`:

```jsx
  // A shake pushes every shape outward from the centre of the stage, sprays
  // a burst from each, and rolls a chord. Shapes are pushed, never popped —
  // a shake should feel like a big gust, not a reset.
  const handleShake = useCallback(() => {
    const shapes = objectsRef.current.filter((o) => o.kind === 'shape');
    if (shapes.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const centerX = (rect?.width || 0) / 2;
    const centerY = (rect?.height || 0) / 2;
    const { shakeImpulse, maxSpeed } = tuningRef.current;
    const burst = [];
    shapes.forEach((shape) => {
      burst.push(...spawnBurst(shape.x, shape.y, shape.color, null, COLLISION_BURST_MAX_AGE));
    });
    addParticles(burst);
    applyToShapes((current) => scatterShapes(current, centerX, centerY, rng, shakeImpulse, maxSpeed));
    soundRef.current.playChord(SHAKE_CHORD);
  }, [applyToShapes, rng]);

  useShakeDetection(handleShake);
```

Add `playChord` to the `sound` propType shape:

```jsx
    playChord: PropTypes.func.isRequired,
```

- [ ] **Step 4: Run the full suite and lint**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: no errors.

If `npm test` reports a PropTypes warning about a missing `playChord`, a `mockSound` call site was missed — `mockSound` is the single factory at the top of `DoodleCanvas.test.jsx`, so fix it there.

- [ ] **Step 5: Commit**

```bash
git add lib/doodleShapes.js lib/doodleShapes.test.js \
  lib/doodleSound.js lib/doodleSound.test.js \
  lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx \
  components/doodle/TuningPanel.jsx components/doodle/TuningPanel.test.jsx \
  components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "$(cat <<'EOF'
feat(doodle): scatter shapes on a device shake

Shaking the device now kicks every shape outward from the centre of the
stage, sprays a burst from each, and rolls a chord. Shapes are pushed rather
than popped, so a shake reads as a gust rather than a reset.

The scatter impulse adds to existing velocity and is jittered per shape so
the canvas fans out instead of moving as a block. A new global speed ceiling
keeps a repeated shake from accelerating a shape far enough to tunnel
through a wall in one frame; both values are live-tunable.

Whole-canvas velocity changes go through a new applyToShapes mutator, which
commits once per call. Per-frame forces deliberately do not use it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XcvB47URPm7Yj7xpoP4r8k
EOF
)"
```

---

# Commit 3 — Tilt gravity

Tasks 8–11. Deliverable: an opt-in toolbar toggle (default off, shown only once motion is permitted) that turns device tilt into a gravity vector applied to every shape each frame.

---

### Task 8: `lib/useDeviceTilt.js`

**Files:**
- Create: `lib/useDeviceTilt.js`
- Test: `lib/useDeviceTilt.test.js`

**Interfaces:**
- Consumes: `clamp` from `lib/random.js`.
- Produces:
  - `TILT_MAX_DEGREES = 45`, `DEFAULT_TILT_STRENGTH = 400` (px/s²), `DEFAULT_TILT_DAMPING = 1.2` (1/s)
  - `tiltToAcceleration(beta: number, gamma: number, strength?: number): { x: number, y: number }`
  - `useDeviceTilt(enabled: boolean): React.MutableRefObject<{ beta: number, gamma: number }>`

- [ ] **Step 1: Write the failing test**

Create `lib/useDeviceTilt.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDeviceTilt, tiltToAcceleration, TILT_MAX_DEGREES, DEFAULT_TILT_STRENGTH,
} from './useDeviceTilt';

function dispatchOrientation(beta, gamma) {
  const event = new Event('deviceorientation');
  event.beta = beta;
  event.gamma = gamma;
  window.dispatchEvent(event);
}

describe('tiltToAcceleration', () => {
  it('maps a level device to no acceleration', () => {
    expect(tiltToAcceleration(0, 0, 400)).toEqual({ x: 0, y: 0 });
  });

  it('maps full front tilt to full downward acceleration', () => {
    expect(tiltToAcceleration(TILT_MAX_DEGREES, 0, 400)).toEqual({ x: 0, y: 400 });
  });

  it('maps full back tilt to full upward acceleration', () => {
    expect(tiltToAcceleration(-TILT_MAX_DEGREES, 0, 400)).toEqual({ x: 0, y: -400 });
  });

  it('maps full right tilt to full rightward acceleration', () => {
    expect(tiltToAcceleration(0, TILT_MAX_DEGREES, 400)).toEqual({ x: 400, y: 0 });
  });

  it('clamps beyond the tilt ceiling instead of scaling past full strength', () => {
    expect(tiltToAcceleration(170, 0, 400)).toEqual({ x: 0, y: 400 });
  });

  it('scales linearly inside the tilt range', () => {
    const { y } = tiltToAcceleration(TILT_MAX_DEGREES / 2, 0, 400);
    expect(y).toBeCloseTo(200);
  });

  it('defaults strength to DEFAULT_TILT_STRENGTH', () => {
    expect(tiltToAcceleration(TILT_MAX_DEGREES, 0)).toEqual({ x: 0, y: DEFAULT_TILT_STRENGTH });
  });

  it('returns no acceleration for non-numeric readings', () => {
    expect(tiltToAcceleration(null, null, 400)).toEqual({ x: 0, y: 0 });
    expect(tiltToAcceleration(NaN, 0, 400)).toEqual({ x: 0, y: 0 });
  });
});

describe('useDeviceTilt', () => {
  it('records the latest orientation while enabled', () => {
    const { result } = renderHook(() => useDeviceTilt(true));
    dispatchOrientation(20, -10);
    expect(result.current.current).toEqual({ beta: 20, gamma: -10 });
  });

  it('ignores orientation events while disabled', () => {
    const { result } = renderHook(() => useDeviceTilt(false));
    dispatchOrientation(20, -10);
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });

  it('resets to level when disabled, so gravity stops immediately', () => {
    const { result, rerender } = renderHook(({ on }) => useDeviceTilt(on), {
      initialProps: { on: true },
    });
    dispatchOrientation(30, 30);
    expect(result.current.current.beta).toBe(30);
    rerender({ on: false });
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });

  it('treats a null reading as level', () => {
    const { result } = renderHook(() => useDeviceTilt(true));
    dispatchOrientation(null, null);
    expect(result.current.current).toEqual({ beta: 0, gamma: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/useDeviceTilt.test.js`
Expected: FAIL — `Failed to resolve import "./useDeviceTilt"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/useDeviceTilt.js`:

```js
import { useEffect, useRef } from 'react';
import { clamp } from './random';

// deviceorientation reports beta (front-back tilt, -180..180 degrees) and
// gamma (left-right tilt, -90..90 degrees). Only a modest tilt should be
// needed to move a shape, and gamma becomes numerically unstable as the
// device approaches vertical, so both are clamped before mapping.
export const TILT_MAX_DEGREES = 45;
// Acceleration applied at full clamped tilt (px/s^2). Tunable — see
// TuningPanel.jsx.
export const DEFAULT_TILT_STRENGTH = 400;
// Exponential velocity decay rate (1/s) applied only while tilt is on.
// Without it, a constant acceleration against the perfectly elastic wall
// bounce in advanceShape never settles — shapes buzz along the low edge
// forever and, being permanently overlapped, get eaten by the merge path
// in resolveCollisions.
export const DEFAULT_TILT_DAMPING = 1.2;

// Landscape is deliberately not handled: beta and gamma swap meaning when
// the screen rotates, so gravity points sideways there. The doodle stage is
// a portrait play surface, and a toddler-facing toggle is not worth an
// orientation matrix.
export function tiltToAcceleration(beta, gamma, strength = DEFAULT_TILT_STRENGTH) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { x: 0, y: 0 };
  const scale = (degrees) => (clamp(degrees, -TILT_MAX_DEGREES, TILT_MAX_DEGREES) / TILT_MAX_DEGREES)
    * strength;
  return { x: scale(gamma), y: scale(beta) };
}

// Returns a ref holding the latest raw reading rather than firing a callback
// per event: deviceorientation fires at roughly display rate, and the only
// consumer is the rAF loop, which wants whatever the current tilt is at the
// moment it ticks. Mapping to an acceleration is left to the caller so it
// can apply live tuning without re-subscribing.
// eslint-disable-next-line import/prefer-default-export
export function useDeviceTilt(enabled) {
  const orientationRef = useRef({ beta: 0, gamma: 0 });

  useEffect(() => {
    if (!enabled) {
      // Snap back to level on disable so an in-flight tilt doesn't keep
      // pulling shapes after the toggle is switched off.
      orientationRef.current = { beta: 0, gamma: 0 };
      return undefined;
    }
    const handleOrientation = (event) => {
      orientationRef.current = {
        beta: Number.isFinite(event.beta) ? event.beta : 0,
        gamma: Number.isFinite(event.gamma) ? event.gamma : 0,
      };
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [enabled]);

  return orientationRef;
}
```

The `eslint-disable-next-line import/prefer-default-export` comment above `useDeviceTilt` may be unnecessary since the file has multiple named exports. Remove it if `npm run lint` passes without it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/useDeviceTilt.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 9: Gravity and damping in `advanceShape` / `advance`

**Files:**
- Modify: `lib/doodleShapes.js` (`advanceShape` at `doodleShapes.js:172-188`)
- Modify: `lib/useDoodleObjects.js` (`advance` at `useDoodleObjects.js:135-183`)
- Test: `lib/doodleShapes.test.js`, `lib/useDoodleObjects.test.jsx`

**Interfaces:**
- Consumes: `clampSpeed`, `DEFAULT_MAX_SPEED` from Task 3.
- Produces:
  - `advanceShape(shape, dtSeconds, bounds, accel?: {x,y}, damping?: number, maxSpeed?: number): Shape` — `accel` defaults to `{x:0,y:0}`, `damping` to `0`, `maxSpeed` to `DEFAULT_MAX_SPEED`.
  - `advance(dtSeconds, bounds, grabbedIds, physics?: { accel?, damping?, maxSpeed? })`

- [ ] **Step 1: Write the failing test**

Append inside `describe('doodleShapes', ...)` in `lib/doodleShapes.test.js`:

```js
  it('advanceShape with no acceleration or damping is unchanged', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 500, vx: 100, vy: 0, size: 40,
    };
    const out = advanceShape(shape, 0.1, { width: 1000, height: 1000 });
    expect(out.vx).toBe(100);
    expect(out.x).toBeCloseTo(510);
  });

  it('advanceShape applies acceleration to velocity before moving', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 500, vx: 0, vy: 0, size: 40,
    };
    const out = advanceShape(shape, 0.1, { width: 1000, height: 1000 }, { x: 0, y: 100 });
    expect(out.vy).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(501);
  });

  it('advanceShape damps velocity exponentially', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 500, vx: 100, vy: 0, size: 40,
    };
    const out = advanceShape(shape, 1, { width: 1000, height: 1000 }, { x: 0, y: 0 }, 1);
    expect(out.vx).toBeCloseTo(100 * Math.exp(-1));
  });

  it('advanceShape clamps velocity to maxSpeed', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 500, y: 500, vx: 0, vy: 0, size: 40,
    };
    const out = advanceShape(shape, 1, { width: 1000, height: 1000 }, { x: 5000, y: 0 }, 0, 600);
    expect(out.vx).toBeCloseTo(600);
  });

  it('advanceShape still bounces off a wall with acceleration applied', () => {
    const shape = {
      id: 'a', kind: 'shape', x: 980, y: 500, vx: 100, vy: 0, size: 40,
    };
    const out = advanceShape(shape, 1, { width: 1000, height: 1000 }, { x: 100, y: 0 });
    expect(out.x).toBe(980);
    expect(out.vx).toBeLessThan(0);
  });
```

Append inside `describe('useDoodleObjects', ...)` in `lib/useDoodleObjects.test.jsx`:

```js
  it('advance threads a gravity vector through to every shape', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(500, 500); });
    const before = result.current.objects.find((o) => o.id === shape.id).vy;
    act(() => {
      result.current.advance(0.1, { width: 1000, height: 1000 }, new Set(), {
        accel: { x: 0, y: 1000 },
      });
    });
    const after = result.current.objects.find((o) => o.id === shape.id).vy;
    expect(after - before).toBeCloseTo(100);
  });

  it('advance with no physics argument leaves velocity untouched', () => {
    const { result } = renderHook(() => useDoodleObjects(seq([0.2])));
    let shape;
    act(() => { shape = result.current.spawnShape(500, 500); });
    const before = result.current.objects.find((o) => o.id === shape.id).vy;
    act(() => {
      result.current.advance(0.1, { width: 1000, height: 1000 }, new Set());
    });
    const after = result.current.objects.find((o) => o.id === shape.id).vy;
    expect(after).toBeCloseTo(before);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/doodleShapes.test.js lib/useDoodleObjects.test.jsx -t 'acceleration'`
Expected: FAIL — `expected +0 to be close to 10`.

- [ ] **Step 3: Write minimal implementation**

In `lib/doodleShapes.js`, add near the other constants:

```js
// Shared no-acceleration default so advanceShape's default path allocates
// nothing per shape per frame.
const NO_ACCEL = { x: 0, y: 0 };
```

Replace `advanceShape`'s signature and velocity block. The full function becomes:

```js
// `accel` (px/s^2), `damping` (exponential decay rate, 1/s) and `maxSpeed`
// (px/s) all default to no-ops, so ordinary drift behaves exactly as it did
// before tilt gravity existed. DoodleCanvas passes real values only while
// the tilt toggle is on.
export function advanceShape(
  shape,
  dtSeconds,
  bounds,
  accel = NO_ACCEL,
  damping = 0,
  maxSpeed = DEFAULT_MAX_SPEED,
) {
  const r = shape.size / 2;
  let { x, y, vx, vy } = shape;
  if (damping > 0) {
    const decay = Math.exp(-damping * dtSeconds);
    vx *= decay;
    vy *= decay;
  }
  vx += accel.x * dtSeconds;
  vy += accel.y * dtSeconds;
  ({ vx, vy } = clampSpeed(vx, vy, maxSpeed));
  x += vx * dtSeconds;
  y += vy * dtSeconds;
  if (x - r < 0) {
    x = r;
    vx = Math.abs(vx);
  } else if (x + r > bounds.width) {
    x = bounds.width - r;
    vx = -Math.abs(vx);
  }
  if (y - r < 0) {
    y = r;
    vy = Math.abs(vy);
  } else if (y + r > bounds.height) {
    y = bounds.height - r;
    vy = -Math.abs(vy);
  }
  const next = {
    ...shape, x, y, vx, vy,
  };
  if (shape.splitGraceRemaining > 0) {
    const remaining = shape.splitGraceRemaining - dtSeconds;
    if (remaining > 0) next.splitGraceRemaining = remaining;
    else delete next.splitGraceRemaining;
  }
  return next;
}
```

In `lib/useDoodleObjects.js`, change `advance`'s signature and its `advanceShape` call:

```js
  // `physics` carries the per-frame forces DoodleCanvas is currently
  // applying (tilt gravity and its damping). Omitted or empty means plain
  // drift, byte-for-byte as before.
  const advance = useCallback((dtSeconds, bounds, grabbedIds, physics = {}) => {
```

and

```js
    const drifted = prev.map((o) => (
      o.kind === 'shape' && !grabbedIds?.has(o.id)
        ? advanceShape(o, dtSeconds, bounds, physics.accel, physics.damping, physics.maxSpeed)
        : o
    ));
```

Passing `undefined` for any of the three still triggers the JS default parameter, so `advance(dt, bounds, grabbed)` behaves exactly as before.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/doodleShapes.test.js lib/useDoodleObjects.test.jsx`
Expected: PASS — 7 new tests plus every pre-existing test in both files. No existing shape exceeds 600 px/s (drift tops out at 100, split children at ~250), so the new default clamp changes nothing.

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 10: `tiltStrength` and `tiltDamping` tuning fields

**Files:**
- Modify: `components/doodle/TuningPanel.jsx`
- Modify: `components/doodle/DoodleCanvas.jsx` (`DEFAULT_TUNING`)
- Test: `components/doodle/TuningPanel.test.jsx`

**Interfaces:**
- Consumes: `DEFAULT_TILT_STRENGTH`, `DEFAULT_TILT_DAMPING` from Task 8.
- Produces: `tuning.tiltStrength`, `tuning.tiltDamping` (both `number`).

- [ ] **Step 1: Write the failing test**

In `components/doodle/TuningPanel.test.jsx`, extend `baseTuning` with `tiltStrength: 400, tiltDamping: 1.2,` and append:

```js
  it('renders the tilt tuning fields', () => {
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={() => {}} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('Tilt strength (px/s²)').value).toBe('400');
    expect(getByLabelText('Tilt damping (1/s)').value).toBe('1.2');
  });

  it('calls onChange for the tilt strength field', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TuningPanel tuning={baseTuning} onChange={onChange} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(getByLabelText('Tilt strength (px/s²)'), { target: { value: '800' } });
    expect(onChange).toHaveBeenCalledWith('tiltStrength', 800);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: FAIL — `Unable to find a label with the text of: Tilt strength (px/s²)`.

- [ ] **Step 3: Write minimal implementation**

In `components/doodle/TuningPanel.jsx`, append to `FIELDS`:

```js
  {
    key: 'tiltStrength', label: 'Tilt strength (px/s²)', min: 0, max: 2000, step: 50,
  },
  {
    key: 'tiltDamping', label: 'Tilt damping (1/s)', min: 0, max: 5, step: 0.1,
  },
```

Append to `TuningPanel.propTypes.tuning`:

```js
    tiltStrength: PropTypes.number.isRequired,
    tiltDamping: PropTypes.number.isRequired,
```

In `components/doodle/DoodleCanvas.jsx`, add the import:

```jsx
import {
  useDeviceTilt, tiltToAcceleration, DEFAULT_TILT_STRENGTH, DEFAULT_TILT_DAMPING,
} from '../../lib/useDeviceTilt';
```

and extend `DEFAULT_TUNING`:

```js
  tiltStrength: DEFAULT_TILT_STRENGTH,
  tiltDamping: DEFAULT_TILT_DAMPING,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/doodle/TuningPanel.test.jsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Do NOT commit yet.**

---

### Task 11: Tilt toggle and rAF wiring (completes commit 3)

**Files:**
- Modify: `components/doodle/DoodleCanvas.jsx`
- Test: `components/doodle/DoodleCanvas.test.jsx`

**Interfaces:**
- Consumes: `useDeviceTilt`, `tiltToAcceleration` (Task 8), `advance(..., physics)` (Task 9), `tuning.tiltStrength`/`tuning.tiltDamping` (Task 10), `motionEnabled` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append inside `describe('DoodleCanvas', ...)` in `components/doodle/DoodleCanvas.test.jsx`:

```js
  it('shows the tilt toggle, off by default, when motion needs no permission', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Enable tilt gravity')).toBeInTheDocument();
  });

  it('hides the tilt toggle until motion permission is granted', () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    const { queryByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(queryByLabelText('Enable tilt gravity')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the tilt toggle once motion permission is granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission });
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    await act(async () => {
      fireEvent.click(getByLabelText('Enable motion controls'));
    });
    expect(getByLabelText('Enable tilt gravity')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('toggling tilt flips the label and persists the preference', () => {
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    fireEvent.click(getByLabelText('Enable tilt gravity'));
    expect(getByLabelText('Disable tilt gravity')).toBeInTheDocument();
    expect(localStorage.getItem('doodle-tilt')).toBe('true');
  });

  it('restores a stored tilt preference on mount', () => {
    localStorage.setItem('doodle-tilt', 'true');
    const { getByLabelText } = render(<DoodleCanvas rng={seq([0.3])} sound={mockSound()} />);
    expect(getByLabelText('Disable tilt gravity')).toBeInTheDocument();
  });

  it('tilt gravity pulls a shape further down than plain drift over the same frame', () => {
    // Shape.jsx renders transform="translate(x y) rotate(r)" — space
    // separated, no comma.
    const shapeY = (container) => Number(
      shapeGroups(container)[0].getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/)[2],
    );

    // Same rng seed and same frame both times, so the only difference is
    // gravity. Asserting "y went up" on a single run would pass on the
    // shape's own downward drift alone.
    const runFrame = (tiltOn) => {
      localStorage.clear(); // don't hydrate the previous run's shape or toggle
      const { cbs, rectSpy, nowSpy } = driveOneFrame(); // must precede render
      const { container, getByLabelText, unmount } = render(
        <DoodleCanvas rng={seq([0.3])} sound={mockSound()} />,
      );
      const svg = stage(container);
      fireEvent.pointerDown(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      fireEvent.pointerUp(svg, { clientX: 500, clientY: 500, pointerId: 1 });
      if (tiltOn) {
        fireEvent.click(getByLabelText('Enable tilt gravity'));
        act(() => {
          const event = new Event('deviceorientation');
          event.beta = 45;
          event.gamma = 0;
          window.dispatchEvent(event);
        });
      }
      act(() => { cbs[cbs.length - 1](500); });
      const y = shapeY(container);
      unmount();
      rectSpy.mockRestore();
      nowSpy.mockRestore();
      return y;
    };

    expect(runFrame(true)).toBeGreaterThan(runFrame(false));
  });
```

Two mechanics this test depends on, both verified against the current code: `driveOneFrame()` stubs `requestAnimationFrame` and so **must be called before `render`** (the mount effect schedules the first frame), and `Shape.jsx:35` renders `translate(${shape.x} ${shape.y})` with a space, not a comma.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/doodle/DoodleCanvas.test.jsx -t tilt`
Expected: FAIL — `Unable to find a label with the text of: Enable tilt gravity`.

- [ ] **Step 3: Write minimal implementation**

In `components/doodle/DoodleCanvas.jsx`:

Add the storage key beside the others:

```js
const TILT_KEY = 'doodle-tilt';
```

Add state beside `trailsEnabled`:

```jsx
  // Default off: tilt fights the drawing and pinching gestures (those want a
  // flat, steady device), so it is opt-in rather than forced on everyone.
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const tiltEnabledRef = useRef(tiltEnabled);
  tiltEnabledRef.current = tiltEnabled;
```

Add the load/persist effects beside the trails ones:

```jsx
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TILT_KEY);
      if (stored !== null) setTiltEnabled(stored === 'true');
    } catch {
      // ignore — default to disabled
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TILT_KEY, String(tiltEnabled));
    } catch {
      // ignore — preference just won't persist
    }
  }, [tiltEnabled]);
```

Subscribe to orientation only when the toggle is on **and** motion is permitted:

```jsx
  const tiltActive = tiltEnabled && motionEnabled;
  const orientationRef = useDeviceTilt(tiltActive);
  const tiltActiveRef = useRef(tiltActive);
  tiltActiveRef.current = tiltActive;
```

In the rAF `tick`, replace the `advance` call:

```jsx
        const { beta, gamma } = orientationRef.current;
        const tiltOn = tiltActiveRef.current;
        const events = advance(dt, { width: rect.width, height: rect.height }, grabbedIds, {
          accel: tiltOn ? tiltToAcceleration(beta, gamma, tuningRef.current.tiltStrength) : undefined,
          damping: tiltOn ? tuningRef.current.tiltDamping : 0,
          maxSpeed: tuningRef.current.maxSpeed,
        });
```

Add the toolbar button, immediately after the trails button:

```jsx
        {motionEnabled && (
          <button
            type="button"
            className={styles.toolButton}
            aria-label={tiltEnabled ? 'Disable tilt gravity' : 'Enable tilt gravity'}
            onClick={() => setTiltEnabled((t) => !t)}
          >
            {tiltEnabled ? '🌍' : '🌑'}
          </button>
        )}
```

Remove the placeholder comment added in Task 2's Step 3 (`// \`motionEnabled\` gates the tilt toggle...`) — it is now true rather than pending.

- [ ] **Step 4: Run the full suite and lint**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual sanity check**

Run: `npm run dev`, open `http://localhost:8080/doodle` on a phone on the same network (or with desktop devtools' sensor emulation), spawn several shapes, enable tilt, and tilt the device.
Expected: shapes accelerate toward the low edge and come to rest there rather than buzzing. If they buzz, raise `tiltDamping` in the tuning panel until they settle and update `DEFAULT_TILT_DAMPING` to the value that felt right. Record whatever value you land on in the commit body.

- [ ] **Step 6: Commit**

```bash
git add lib/useDeviceTilt.js lib/useDeviceTilt.test.js \
  lib/doodleShapes.js lib/doodleShapes.test.js \
  lib/useDoodleObjects.js lib/useDoodleObjects.test.jsx \
  components/doodle/TuningPanel.jsx components/doodle/TuningPanel.test.jsx \
  components/doodle/DoodleCanvas.jsx components/doodle/DoodleCanvas.test.jsx
git commit -m "$(cat <<'EOF'
feat(doodle): add opt-in tilt gravity

Tilting the device now pulls every shape toward the low edge. The toggle
defaults to off and only appears once device motion is permitted: tilt wants
an angled device while drawing and pinching want a flat, steady one, so
forcing it on would make the existing gestures worse for everyone.

Gravity is threaded through advance() into advanceShape rather than applied
by a separate per-frame mutator, so a tick still rebuilds and commits the
object array exactly once.

advanceShape's wall bounce is perfectly elastic, which under constant
acceleration never settles — shapes buzz along the low edge and, being
permanently overlapped, get eaten by the merge path. A damping term applied
only while tilt is on gives them a rest state and leaves ordinary drift
untouched.

Landscape is not handled: beta and gamma swap meaning when the screen
rotates, so gravity points sideways there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XcvB47URPm7Yj7xpoP4r8k
EOF
)"
```

- [ ] **Step 7: Push**

```bash
git push -u origin claude/bold-mendel-l7mnlo
```

Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure only.

---

## Final verification

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds (catches a `pages/` co-located test or a bad import)
- [ ] `git log --oneline -3` shows exactly three commits, in the order permission-gate, shake-to-scatter, tilt-gravity
- [ ] `git diff master --stat -- package.json package-lock.json` is empty (no dependency changes)
- [ ] Toolbar never shows more than 6 buttons in any permission state
