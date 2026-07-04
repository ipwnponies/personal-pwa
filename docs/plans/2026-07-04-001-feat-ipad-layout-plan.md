---
title: iPad Layout - Plan
type: feat
date: 2026-07-04
topic: ipad-layout-fitness-random
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# iPad Layout - Plan

## Goal Capsule

- **Objective:** stop fitness and random apps from rendering as a cramped, phone-width box on iPad — widen layout and touch targets above a breakpoint.
- **Product authority:** app owner, confirmed via brainstorm dialogue.
- **Open blockers:** none.
- **Execution profile:** CSS/layout-only change to two existing pages; no new architecture, no backend, no data migration.

---

## Product Contract

**Product Contract preservation:** changed R4 and the fitness wireframe — both referenced a "calculator button" that does not exist in `pages/fitness/index.jsx` (the page is a live-calculating form with no submit button). Corrected to match the actual elements. No other Product Contract text changed.

### Summary

Widen the fitness and random apps for iPad: above a portrait-width breakpoint, raise container max-width and control/touch-target sizing so neither app looks like a stretched phone screen. Random app keeps its existing tab structure; this is a sizing pass, not a redesign.

### Problem Frame

Both apps are standalone installable PWAs styled for phone widths. Random app hard-caps its tab container at 320px — on an iPad that renders as a small dark box centered in a sea of empty background. Fitness app already caps at 960px with an auto-fit grid, which is more forgiving, but hasn't been checked against iPad viewport sizes or touch-target sizing.

### Key Decisions

- **KD1. Wider single column, not side-by-side panels.** Random app's dice-roller and weighted-choices tabs stay tabbed, just wider and bigger above the breakpoint. Rejected showing both panels at once — more restructuring for no clearly wanted benefit.
- **KD2. Breakpoint (media query), not fluid/clamp scaling.** A fixed breakpoint is simpler and predictable. Continuous fluid scaling was considered but adds tuning complexity without a stated need to support arbitrary tablet sizes.
- **KD3. Fitness app is in scope too.** Even though fitness already has a more generous 960px max-width, it gets the same review pass — its inner elements (grid, inputs) are checked and widened where cramped, within the existing 960px cap, not assumed fine by default. The 960px cap itself is not being raised.

### Requirements

**Random app**

- R1. Above the iPad-portrait breakpoint, random app's tab container widens to fill available width up to a stated max-width ceiling (a comfortable reading measure, not full-bleed), replacing the current 320px cap. The ceiling also caps growth on wider/landscape iPads so the container doesn't over-stretch above the breakpoint.
- R2. Above the breakpoint, interactive controls in random app (roll button, tab targets, weighted-choice row inputs/delete buttons) scale up so none stays sized for a phone-only touch target.
- R3. Random app's existing tabbed navigation (dice roller / weighted choices) stays tabbed and single-column above the breakpoint — no dual-pane restructuring.

**Fitness app**

- R4. Above the breakpoint, fitness app's result-card grid and input fields (weight, repetitions) are reviewed and widened where they still read as phone-cramped, despite the existing 960px cap.

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

- **Before:** on an iPad viewport, the result cards and weight/repetitions inputs are sized for phone width — inside the existing 960px cap, the elements read as small and tightly packed relative to the available space.
- **After:** within the same 960px cap, the result-card grid uses wider columns/gaps and the weight/repetitions input fields grow to a larger touch target — the outer container width is unchanged; only the elements inside it grow.

### Scope Boundaries

- Volta (EV charger) app — out of scope, untouched.
- New features or navigation restructuring — out of scope; this is a layout/sizing pass only.
- Fluid/clamp-based continuous scaling — considered and rejected in favor of a fixed breakpoint (KD2).

### Success Criteria

- Verified by opening both apps on a real iPad, in portrait and landscape: above the breakpoint, random app's container reaches its 700px ceiling (not the old 320px cap), fitness app's cramped elements are visibly widened within its existing 960px cap, and interactive controls measure at least 44px in their touch dimension.
- Verified on a real phone-width device/viewport that adding the R7 viewport meta tag produces no visible change to either app's current phone layout.

### Dependencies / Assumptions

- Random app's container max-width ceiling (R1) is fixed at 700px (a comfortable reading measure, well short of full iPad width) — see KTD3.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Fitness's touched elements move into a new CSS module, not a runtime `matchMedia` hook.** `pages/random/index.module.css` already establishes the CSS-Modules pattern in this repo, and `AGENTS.md` calls for CSS Modules over inline styles in new code. A new `pages/fitness/index.module.css` gets a real `@media` breakpoint with no extra JS. Fitness's other inline styles (unrelated to sizing) are left untouched — this is not a full-file rewrite.
- **KTD2. Viewport meta tag (R7) is added once, inside the shared `pwaMetaTags()` helper** (`components/layout.jsx`), not duplicated per page. Fitness already calls `pwaMetaTags()` and inherits the tag for free. Random currently renders no `<Head>` at all and needs one added that calls `pwaMetaTags()`. Volta also lacks the tag but is out of scope (R6) and is not touched.
- **KTD3. Breakpoint = 768px, random's ceiling = 700px, touch-target minimum = 44px — fixed values, not tunable placeholders.** Resolves the Product Contract's "tunable during implementation" language and the deferred Outstanding Question ("shared convention or per-app"): the same three literal numbers are used in both `pages/random/index.module.css` and the new `pages/fitness/index.module.css`. No shared CSS-variable/PostCSS-custom-media indirection — this repo's Next config has no such tooling configured, and duplicating three numbers across two small files is simpler than adding it for two call sites.
- **KTD4. Inline styles that collide with the breakpoint must move into the CSS module, not stay inline.** Fitness's weight/repetitions inputs and the top stat card currently set `padding`/sizing via the `style` prop. Inline styles win over external stylesheet rules for the same CSS property, so any `@media` rule targeting `padding` or `min-height` on those elements would be silently ignored if the inline `style` prop keeps setting them. U3 moves only the colliding properties (padding, min-height) into CSS module classes; non-conflicting inline styles (color, layout `display`/`gridTemplateColumns`) stay as-is.

### Implementation Constraints

- Static export (Next.js `output: 'export'`) — no server-side responsive logic; the breakpoint must be pure CSS (`@media`), not `getServerSideProps`-based device detection.
- `next-pwa` service worker caches `/random` with a `CacheOnly` strategy (`next.config.js`) — a CSS Modules change to `pages/random/index.module.css` ships as a new build hash, so the existing precache-manifest injection (`scripts/patch-sw-precache.js`) picks it up automatically; no SW config change needed.

---

## Implementation Units

### U1. Add viewport meta tag to both apps

**Goal:** both apps set `<meta name="viewport" content="width=device-width, initial-scale=1">` so the breakpoint can key off real device width, without changing current phone-width rendering (R7, R5).

**Requirements:** R7, R5

**Dependencies:** none — lands first; U2 and U3 depend on it since their `@media` rules assume a correct device-width viewport.

**Files:**
- `components/layout.jsx` — add the viewport `<meta>` inside `pwaMetaTags()`
- `pages/random/index.jsx` — add a `<Head>` element that calls `pwaMetaTags(basePath, {...})`, mirroring `pages/fitness/index.jsx`'s existing usage
- `components/layout.test.js` (new) — test file for `pwaMetaTags()`
- `pages/random/index.test.jsx` (new) — test file for the page's `<Head>` output

**Approach:** Random currently renders zero PWA meta tags (no manifest link, no icons) — do not add the full `pwaMetaTags()` set of tags/icons as new scope; only confirm the viewport meta renders once `pwaMetaTags()` is called. Reuse random's existing icon/manifest naming pattern (`random-manifest.json`, `random-launchericon`) only if a manifest file for random already exists; if it does not, pass minimal/placeholder values so the call doesn't reference nonexistent assets, and note that as a residual gap rather than expanding scope.

**Test scenarios:**
- Happy path: rendering `pwaMetaTags()`'s output includes a `meta[name="viewport"]` element with `content="width=device-width, initial-scale=1"`.
- Happy path: rendering the random page's `<Head>` includes the same viewport meta tag.
- Regression: fitness page's existing `pwaMetaTags()` call still renders its pre-existing tags (app name, icons) unchanged, in addition to the new viewport tag.

**Verification:** `npm test` passes for the two new test files; manual check per the doc's Success Criteria that phone-width rendering is visually unchanged after this lands.

---

### U2. Random app: widen container and touch targets above the breakpoint

**Goal:** above 768px, `.tabs` widens from its 320px cap to a 700px ceiling, and interactive controls scale to a 44px touch-target minimum (R1, R2, R3).

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- `pages/random/index.module.css` — add an `@media (min-width: 768px)` block

**Approach:** Add one `@media (min-width: 768px)` block at the end of the existing stylesheet (per KTD3's fixed values):
- `.tabs`: `max-width: 700px` (overrides the existing `max-width: 320px`).
- `.tab`, `.rollButton`, `.boundInput`, `.settingInput`, `.choiceWeightInput`, `.choiceDelete`: `min-height: 44px` (and `min-width: 44px` for `.choiceDelete`, currently a 32px circle).
- No structural changes — `.tabList`, `.container`, `.boundsRow`, `.choicesList` keep their existing `display`/`flex` shape; only sizing changes. This preserves R3 (tabbed, single-column, no dual-pane).

**Test scenarios:**
- Manual/visual (jsdom does not evaluate `@media` or real layout, so this is not automatable — see Success Criteria): at 768px+ viewport width, `.tabs` measures ~700px wide, not 320px; roll button, tab targets, and weighted-choice row controls each measure at least 44px in their touch dimension; below 768px, the page is pixel-identical to before this unit.
- Regression: dice-roller and weighted-choices tabs still switch correctly above the breakpoint (existing `TabList`/`TabPanel` behavior untouched).

**Verification:** Manual check on a real iPad (portrait ≥ 768px CSS width) and in browser devtools at the 768px boundary, per the doc's Success Criteria.

---

### U3. Fitness app: widen result grid and inputs above the breakpoint

**Goal:** above 768px, the weight/repetitions inputs and the top stat-card grid widen and reach a 44px touch-target minimum, within the existing 960px page cap (R4).

**Requirements:** R4

**Dependencies:** U1

**Files:**
- `pages/fitness/index.module.css` (new)
- `pages/fitness/index.jsx` — add `className` to the weight input, repetitions input, and the top "Estimated 1RM" stat-card `<div>`; remove the inline `padding` from those three elements per KTD4 (moved into the module so the `@media` override isn't shadowed by inline styles)

**Approach:** New module with:
- A base class per touched element carrying today's current padding value (unchanged look below the breakpoint) — this is a straight move of the existing inline `padding` value, not a visual change.
- One `@media (min-width: 768px)` block: `min-height: 44px` on the weight/repetitions input classes; wider `padding`/`gap` on the stat-card class.
- Everything else in `pages/fitness/index.jsx` (results-table grid, colors, borders) stays inline and untouched — this unit only touches the three elements named above.

**Test scenarios:**
- Manual/visual (not automatable in jsdom — see Success Criteria): below 768px, the page renders identically to before this unit; above 768px, the weight/repetitions inputs measure at least 44px tall, and the "Estimated 1RM" stat card has visibly more padding/breathing room, all within the existing 960px `<main>` cap.
- Regression: the calculation logic (1RM estimate, rep-max table, percentage table) is unaffected — this unit only changes CSS classes/padding, no JS logic.

**Verification:** Manual check on a real iPad and at the 768px devtools boundary, per the doc's Success Criteria. `npm test` still passes for `lib/epley.test.js` (unaffected calculation logic).

---

## Verification Contract

- `npm test` (vitest) — must pass, including the two new test files from U1. No new test infra required; existing `vitest.config.js` / RTL setup covers component rendering tests.
- `npm run lint` — must pass (Airbnb ESLint config); CI does not gate on lint per `AGENTS.md`, but keep it clean.
- `npm run build` — must succeed (`next build` + static export + SW precache injection), confirming no build-time regression from the new `pages/fitness/index.module.css` or the `pages/random/index.jsx` `<Head>` addition.
- Manual device verification (not automatable — see each unit's Test scenarios and the Product Contract's Success Criteria): real iPad portrait/landscape check for U2/U3, and a real phone-width check confirming U1 didn't change phone rendering.

## Definition of Done

- U1, U2, U3 all landed; `npm test`, `npm run lint`, `npm run build` all pass.
- Manual iPad check (portrait + landscape) confirms: random's container reaches 700px (not 320px), fitness's touched elements are visibly widened within the 960px cap, and touched interactive controls measure ≥44px.
- Manual phone-width check confirms R7's viewport tag introduced no visible change below 768px, on both apps.
- No dead-end/experimental CSS left in either stylesheet from exploring the breakpoint values.
