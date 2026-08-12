# Aquarium Movement & Care Redesign — Design Spec

Date: 2026-07-31
Status: Approved for planning

## Summary

A redesign of the aquarium mini-tool's fish movement and care interactions,
following real-browser testing of the initial implementation (see
`2026-07-25-aquarium-pet-game-design.md`). Two problems surfaced: fish only
wobbled in place (no real movement), and care actions gave no clearly visible
feedback. This spec replaces the tick-based teleport movement with a
continuous steering simulation, replaces tank-wide instant care actions with
physical drop/wipe interactions the fish and glass respond to, enlarges fish
for touch-table use, and replaces the abstract mood-dot with a literal
want-bubble indicator.

Everything from the original spec not addressed here is unchanged: no death,
no numbers, one-way care-gated growth, real-time offline decay, egg
hatching/stocking, species as a swappable data layer, sound cues.

## Problems Being Fixed

1. **Fish didn't feel alive.** Position changed via a periodic teleport
   (every 900ms) eased by a CSS `transition`. This can't express varying
   speed, acceleration, or organic curved paths — CSS transitions only
   linearly interpolate between two fixed points.
2. **Care actions were invisible in practice.** Tank-wide feed/clean/play
   updated state correctly but gave no action tied to a *thing you can see
   change* — a full-health starter tank showed nothing on a tap.
3. **Fish were too small for a touch-table child.** Sized for a phone-scale
   tap target, not a shared tablet/table display.

## Movement Engine

New pure module `lib/aquarium/movement.js`, unit-tested with fixed `dt` steps
and injected rng — no DOM, no `requestAnimationFrame` inside it.

- **Per-fish cruise speed:** assigned at spawn, re-rolled occasionally,
  randomized in **15–45 px/s**.
- **Heading vs. desired heading:** each fish has a current heading (unit
  vector) and a desired heading — either an idle wander target or the
  direction to a claimed food/toy drop. Each simulation step, current heading
  turns toward desired heading at a capped **turn rate** (~90°/sec) rather
  than snapping. This is what produces natural curves without explicit path
  data.
- **Speed easing:** current speed eases toward a target speed (its cruise
  speed, or a slightly faster seek speed) with a capped acceleration, rather
  than jumping.
- **Wobble:** a small continuous sinusoidal lateral offset layered on top of
  the heading gives a tail-wag zigzag look. Cosmetic only, computed from
  elapsed time, not persisted.
- **Edge handling:** within a margin of the tank bounds, the desired heading
  bends back toward center smoothly — no hard clamp/bounce.
- **Idle wander:** re-picks a new random desired heading every ~2–4s.
- **Seeking:** overrides wander whenever an eligible, unclaimed food/toy drop
  exists within a **detection radius** of the fish. See Interaction Model.

`movement.js` exposes a pure step function taking the current per-fish
movement state (position, heading, speed, wander-target, wander-target
expiry) plus `dt` and the current drops, returning the next movement state.
The page's `requestAnimationFrame` loop calls this once per frame per fish
and is otherwise thin — it does not carry simulation logic.

Position is **not** persisted every frame. The existing decay/save tick
(every 2s) snapshots current position alongside decay, same as today.

## Interaction Model

**Tool palette drops to two:** 🍤 Food, 🎾 Toy (Sponge tool removed —
cleaning is always available, direct-tap, no mode needed).

- **Drop food/toy:** with a tool selected, tap the tank (anywhere, including
  directly on a fish) to drop an item at that point. Drag sprinkles several
  drops along the path (reusing the existing drag-sampling and
  minimum-movement-before-drag guards already built for the previous
  interaction model). Long-press is retired — dropping directly on a fish
  already covers "guaranteed feed this one."
- **Drops are capped** (6 concurrent per type); a new drop beyond the cap
  evicts the oldest, so repeated tapping can't pile up indefinitely.
- **Eligibility to seek:** a fish only seeks food when its hunger is below a
  threshold (reuses `MET_THRESHOLD`), and only seeks toys when happiness is
  below the same threshold. A satisfied fish ignores drops entirely.
- **Claiming:** among eligible fish, the nearest one within the detection
  radius claims the nearest unclaimed drop (locks it as its seek target) so
  multiple hungry fish don't converge on one crumb. If its target disappears
  (consumed by a faster claimant — shouldn't happen once claimed, but guards
  against stale state), the fish falls back to idle wander.
- **Consumption:** when a seeking fish reaches a drop (within a small contact
  radius), the drop is removed, the corresponding need (hunger or happiness)
  rises by the existing `FEED_AMOUNT`/`PLAY_AMOUNT`, and — this is the new
  trigger point — egg progress advances. Consumption is the "care completed"
  event, not the drop.
- **Dirty spots:** `tankCleanliness` decay is visualized as discrete spots on
  the glass (`dirtSpots`, capped, roughly one new spot per ~10-point drop in
  cleanliness). Tapping or dragging across a spot wipes it: removes it,
  raises `tankCleanliness` by a fixed per-spot amount, and advances egg
  progress. No tool selection required — tapping a spot is unambiguous. The
  continuous water-murkiness tint (already built) stays as ambient backdrop;
  spots are the literal actionable object.
- **Unchanged:** growth/decay math in `simulation.js` (need decay, dirty-tank
  happiness drag, stage advancement gated on a sustained met-needs streak),
  egg spawn/hatch, sound cues, mute toggle, tank cap.

## Data Model Changes

Added to the persisted tank shape:

```
foodDrops: [{ id, x, y, createdAt }]
toyDrops:  [{ id, x, y, createdAt }]
dirtSpots: [{ id, x, y, createdAt }]
```

Each creature gains ephemeral movement state that is **not** part of the
growth/decay model and only loosely persisted (position snapshot only, as
today):

```
heading: { x, y }       // unit vector, in-memory only
speed: number            // px/s, in-memory only
seekTargetId: string|null // id of a claimed drop, in-memory only
wanderTarget: { x, y } | null
wanderTargetExpiresAt: number | null
```

`feedTank`, `playTank`, `cleanTank`, `feedCreature`, `playCreature`,
`wanderCreatures` are removed from `simulation.js`, replaced by:
`dropFood`, `dropToy`, `consumeDrop` (shared by food/toy consumption),
`spawnDirtSpot` (called from `applyElapsed` as cleanliness crosses each
step), `wipeDirtSpot`.

## Status Display

Replaces the mood-dot with a **want-bubble**: a small emoji (🍤 or 🎾)
floating just above a fish, opacity and scale interpolating continuously from
invisible (need at max) to fully visible (need at floor), starting to appear
once the relevant need drops below ~70% of the way from floor to max. A fish
shows at most one bubble — whichever of hunger/happiness is currently lower
(more urgent). This directly teaches the food→hunger / toy→happiness mapping
instead of asking the child to read a color.

Tank cleanliness has no per-fish indicator — the dirty spots on the glass
serve that role directly.

## Sizing

Fish `sizePx` roughly doubles for a touch-table display: baby 28→**60px**,
child 40→**84px**, adult 56→**108px**. All comfortably above typical minimum
touch-target sizing.

## Testing

- **`lib/aquarium/movement.js`:** heading turns toward desired heading at the
  capped rate (never overshoots in one step); speed eases toward target speed
  within the acceleration cap; wander target re-picks after its expiry;
  edge-margin steering bends heading back toward center; seeking overrides
  wander when an eligible claimed target exists; wobble is a pure function of
  elapsed time (deterministic, testable).
- **`lib/aquarium/simulation.js` additions:** `dropFood`/`dropToy` cap and
  evict oldest; `consumeDrop` removes the drop, raises the right need, and
  advances egg progress; claiming picks nearest eligible fish to nearest
  unclaimed drop; a satisfied fish never claims; `spawnDirtSpot` respects the
  spot cap; `wipeDirtSpot` removes a spot, raises cleanliness, advances egg
  progress.
- **React layer:** tool palette now shows two tools; tapping the tank with a
  tool selected produces a drop; tapping/dragging a dirty spot removes it
  regardless of selected tool; want-bubble emoji appears/hides based on
  need level.

## Out of Scope (YAGNI)

- Drop expiry/timeout (uneaten food just sits until evicted by the cap).
- Multiple fish sharing one drop (single-claim, single-serving only).
- Per-fish cleanliness (cleanliness stays a tank-wide stat).
- Any numeric or bar-based status display.
