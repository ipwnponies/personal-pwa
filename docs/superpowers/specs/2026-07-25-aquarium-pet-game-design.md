# Aquarium Pet Game — Design Spec

Date: 2026-07-25
Status: Approved for planning

## Summary

A Tamagotchi-style virtual aquarium mini-tool for the personal PWA, built for a
toddler. The player keeps a small tank of creatures alive and happy by feeding,
cleaning, and playing. Creatures grow up as they're cared for. There is no
death and no scoring — only positive cause-and-effect feedback that teaches the
routine of caring for something. Life continues in real time while the app is
closed, so the toddler learns to check on their pets.

The creature type is a data-driven theming layer: fish today, but shrimp,
chicks, puppies, or bunnies later by swapping config, with no change to game
logic.

## Audience and Design Principles

- **Toddler-first.** No reading required. Needs are shown visually (droopy vs
  bouncy, dull vs bright, thought-bubbles), never as numbers or text.
- **No punishment.** No death, no game-over, no score to optimize. Neglect
  leads only to a temporary sad/dirty state that any single round of care
  reverses.
- **Cause and effect.** Every action produces immediate, delightful feedback so
  the link between "I cared" and "it's happy" is obvious without words.
- **Forgiving by design.** The toddler will neglect the pets. Decay is slow and
  floored; the game always offers a way to turn it around.
- **Learning responsibility.** Real-time offline decay means pets need checking
  on, gently building a care routine.

## Architecture

Follows the existing mini-tool pattern (`pages/fitness`, `pages/random`).

- **Route:** `pages/aquarium/index.jsx` + `pages/aquarium/index.module.css`.
- **Pure logic in `lib/aquarium/` (no React, fully unit-testable):**
  - `lib/aquarium/creatures.js` — species/theming config. The swappable layer:
    each species is data (name, sprite/emoji, colors, size-per-stage,
    animation params). Game logic references species only by key.
  - `lib/aquarium/simulation.js` — pure decay + growth math. Given saved state
    and elapsed milliseconds, returns the new state. No side effects, no I/O.
  - `lib/aquarium/storage.js` — load/save to `localStorage`, `lastSeen`
    timestamp stamping, and `version`-based migration/reset.
- **React layer** (`pages/aquarium/index.jsx` + presentational components):
  holds tank state, runs a render/decay tick via `setInterval` while the page
  is visible, and calls `simulation` once on mount using real elapsed time
  (`now - lastSeen`) to catch up offline decay.
- **Rendering:** DOM + CSS animations. Each creature is an absolutely
  positioned element; CSS keyframes drive swim/wiggle/droop. Chosen over Canvas
  because the tank is capped small (~8), it needs no new dependencies, it
  matches the repo's CSS-module conventions, and it is testable with React
  Testing Library.
- **No backend, no new dependencies, static-export safe.**

## Data Model

Persisted as one JSON blob in `localStorage`:

```
{
  version: 1,
  lastSeen: <epoch ms>,           // for offline-decay compute
  selectedTool: "food"|"sponge"|"toy",
  soundOn: true|false,
  tankCleanliness: 0..100,         // shared, decays over time
  eggProgress: 0..100,             // care fills it; at 100 an egg appears
  egg: null | { readyAt: <epoch ms> },   // present = tap to hatch
  creatures: [
    {
      id,
      species: "clownfish",        // key into creatures.js config
      bornAt: <epoch ms>,
      stage: "baby"|"child"|"adult",
      hunger: 0..100,              // 100 = full; decays down
      happiness: 0..100,           // 100 = happy; decays down
      wellMetSince: <epoch ms>|null, // start of current "needs met" streak, for growth
      x, y                          // tank position (0..1 fractions) for render + food targeting
    }
  ]
}
```

### Rules

- **Decay is real-time and floored.** `hunger`, `happiness`, and
  `tankCleanliness` decay slowly with elapsed time and never drop below a floor
  (e.g. 15). No creature can reach a "dead" state.
- **Shared cleanliness drags happiness.** Low `tankCleanliness` gently pulls
  each creature's `happiness` down (a dirty tank makes grumpy fish), reversed as
  soon as the tank is cleaned.
- **Growth is one-way and care-gated.** A creature advances `baby → child →
  adult` when its needs have stayed "met" (hunger and happiness above a
  threshold, tank clean enough) continuously for a stage-appropriate duration.
  `wellMetSince` tracks the current streak; the streak resets if needs drop
  below the threshold, pausing (never reversing) growth. Adult is the final,
  happy state.
- **Egg / stocking.** Caregiving fills `eggProgress`. At 100, an `egg` appears
  (`egg` set, `eggProgress` reset). The toddler taps the wobbling egg to hatch a
  new baby. Tank is capped (~8); at cap, `eggProgress` and egg appearance pause
  so the tank never overflows.
- **Versioned save.** `storage.js` reads `version`; on mismatch it migrates or
  cleanly resets rather than crashing on an old/incompatible blob.

## Interaction and Feedback

Tool-selection model, like a paint app.

- **Bottom bar = tool palette, radio-select.** Exactly one tool active at a
  time, clearly highlighted: 🍤 Food, 🧽 Sponge, 🎾 Toy. The toddler picks a
  tool, then acts on the tank or a specific creature with it. Selected tool
  persists in the save.
- **Gestures: tap, long-press, drag. No pinch.**
  - **Food selected:**
    - Tap tank → drop a pellet at that spot; nearby creatures swim over and eat
      (position-based; not every creature is guaranteed a bite).
    - Drag → sprinkle a trail of food.
    - Long-press → pour a pile at that spot.
    - Tap a creature → hand-feed that one directly (guaranteed).
  - **Sponge selected (cleanliness is tank-wide):**
    - Drag across the glass → wipe it clean with a sparkle trail.
    - Tap → scrub a spot.
  - **Toy selected:**
    - Drag → creatures chase your finger (primary play).
    - Tap a creature → tickle that one.
    - Long-press a creature → pet/hold it.
- **Needs shown visually only:** hungry = droops, dull color, small food
  thought-bubble; happy = bright and bouncy; dirty tank = greenish tint with
  floaty specks that clear satisfyingly on clean. No numbers, no text.
- **Instant feedback on every action:** darting-to-food gulp, sparkle on a
  happiness rise, wobble-and-pop on hatch.
- **Sound:** short synthesized cues (nom, pop, sparkle) via the WebAudio API —
  no audio-file dependencies. Default on, with a mute toggle in a corner for
  parents. Persisted in the save (`soundOn`).
- **Egg:** when present, it wobbles and shines to invite a tap; hatching is a
  small celebration.

## Error Handling

- **Corrupt/absent save:** `storage.js` returns a fresh default tank rather than
  throwing. A version mismatch triggers migration or a clean reset.
- **`localStorage` unavailable** (private mode, disabled): the game runs in
  memory for the session; save is a no-op. No crash, no error surfaced to the
  toddler.
- **Clock skew / huge elapsed time:** offline-decay compute clamps elapsed time
  and relies on the per-need floor, so a long absence still lands in a fully
  recoverable state, never a broken one.
- No broad try/catch that hides real bugs — only the specific, expected failure
  points above are guarded, consistent with repo conventions.

## Testing

- **`simulation.js`** (primary coverage — pure functions):
  - Decay reduces needs over elapsed time and respects the floor.
  - Feeding/playing/cleaning raise the right values, clamped at 100.
  - Growth advances only after a continuous met-needs streak; the streak resets
    when needs dip; growth never regresses; adult is terminal.
  - Dirty tank drags happiness; cleaning releases it.
  - Egg progress fills, spawns an egg, and pauses at tank cap.
- **`storage.js`:** round-trips a save; returns defaults on missing/corrupt
  data; migrates/resets on version mismatch; no-ops gracefully when
  `localStorage` is unavailable.
- **`creatures.js`:** every species config exposes the fields the render and
  simulation layers require (guards the swap-the-species goal).
- **React layer** (`__tests__/pages/aquarium/index.test.jsx`, per the repo rule
  that `pages/` tests live under `__tests__/`): selecting a tool highlights it;
  acting with a tool updates visible state; the egg is tappable when present.
- All tests are Vitest + React Testing Library, matching existing conventions.
  CI gates on `npm test`.

## Out of Scope (YAGNI)

- Death, scoring, leaderboards, currencies, or shops.
- Multiple tanks or save profiles.
- Breeding genetics beyond "care fills an egg."
- Networked/shared/social features.
- Pinch/zoom gestures.
