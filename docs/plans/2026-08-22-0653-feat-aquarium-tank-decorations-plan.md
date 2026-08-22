---
title: Aquarium Tank Decorations - Plan
type: feat
date: 2026-08-22
topic: aquarium-tank-decorations
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Aquarium Tank Decorations - Plan

## Goal Capsule

- **Objective:** A preschooler can decorate their aquarium tank with unlockable items they place anywhere and rearrange freely, giving the sandbox tool an ongoing source of novelty beyond the feed/clean/play loop.
- **Means:** Extend the existing tool-palette + tap/drag interaction pattern (`pages/aquarium/index.jsx`, `lib/aquarium/simulation.js`) with a new, non-consumed decoration item type, unlocked through the same care actions that already fill the egg meter.
- **Product authority:** This brainstorm, confirmed in dialogue with the app's owner.
- **Open blockers:** None — ready for planning.

## Product Contract

### Summary

Adds a decoration system to the aquarium: a growing palette of placeable items (plants, castle, treasure, etc.) that a preschooler drags anywhere in the tank and can pick up and move at any time. New items unlock gradually through the same feed/play/clean actions that already advance the egg-progress meter.

### Problem Frame

The aquarium's current loop — feed, play, wipe a dirt spot — was built for a toddler's cause-and-effect learning and is reported as too simple and boring now. Once a fish's needs are met there is nothing left to discover: care produces an occasional new egg, but the tank itself never changes, and nothing rewards continued engagement beyond that one milestone.

### Key Decisions

- **Freeform placement, not snap-to-zone.** Reuses the existing tap/drag interaction the child already knows and preserves full sandbox-arrangement freedom; the resulting overlap/clutter risk is managed with a cap (R6) rather than layout constraints. Governs R1, R3, R6.
- **Unlocked via care, not open from the start.** New decoration items unlock progressively through the same feed/play/clean actions that fill the egg meter, so the existing care loop stays the source of the reward instead of adding an unrelated toy box. Governs R5, R7.
- **Decorations are purely visual — fish do not react to or avoid them.** Keeps this round's scope to placement rather than fish behavior/AI; living, fish-reactive decoration is a deferred idea (see Scope Boundaries).

### Requirements

- R1. A decoration palette (or an expandable section of the existing tool palette) offers unlocked items the child can select, then place by tapping/dragging into the tank — the same gesture already used for food/toy drops.
- R2. A placed decoration persists at its exact drop point across sessions, saved like the rest of the tank state, until moved or removed.
- R3. A placed decoration can be picked up and moved to a new position at any time, or removed entirely, using the same drag-based interaction already used elsewhere in the tank.
- R4. Decorations do not consume or disappear on their own — no timeout, no interaction-triggered consumption (unlike food/toy drops).
- R5. New decoration items unlock over time via the same care actions (feeding, playing, wiping dirt spots) that fill the egg-progress meter, tracked as an independent progress meter from the egg's.
- R6. Placed decorations are capped per decoration type (not by one shared total), mirroring the existing per-type drop and dirt-spot caps, so a full tank cannot obscure the fish and unlocking one type doesn't block placing another.
- R7. Decoration-unlock pacing reads as distinguishable from egg-hatch pacing — the two should not consistently land on the same action so they don't read as one reward.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given the decoration palette has at least one unlocked item, when the child selects it and taps/drags into the tank, then a decoration appears at that point and is still there after closing and reopening the app.
- AE2. **Covers R3.** Given a decoration is already placed, when the child drags it to a new point, then it moves there and the old spot is vacated; when the child performs the removal gesture (exact gesture: see Outstanding Questions), then it disappears from the tank and becomes placeable again from the palette.
- AE3. **Covers R5, R7.** Given ongoing care actions accumulate, when the decoration-unlock meter separately reaches its threshold, then a new item appears in the palette — this should not always coincide with an egg spawning from the same actions.
- AE4. **Covers R6.** Given the tank is at the decoration cap, when the child places another decoration, then the cap-reached behavior fires (exact behavior: see Outstanding Questions).

### Scope Boundaries

**Deferred for later:**
- Decorations that fish interact with — hide behind, nibble, swim around (the "living decoration" approach explored and set aside this round).
- Themed backdrops or whole-scene presets, as opposed to individually placeable items.

**Outside this product's identity:**
- Currency, shop, or points tied to decorations — the app has no numbers or economy anywhere; decorations stay reward-only, never purchased.
- Snap-to-grid/zone placement — considered and rejected in favor of freeform (see Key Decisions).

### Dependencies / Assumptions

- Assumes the existing tool-palette pattern extends cleanly to a third, non-consumed item type; if the current food/toy drop shape can't represent "persists indefinitely, movable," planning may need a distinct decoration entity rather than reusing that shape.
- Assumes fish continue to ignore obstacles (per the existing movement design) — decorations add no collision or avoidance behavior.

### Outstanding Questions

**Deferred to Planning:**
- What decoration items ship first (specific set — plants, castle, treasure chest, gravel color, backdrop, etc.)?
- Exact unlock pacing/threshold for the decoration meter relative to the egg meter (R7).
- Cap-reached behavior for R6: evict the oldest decoration (like existing drop caps) or block placement until one is removed?
- Exact removal gesture (drag to a trash target, long-press, or drag back to the palette).
- How does the child pick up and move an already-placed decoration (R3)? The existing drag gesture only paints new drops along the pointer path — grabbing one specific existing item, including which one wins when several overlap at a point, needs its own design.
- If purely-visual decorations don't move engagement — the boredom may be about the fish feeling inert rather than the tank looking sparse — should the deferred fish-reactive approach (see Scope Boundaries) be reconsidered sooner than "later"?
- What does the decoration palette look like with zero items unlocked yet: hidden entirely, a grayed placeholder, or a locked silhouette?
- What perceptible cue (animation, sound, badge) marks the moment a decoration unlocks, distinct from the egg-hatch cue?
- Does the per-type cap (R6) fully guarantee decorations can't obscure the fish, or does freeform placement still need spacing/overlap rules on top of the cap?
- Does a returning player's care history from before the decoration meter existed count toward their first unlock, or does everyone start the meter at zero?
