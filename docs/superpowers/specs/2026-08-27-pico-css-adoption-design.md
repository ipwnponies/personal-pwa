# Pico CSS Adoption

## Context

The app has no CSS component library — each page hand-rolls its own CSS Module, plus a shared `styles/utils.module.css` with Tailwind-ish utility classes (`heading2Xl`, `list`, `lightText`, etc.) used by the `Layout`-wrapped pages. Evaluated Flowbite (Tailwind-based, ships prebuilt JS components) vs Pico CSS (classless, styles native HTML elements, zero JS, zero build step) against the current codebase and near-future feature ideas per page (see prior brainstorming session). Decision: **Pico CSS**, delivered via `@picocss/pico` npm package (not CDN) so it's bundled by Next and precached by the existing service worker for offline use, with Pico's `prefers-color-scheme` auto dark/light behavior left on (no `data-theme` pin).

Rationale: Pico covers the concrete gaps identified (native `<dialog>` for confirms, switch-role checkboxes, `<details>`/`<summary>` accordions, form/table defaults) at zero adoption cost, and the one identified gap (badge/pill — see Volta) is small enough to hand-roll in `utils.module.css` rather than justifying a Tailwind/Flowbite migration for an 8-page app where ~half the pages (doodle, aquarium) are canvas/custom UI that neither library would touch anyway.

## Decomposition

Full styling refactor spans every page, each with its own documented conventions (`.claude/rules/*.md`). Sequenced as independent sub-projects, each with its own implementation pass:

1. **Foundation** (this spec) — install + wire Pico, refactor the `Layout`-wrapped pages (home, settings, posts, `posts/[id]`).
2. **volta** — inline `colour` status map/spans → Pico-styled elements or hand-rolled badge.
3. **fitness** — form/table/card CSS → Pico form/table styling, preserving swipe-number and row-highlight behavior.
4. **random** — `GroupHeader` accordion → native `<details>`/`<summary>`; tabs stay on `react-tabs` (Pico has no tabs component).
5. **doodle / aquarium** — audit only; canvas/div-based custom UI has no standard-element equivalent for Pico to replace. Confirm the global Pico import causes no visual regression.

This spec covers **sub-project 1 only**. Later sub-projects get their own spec/plan when picked up.

## Sub-project 1: Foundation

### Scope boundary

`components/layout.jsx` wraps exactly 4 routes: `pages/index.jsx`, `pages/settings.jsx`, `pages/posts/[id].jsx`, and (via `Layout`) nothing else — `posts/index` doesn't exist separately, blog listing lives on `pages/index.jsx`. `styles/utils.module.css` is used only by `layout.jsx` and these pages. No other page (fitness, random, doodle, aquarium, volta) imports `Layout` or `utils.module.css`, so this sub-project cannot regress them structurally — only the global Pico import (element-level defaults) is a shared risk surface, addressed by the spot-check in Testing.

### Architecture

Pico becomes the base element-styling layer:

- `pages/_app.jsx` imports `@picocss/pico/css/pico.min.css` **before** `../styles/global.css`, so `global.css`'s existing overrides (link color, margin/box-sizing reset, img sizing) keep winning the cascade on equal-specificity clashes.
- Pico v2.1.1 mixes `:where()` (zero-specificity) resets with plain element selectors (specificity 0-0-1) for typographic defaults (headings, paragraphs, lists, tables, links, buttons). A CSS-Module class (specificity 0-1-0) always outranks Pico's element selectors for any property that class declares; a property the class does NOT declare still falls through to Pico's element-level default — see `lib/usePageBackground.js`'s paired background/text-color fix for a concrete case where this mattered.

### Changes

- `pages/_app.jsx` — add the Pico import.
- `styles/utils.module.css` — remove classes with a direct Pico equivalent: `heading2Xl`, `headingXl`, `headingLg`, `headingMd`, `list`, `listItem`, `lightText`. Keep `borderCircle`, `colorInherit`, `padding1px` (no native-element equivalent).
- `components/layout.jsx` — replace `utilStyles.heading2Xl` (home avatar heading) and `utilStyles.headingLg` (non-home avatar heading) with plain `<h1>`/`<h2>`, relying on Pico's heading defaults. Keep `borderCircle`/`colorInherit` usage as-is.
- `pages/index.jsx` — replace `utilStyles.headingMd`/`headingLg`/`list`/`listItem`/`lightText`/`padding1px` wrapper classes with plain `<section>`/`<h2>`/`<ul>`/`<li>`/`<small>`; `<button>`-equivalent links stay as `<a>`/`Link` (Pico's nav/link styling applies automatically).
- `pages/settings.jsx` — no class usage to remove today; the existing plain `<button type="button">` now gets Pico's native button styling for free, no code change required beyond the global import.
- `pages/posts/[id].jsx` — replace `utilStyles.headingXl`/`lightText` with plain `<h1>`/`<small>`.

### Non-goals

- No badge/toast/pill component (out of scope for this sub-project; hand-rolled later if/when Volta or another page needs one).
- No `<dialog>`-based confirm flows yet (future feature work, not part of adopting the base library).
- No changes to fitness/random/doodle/aquarium/volta (later sub-projects).
- No dark-mode override — Pico's `prefers-color-scheme` auto behavior is accepted as-is per explicit decision.

### Testing

- `npm run build` — confirm clean build with the new dependency and CSS import.
- Manual visual check (`npm run dev`) of the 4 affected routes (`/`, `/settings`, `/posts/[id]` for at least one post) for correct heading/list/button/link rendering under Pico.
- Spot-check the 5 unaffected routes (fitness, random, doodle, aquarium, volta) for zero visual regression from the global Pico import landing on their plain/unstyled elements.
