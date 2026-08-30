# Aquarium Fishing Mini-Game — Design Spec

Date: 2026-08-30
Status: Approved for planning

## Summary

A new 🎣 Fishing tool for the aquarium, separate from the existing 🎾 Toy
tool. The player casts a line by dragging down from the water surface, then
positions the bait to lure their own pet fish — the catch pool is the
player's existing creatures, not a separate ephemeral population. Nearby
fish have a per-tick chance to bite, weighted by distance and a hidden
per-fish "attraction" value, so a fast/lucky fish can occasionally beat a
closer one. A bite hooks the fish; the player must reel it up past the
surface to land the catch, or it swims off free if released early. Caught
fish go to a reversible bucket, from which they can be returned to the tank
or, after a deliberate hold-to-confirm drag onto a trash icon, deleted.

This reuses the affinity mechanism added in the seek-affinity work
(`computeAffinity` in `lib/aquarium/simulation.js`, the `affinity` param on
`stepMovement` in `lib/aquarium/movement.js`) with a randomized attraction
value in place of a need-derived one — the same steering math that makes a
hungry fish swim faster is what makes a lucky fish beat a closer one here.

## Design Constraint: OS Edge-Gesture Conflict

`pages/aquarium/index.module.css`'s `.tank` sits directly under `100vh`
`.page` with nothing above it — the tank's top edge is the literal viewport
top edge (the mute button is only absolutely-positioned over it, not taking
layout space). A cast-start gesture triggered at the very top pixels would
collide with the OS's own edge-swipe-down gesture (notification shade on
Android, Control Center/status bar on iOS), which the browser cannot
intercept or override. The cast-start zone is therefore inset below the
literal edge (see Gesture Design below), not flush against it.

## Architecture

**New file `lib/aquarium/fishing.js`** — pure fishing logic, mirroring how
`creatures.js`/`decorations.js` keep a feature's own math/config out of
`simulation.js`:

- `generateHiddenAttraction(rng)` — random per-fish attraction value in
  `[0, 1]`, same ephemeral shape as `cruiseSpeed` in `movement.js`.
- `computeBiteChance(dist, radius, hiddenAttraction, gotCloser)` — the
  per-tick bite roll input (formula below).
- `catchFish(state, creatureId)` — moves a creature from `tank.creatures` to
  `tank.bucket`.
- `returnFish(state, creatureId)` — moves a creature from `tank.bucket` back
  to `tank.creatures`.
- `deleteFromBucket(state, creatureId)` — removes a creature from
  `tank.bucket` permanently.

**`lib/aquarium/movement.js` gets no new movement logic.** The bite-race
reuses `stepMovement` exactly as its existing `target`/`affinity` params
already support: while a cast is active, each eligible fish is stepped with
`target = baitPosition` and `affinity = hiddenAttraction` instead of
`computeAffinity(need)`. Once hooked, the same call continues with
`affinity = 1` so the fish tracks the bait tightly until reel-in or release.
`movement.js`'s existing (currently unexported) `easeToward` is exported and
reused, once per axis, for the rod-tip line-lag animation — no new easing
math.

**`lib/aquarium/simulation.js`** gains only the schema/state plumbing:

```
tank.bucket: []          // caught creatures, same shape as tank.creatures entries
```

No `SCHEMA_VERSION` bump — per the existing convention (see the `SCHEMA_VERSION`
comment in `simulation.js`), that only happens for breaking changes (the v1→v2
bump removed the sponge tool and added arrays an old save couldn't satisfy). A
new empty array is purely additive, so `bucket` follows the same path as the
later `decorations`/`unlockedDecorationTypes` addition: just added to
`loadTank`'s additive-safe defaults spread, no version change.

**`pages/aquarium/index.jsx`**: a new `🎣 Fishing` entry in `TOOLS`. While it
is `selectedTool`, the tank's pointer handlers switch entirely to
fishing-specific cast/hook/reel logic — tap-to-drop, dirt-wipe, and
decoration-drag only run when Food/Toy/a decoration tool is selected. A new
bucket tray renders beside the tool palette (see UI below).

## Gesture Design

- **Cast-start zone**: a visible surface line rendered at ~12% down from the
  tank's top edge — inset from the viewport edge per the constraint above.
  A pointer-down within that band, followed by a downward drag past the
  existing `MIN_DRAG_PX` threshold, starts a cast.
- **Bait tracking**: while the cast drag continues, the bait's tank-fraction
  position tracks the pointer directly (same `rectFraction` helper the
  existing drag handlers use).
- **Line rendering**: the rod-tip anchor is a fixed point on the surface
  line; each frame, its screen position eases toward vertical alignment
  over the current bait position via `easeToward` (imported from
  `movement.js`), producing visible lag rather than an instant snap. The
  line itself is a simple stroke from rod-tip to bait.
- **Hook phase**: once a fish's bite roll succeeds (see Bite Mechanic), it
  is marked hooked and is stepped toward the bait at `affinity = 1`. The
  player continues dragging; if the bait crosses back above the surface
  line, the catch lands (`catchFish`) and the fish moves to the bucket. If
  the pointer is released before that happens, the fish unhooks and swims
  off freely — no punishment, matching the app's existing design principle
  — and the rod resets, ready to recast.
- **Bucket tray**: renders beside the tool palette (same row as
  Food/Toy/Fishing/decorations), showing bucketed fish as small tappable
  icons. Dragging a bucket icon onto the tank returns it (`returnFish`).
  Dragging a bucket icon onto a trash icon and holding for ~500ms deletes it
  (`deleteFromBucket`); while held, the icon's shake animation escalates in
  amplitude and frequency as the hold approaches the threshold (a CSS custom
  property driven by elapsed-hold-fraction), giving visual feedback before
  the point of no return. Releasing before 500ms cancels the hold and the
  fish snaps back with no effect.

## Bite Mechanic

New constants in `fishing.js`, following the calibrate-later pattern already
used for `AFFINITY_SPEED_FLOOR`/`AFFINITY_WEIGHT` in the seek-affinity work:

```
FISHING_DETECTION_RADIUS = DETECTION_RADIUS   // reuse movement.js's existing radius
BITE_TICK_MS = 400                            // cadence of bite rolls during an active cast
BITE_CHANCE_BASE = 0.15                       // base roll at point-blank range
SNOWBALL_BOOST = 1.5                          // multiplier when a fish closed distance since last tick
```

Per tick, for each eligible fish (in the tank, not already hooked, not
bucketed, within `FISHING_DETECTION_RADIUS` of the bait):

```
proximity = clamp(1 - dist / FISHING_DETECTION_RADIUS, 0, 1)
gotCloser = dist < prevDist                      // tracked per fish since the previous tick
chance    = clamp(BITE_CHANCE_BASE * proximity * hiddenAttraction * (gotCloser ? SNOWBALL_BOOST : 1), 0, 1)
bites     = rng() < chance
```

Fish are rolled nearest-first each tick; the **first** success hooks that
fish and ends the pre-hook phase for the cast (single line, one hookable
fish at a time — further rolls are skipped once a fish is hooked).
`hiddenAttraction` and `prevDist` live in a new page-level ref
(`fishingStatesRef`), ephemeral like `moveStatesRef`/`cruiseSpeed` — never
persisted — generated lazily the first tick a fish comes into range.

This produces the intended "~30% upset" feel: a fish with low
`hiddenAttraction` needs a much larger proximity+snowball combination to
reach the same chance as a high-attraction fish sitting still nearby.
`BITE_CHANCE_BASE`/`SNOWBALL_BOOST`/`BITE_TICK_MS` are starting points that
may need a short calibration pass once playable, same caveat the
seek-affinity spec carries for its own constants — more ticks before any
fish reaches the hook means more dynamism (a real race), so tick rate should
be tuned with that in mind.

## Non-Goals

- No changes to `movement.js`'s movement logic — fishing reuses
  `stepMovement` unmodified via the existing `target`/`affinity` params.
- No wild/ephemeral fish population — the catch pool is strictly
  `tank.creatures`.
- No limit on how many fish can be bucketed at once, including emptying the
  tank entirely — consistent with the app's no-punishment design; an empty
  `tank.creatures` is already a state the movement loop handles (it simply
  maps over zero creatures).
- No change to hunger/happiness decay for bucketed fish — they keep decaying
  at the normal rate while bucketed, same as any creature not currently
  being cared for.
- No new sound assets — cast/catch/discard reuse the existing `pop`/
  `sparkle` cue keys.
- No multiple simultaneous casts or multiple hooked fish at once.

## Testing

- **`fishing.test.js`**: `computeBiteChance` — proximity scaling, the
  snowball boost applies only when the fish got closer since the last tick,
  hidden attraction scales the result linearly, output is always clamped to
  `[0, 1]`; `catchFish`/`returnFish`/`deleteFromBucket` — move the right
  creature between `creatures`/`bucket`, no-op on an unknown id, array
  shapes otherwise unchanged.
- **`simulation.test.js`**: `createDefaultTank` starts with an empty `bucket`.
- **`storage.test.js`**: `loadTank` defaults `bucket: []` onto a save that
  predates it, without touching existing fields; round-trips an existing
  `bucket` unchanged.
- **`index.test.jsx`**: selecting 🎣 switches pointer handling (a food-tap
  gesture has no effect while fishing is selected); a cast-start drag
  beginning below the surface band does nothing; a hooked fish that's
  released before crossing the surface line stays in `tank.creatures`;
  dragging a bucketed fish onto the trash for under 500ms doesn't delete it,
  a full 500ms hold does.
- jsdom gap: same caveat noted in `.claude/rules/aquarium.md` for existing
  drag interactions — `document.elementFromPoint` isn't implemented, so
  drag-path tests rely on direct coordinate math rather than real
  hit-testing.

## Error Handling

No new failure surface. Bite-chance math is pure over already-clamped
inputs, matching the seek-affinity spec's reasoning. `catchFish`/
`returnFish`/`deleteFromBucket` no-op on an unknown id rather than throwing,
matching `removeDecoration`'s existing pattern. `localStorage` failure modes
are already covered by `storage.js` and need no fishing-specific handling
since `bucket` rides the same save blob as everything else.
