# Aquarium Seek Affinity — Design Spec

Date: 2026-08-27
Status: Approved for planning

## Summary

Currently, when a creature seeks a food or toy drop, it approaches at a flat
speed (`cruiseSpeed * SEEK_SPEED_MULTIPLIER`, easing down only near arrival),
and contested drops (two creatures wanting the same drop) are resolved
nearest-first. Neither reflects how badly the creature needs it.

This adds an **affinity** value — how strongly a creature is pulled toward a
need — derived from how far below the "needs met" threshold its hunger or
happiness has fallen. A creature at the threshold barely cares; a creature at
zero is desperate. Affinity scales the creature's approach speed and decides
who wins when two creatures want the same drop.

This is scoped groundwork for a planned fishing mini-game, which will reuse
the same affinity mechanism with a randomized (rather than need-derived)
source value. Fishing is out of scope for this spec and will follow as its
own design once this lands.

## Affinity Formula

```
deficit  = MET_THRESHOLD - need          // need = hunger (food) or happiness (toy)
affinity = clamp(deficit / (MET_THRESHOLD - NEED_FLOOR), 0, 1)
```

Normalized over the actually-reachable range `[NEED_FLOOR, MET_THRESHOLD]`, not
`[0, MET_THRESHOLD]` — `hunger`/`happiness` are clamped to `NEED_FLOOR` and
never reach 0 in play, so dividing by `MET_THRESHOLD` alone would cap real
affinity at `(MET_THRESHOLD - NEED_FLOOR) / MET_THRESHOLD` (0.75 with the
current constants) instead of reaching 1.

- `affinity = 0` at the seek-eligibility threshold (`need == MET_THRESHOLD`) —
  barely wants it.
- `affinity = 1` once `need` bottoms out at `NEED_FLOOR` (the deepest a need
  can actually reach) — maximally wants it.
- Values between scale linearly. No new persisted field: affinity is derived
  on demand from the creature's existing `hunger`/`happiness`, matching the
  pure-function style of the rest of `simulation.js`.

## Behavior Changes

### 1. Approach speed (`lib/aquarium/movement.js`)

`stepMovement` currently computes `desiredSpeed` for a seek target as
`cruiseSpeed * SEEK_SPEED_MULTIPLIER` (then eased down near arrival by the
existing `arriveSpeed` curve). This becomes affinity-scaled:

```
seekSpeed = cruiseSpeed * SEEK_SPEED_MULTIPLIER
          * (AFFINITY_SPEED_FLOOR + affinity * (1 - AFFINITY_SPEED_FLOOR))
```

`AFFINITY_SPEED_FLOOR` (proposed `0.6`, shipped as `0.75` — the constant must
satisfy `SEEK_SPEED_MULTIPLIER × AFFINITY_SPEED_FLOOR > 1` for the briskly-
swimming behavior below to hold, and `0.6` doesn't: `1.4 × 0.6 = 0.84 < 1`)
keeps a barely-eligible creature swimming briskly rather than crawling — only
the truly desperate case reaches full seek speed. The existing `arriveSpeed`
near-target easing is unchanged and applies on top of this.

`stepMovement` gains an `affinity` parameter (default `1`, preserving current
behavior for any caller that doesn't pass one — none should remain after this
change, but keeps the function's existing signature degrade gracefully).
Callers (the aquarium page's per-frame movement loop) look up each seeking
creature's affinity from its current `hunger`/`happiness` and pass it in.

### 2. Contested-claim priority (`lib/aquarium/simulation.js`)

`assignSeekTargets`'s candidate ranking is currently:

```
matchesPreferred → dist ascending
```

`matchesPreferred` stays a hard tier (a creature's more urgent need still
always outranks its fallback need). Within a tier, ranking becomes a blended
score instead of a strict affinity-then-distance chain, so neither factor
alone decides — and so two seemingly-identical creatures at the same spot can
still land differently:

```
proximity = clamp(1 - dist / DETECTION_RADIUS, 0, 1)   // 0 at detection edge, 1 at the drop
score = AFFINITY_WEIGHT * affinity
      + PROXIMITY_WEIGHT * proximity
      + RANDOM_WEIGHT * rng()
```

Proposed weights `AFFINITY_WEIGHT = 0.4`, `PROXIMITY_WEIGHT = 0.4`,
`RANDOM_WEIGHT = 0.2` — affinity and proximity dominate roughly equally, with
a smaller random nudge that can occasionally flip a close call (a hungrier
creature can still out-claim a closer-but-less-hungry one, but it isn't
guaranteed the instant it's hungrier). Candidates within a `matchesPreferred`
tier sort by `score` descending. Like `AFFINITY_SPEED_FLOOR` and the fishing
bite constants, these weights are a starting point that may need a short
calibration pass once the feel is playable.

`assignSeekTargets` gains an `rng` parameter (default `Math.random`),
matching the existing `rng`-injection pattern used elsewhere in this file
(e.g. `makeCreature`) — tests can pass a seeded/deterministic rng.

Both food and toy get this treatment symmetrically — `affinity` and `score`
are computed per creature per need-type the same way in both branches.

## Non-Goals

- No new persisted state — affinity is always derived from existing fields.
- No change to wander (non-seeking) movement, decay rates, or thresholds.
- No change to whether a creature is seek-eligible (`MET_THRESHOLD` gating is
  unchanged) — only speed and claim priority once eligible.
- Fishing's randomized affinity source and bite mechanic: separate, later
  spec.

## Testing

- **`movement.js`** (`movement.test.js`): `stepMovement` approaches a seek
  target faster at `affinity=1` than `affinity=0` for the same distance;
  `affinity=0` still moves at `AFFINITY_SPEED_FLOOR` speed, not zero; the
  existing arrive-radius easing still holds regardless of affinity.
- **`simulation.js`** (`simulation.test.js`): `assignSeekTargets` with a
  seeded/deterministic `rng` —
  - a hungrier-but-farther creature can win a contested drop over a
    closer-but-less-hungry one (score-driven, not guaranteed every time);
  - a much closer creature can still win despite lower affinity (proximity
    term dominates when the gap is large);
  - with `RANDOM_WEIGHT` isolated (affinity and proximity held equal), a
    varying `rng` output changes the winner — proves the random term is
    actually wired in, not just present in the formula;
  - existing preferred-type-first tier behavior is unchanged.
- Existing tests asserting the old flat-speed / nearest-first-only behavior
  are updated to reflect the new affinity+proximity+random scoring rather
  than treated as regressions.

## Error Handling

No new failure surface — this is pure-function math over values that are
already clamped/floored elsewhere (`NEED_FLOOR`/`NEED_MAX`), so `deficit`,
`affinity`, `proximity`, and `score` are always well-defined and in range. No
new try/catch needed, consistent with the rest of the module.
