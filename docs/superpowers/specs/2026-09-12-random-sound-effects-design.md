# Random — Optional Sound Effects on Primary Actions — Design Spec

Date: 2026-09-12
Status: Approved for planning

## Summary

Every Random tab has one primary action (ROLL, PICK, FLIP, SHAKE, SHUFFLE,
DRAW) and all six are silent. This adds a short audio cue to each, plus a
persisted on/off toggle in the page chrome.

Classified **architectural**, not bounded: it adds a new shared module, a
new React context spanning all six tab components, a new persisted
setting, and a new control in the page shell. No single existing flow is
being modified in isolation.

## Prior Art (this repo is not starting from zero)

Two Web Audio synth modules already ship: `lib/doodleSound.js` and
`lib/aquarium/sound.js`. `pages/aquarium/index.jsx` already has a
persisted 🔊/🔇 mute toggle. This spec follows both patterns rather than
inventing a third. `lib/aquarium/sound.js`'s `createSound(enabled)` →
`{ play, setEnabled }` shape is reused deliberately.

## Decision: synthesized tones, not bundled audio files

| | Bundled audio assets | Web Audio synthesis |
|---|---|---|
| Payload | ~40–90 kB for six short files, all precached by `next-pwa` | 0 bytes |
| Licensing | six assets to source and license | none |
| Offline | works, but inflates the CacheOnly precache manifest | nothing to cache |
| First play | fetch + decode latency, needs preload | immediate |
| Test harness | mock `HTMLMediaElement.play`, a pattern this repo does not have | mock `AudioContext`, already done twice in `lib/doodleSound.test.js` and `lib/aquarium/sound.test.js` |
| Fidelity | a real dice rattle, a real card flick | synthetic beeps only |

**Chosen: Web Audio synthesis.** The accepted cost is fidelity — a dice
roll will sound like blips, not dice. Everything else favors synthesis:
zero payload on an offline-first PWA whose Random route is `PWA
CacheOnly`, no licensing, and two working precedents including their test
harness. Bundled assets buy only fidelity, which is not worth 40–90 kB and
a new precache/test pattern for six ~100 ms cues.

## Scope

All six tabs. A partial rollout would leave a global toggle that silently
does nothing on the tabs it does not cover, which reads as a bug. Marginal
cost per tab is one call inside an already-existing handler.

## Default state

Sound is **on** by default, per explicit product decision. The toggle is
the mitigation for the "PWA makes noise unprompted" problem, not the
default state. This is a deliberate trade: better discovery, at the cost
of one unexpected sound before the user finds the toggle.

## Architecture

Three layers, so each is testable alone:

### 1. `lib/randomSound.js` — pure audio, no React, no storage

```js
export const RANDOM_CUES = { roll, pick, flip, shake, shuffle, draw };
export const createRandomSound = (enabled) => ({ play(cue), setEnabled(value) });
```

- Sits at `lib/` top level next to `lib/doodleSound.js`, **not** at
  `lib/random/sound.js` — `lib/random.js` already exists, and a sibling
  `lib/random/` directory would make `import '../../lib/random'` resolve
  ambiguously to a human reader.
- Each cue is a short note sequence, not a single tone, so six cues stay
  distinguishable by ear:

  | Cue | Wave | Notes (Hz) | Note length | Character |
  |---|---|---|---|---|
  | `roll` | square | 440, 330, 260 | 60 ms | descending tumble |
  | `pick` | sine | 520, 780 | 90, 140 ms | rising confirm |
  | `flip` | triangle | 660, 990 | 70, 110 ms | coin ding |
  | `shake` | sawtooth | 180, 140, 180 | 70 ms | low wobble |
  | `shuffle` | triangle | 300, 380, 460, 540 | 45 ms | fast riffle |
  | `draw` | sine | 700, 880 | 70, 110 ms | two-note flick |

  Cues differ in wave type, note count, and starting frequency, so no two
  collapse into the same sound.
- One oscillator + gain node per note. Note *i* starts at
  `ctx.currentTime + (sum of preceding note lengths)`. Gain peaks at 0.12
  (matching `lib/aquarium/sound.js`) and rides an
  `exponentialRampToValueAtTime` down to 0.001 at note end.
- Lazy `ensureCtx()`: no `AudioContext` is constructed until the first
  `play()`. A user who never triggers an action never creates one.
- `ctx.resume()` when `ctx.state === 'suspended'`. Every cue fires from a
  tap or click, so the gesture requirement is already satisfied, but a
  context created and then suspended by a backgrounded tab needs the
  explicit resume.
- Guarded throughout: SSR (`typeof window === 'undefined'`), missing
  `AudioContext`/`webkitAudioContext`, constructor throw, and any error
  inside `play` all degrade to a silent no-op. Sound is never
  load-bearing.
- `play(cue)` with an unknown cue name is a no-op, not a throw.

### 2. `pages/random/SoundContext.jsx` — React state, persistence, toggle UI

Exports `SoundProvider`, `SoundToggle`, and `useSoundCue`.

- `SoundProvider` holds one `createRandomSound()` instance in a ref, the
  `soundOn` boolean in state, and supplies `{ play, soundOn, toggle }`.
- Persistence key: `localStorage['random-sound-on']`, storing `'true'` /
  `'false'`. Absent key, unparseable value, or a throwing read all mean
  on.
- **Hydration:** `soundOn` initializes to `true` on both server and first
  client render; the stored value is read in a mount `useEffect` and
  applied after. This deliberately departs from `ShuffleList`'s
  read-in-`useState`-initializer pattern, which would flip the toggle icon
  between server and client markup for a muted user. The cost is that a
  muted user sees 🔊 for one frame; no sound can play in that window
  because no cue fires without a tap, and the mount effect runs first.
- `SoundToggle` is a separate exported component rather than markup in
  `index.jsx`, because `index.jsx` renders the provider and cannot consume
  its own context. Button carries `aria-pressed={soundOn}` and
  `aria-label` of `Sound on` / `Sound off`, mirroring
  `pages/aquarium/index.jsx`.
- `useSoundCue()` returns just the `play` function. Its default context
  value is a no-op `play`, so each tab component still renders standalone
  outside a provider — the six existing tab test files keep passing
  unmodified.

### 3. Tab wiring — one line each, inside handlers that already exist

| File | Handler | Cue |
|---|---|---|
| `DiceRoll.jsx` | `handleRoll` | `roll` |
| `WeightedChoices.jsx` | `handlePick` (after the `valid.length < 2` and `!chosen` early returns) | `pick` |
| `CoinFlip.jsx` | `handleFlip` | `flip` |
| `MagicEightBall.jsx` | `handleShake` | `shake` |
| `ShuffleList.jsx` | `handleShuffle` | `shuffle` |
| `CardDraw.jsx` | `performDraw` (after the `deck.length < n` early return) | `draw` |

Placing the call inside the shared handler, not on the button's
`onClick`, means the gesture triggers documented in
`.claude/rules/random.md` — coin flick, deck flick, physical shake — get their cue for
free, and a refused action (too few choices, empty deck) stays silent.

### 4. CSS

- New `.soundToggle` in `pages/random/index.module.css`, shaped like
  `.muteToggle` in `pages/aquarium/index.module.css` (absolute, top-right,
  circular, `z-index` above the tab chrome).
- `.page` currently has no `position` declaration; it gains
  `position: relative` so the absolutely-positioned toggle anchors to the
  page rather than the viewport.

## Data Flow

1. User taps ROLL (or flicks the coin, or shakes the phone).
2. The tab's existing handler runs its existing logic, then calls
   `play('roll')` from `useSoundCue()`.
3. `SoundProvider`'s instance checks its `enabled` flag; if off, returns
   immediately.
4. `ensureCtx()` constructs or reuses the `AudioContext`, resuming it if
   suspended.
5. The cue's notes are scheduled as oscillator + gain pairs at increasing
   offsets from `ctx.currentTime`.

Toggle flow: tapping `SoundToggle` flips `soundOn` state, calls
`setEnabled` on the instance, and writes `localStorage['random-sound-on']`.

## Error Handling

- No `AudioContext` (jsdom, old browser): `play` returns silently.
- `new AudioContext()` throws: cached as null, every later `play` is a
  silent no-op, no retry storm.
- Any throw inside note scheduling: caught and swallowed. A failed sound
  must never break a dice roll.
- `localStorage` read or write throws (private mode, disabled storage):
  caught; the setting falls back to on and simply does not persist.

## Non-Goals

- No volume slider. On/off only.
- No per-tab sound settings. One global toggle for the Random page.
- No haptics / `navigator.vibrate`.
- No sound on secondary actions (NEW DECK, add/delete choice, tab switch,
  drag-reorder).
- No change to any tab's randomness, state, or persistence. Existing
  behavior is untouched; the cue is purely additive.
- No audio assets in `public/`, and no change to the service-worker
  precache manifest.
- No new dependency.

## Testing

TDD, tests first at each layer.

- `lib/randomSound.test.js` — with a stubbed `AudioContext` following
  `lib/doodleSound.test.js`'s `vi.stubGlobal` pattern: each of the six
  cues creates oscillators; a cue's note count matches its definition;
  `setEnabled(false)` creates none; an unknown cue name creates none and
  does not throw; with no `AudioContext` on the global, `play` does not
  throw. Plus a pure assertion over `RANDOM_CUES` that no two cues share
  the same wave type, note count, and first frequency — the ear-level
  distinctness guarantee, checkable without any audio.
- `__tests__/pages/random/SoundContext.test.jsx` — toggle renders with
  `aria-pressed` true by default; clicking flips it and writes
  `'false'`; a pre-seeded `localStorage` value of `'false'` produces a
  muted toggle after mount; a `localStorage` that throws still renders on.
- Per-tab cue assertions: `vi.mock` `lib/randomSound.js`, render each tab
  inside a `SoundProvider`, fire the primary action, assert `play` was
  called with the right cue name. Six cases. Also assert the negative
  path on the two guarded handlers — `handlePick` with fewer than two
  valid choices and `performDraw` with an empty deck fire no cue.
- The six existing tab test files must keep passing **unmodified** — they
  render tabs without a provider, which the no-op default context value
  covers. That is the regression guard on the wiring being additive.
- Actual audible output is not asserted. jsdom has no `AudioContext`;
  verify the cues sound distinct manually in a browser before merging.
