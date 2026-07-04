---
title: iPad Layout - Plan
type: feat
date: 2026-07-04
topic: ipad-layout-fitness-random
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# iPad Layout - Plan

## Goal Capsule

- **Objective:** stop fitness and random apps from rendering as a cramped, phone-width box on iPad — widen layout and touch targets above a breakpoint.
- **Product authority:** app owner, confirmed via brainstorm dialogue.
- **Open blockers:** none. One tuning question deferred to planning (see Outstanding Questions).

## Product Contract

### Summary

Widen the fitness and random apps for iPad: above a portrait-width breakpoint, raise container max-width and control/touch-target sizing so neither app looks like a stretched phone screen. Random app keeps its existing tab structure; this is a sizing pass, not a redesign.

### Problem Frame

Both apps are standalone installable PWAs styled for phone widths. Random app hard-caps its tab container at 320px — on an iPad that renders as a small dark box centered in a sea of empty background. Fitness app already caps at 960px with an auto-fit grid, which is more forgiving, but hasn't been checked against iPad viewport sizes or touch-target sizing.

### Key Decisions

- **KD1. Wider single column, not side-by-side panels.** Random app's dice-roller and weighted-choices tabs stay tabbed, just wider and bigger above the breakpoint. Rejected showing both panels at once — more restructuring for no clearly wanted benefit.
- **KD2. Breakpoint (media query), not fluid/clamp scaling.** A fixed breakpoint is simpler and predictable. Continuous fluid scaling was considered but adds tuning complexity without a stated need to support arbitrary tablet sizes.
- **KD3. Fitness app is in scope too.** Even though fitness already has a more generous 960px max-width, it gets the same review pass — its inner elements (grid, inputs, buttons) are checked and widened where cramped, within the existing 960px cap, not assumed fine by default. The 960px cap itself is not being raised.

### Requirements

**Random app**

- R1. Above the iPad-portrait breakpoint, random app's tab container widens to fill available width up to a stated max-width ceiling (a comfortable reading measure, not full-bleed), replacing the current 320px cap. The ceiling also caps growth on wider/landscape iPads so the container doesn't over-stretch above the breakpoint.
- R2. Above the breakpoint (exact value pending the Outstanding Questions decision below), interactive controls in random app (roll button, tab targets, weighted-choice row inputs/delete buttons) scale up so none stays sized for a phone-only touch target.
- R3. Random app's existing tabbed navigation (dice roller / weighted choices) stays tabbed and single-column above the breakpoint — no dual-pane restructuring.

**Fitness app**

- R4. Above the breakpoint (exact value pending the Outstanding Questions decision below), fitness app's result-card grid, input fields, and form buttons are reviewed and widened where they still read as phone-cramped, despite the existing 960px cap.

**Both apps**

- R5. Below the breakpoint, both apps render exactly as they do today, aside from the viewport meta tag added by R7 — the widen is additive above a threshold, not a rewrite of the phone layout. R7's tag must not visibly change phone-width rendering; verify this alongside the iPad checks in Success Criteria.
- R6. Volta app is untouched by this work.
- R7. Both apps get a `<meta name="viewport" content="width=device-width, initial-scale=1">` tag — neither currently sets one, so the breakpoint cannot key off real device width without it.

### Wireframe: random app, before/after

Directional only — illustrates the intended user-facing shape, not a spec.

- **Before:** on an iPad viewport, the tab container stays capped at 320px, rendered as a narrow phone-sized box centered in a much wider background, with empty space on both sides.
- **After (dice-roller tab):** the tab container widens to the stated ceiling, and the roll button scales up to a larger touch target within it.
- **After (weighted-choices tab):** the container widens the same way; each row's label input grows to use the added width, and the weight input and delete button scale up to larger touch targets without the row growing so wide that the delete button sits far from its label.

### Wireframe: fitness app, before/after

Directional only — illustrates the intended user-facing shape, not a spec.

- **Before:** on an iPad viewport, the result cards, repetition/weight inputs, and calculator button are sized for phone width — inside the existing 960px cap, the elements read as small and tightly packed relative to the available space.
- **After:** within the same 960px cap, the result-card grid uses wider columns/gaps, the repetition/weight input fields grow to a larger touch target, and the calculator button scales up — the outer container width is unchanged; only the elements inside it grow.

### Scope Boundaries

- Volta (EV charger) app — out of scope, untouched.
- New features or navigation restructuring — out of scope; this is a layout/sizing pass only.
- Fluid/clamp-based continuous scaling — considered and rejected in favor of a fixed breakpoint (KD2).

### Success Criteria

- Verified by opening both apps on a real iPad, in portrait and landscape: above the breakpoint, random app's container reaches its ~700px ceiling (not the old 320px cap), fitness app's cramped elements are visibly widened within its existing 960px cap, and interactive controls measure at least ~44px in their touch dimension.
- Verified on a real phone-width device/viewport that adding the R7 viewport meta tag produces no visible change to either app's current phone layout.

### Dependencies / Assumptions

- Assumes a standard iPad-portrait-width breakpoint (commonly around 768px) as the trigger; exact value is tunable during implementation against real device testing.
- Assumes touch targets scale toward a comfortable minimum (commonly cited as ~44px) above the breakpoint.
- Assumes random app's container max-width ceiling (R1) lands around ~700px (a comfortable reading measure, well short of full iPad width); exact value is tunable during implementation.

### Outstanding Questions

**Deferred to Planning:**

- Should the breakpoint value and touch-target sizing be one shared convention reused across fitness and random (e.g. a shared CSS utility), or tuned independently per app, since each installs as its own standalone PWA?
