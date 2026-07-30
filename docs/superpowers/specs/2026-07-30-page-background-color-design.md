# Page Background Color Fix — Design

## Problem

`html`/`body` never get a `background-color` (`styles/global.css` only resets
`padding`/`margin`). Each page's own background (e.g. `.page` on
`pages/random/index.module.css`, `#1a1a2e`) is scoped to a `div` inside the
page, not to `html`/`body`. Combined with `viewport-fit=cover` in the
viewport meta tag (`components/layout.jsx:128`), this shows up as:

- A white border/frame around content on notched devices (status bar / home
  indicator / side insets render `body`'s default white, not the page's
  color).
- A white flash at the edges during elastic overscroll/rubber-band scrolling
  on iOS/Android.

Additionally, `public/manifest.json` (`theme_color` / `background_color` =
`#FFFFFF`) and the `theme-color` meta tag in `components/layout.jsx:46`
(`#000000`) disagree, so splash screen and OS chrome color are inconsistent.

## Scope

Bug fix only — no shared design-system/token work. `random` is a
self-contained sub-app with its own dark theme; other pages (fitness,
doodle, home) keep their existing light/neutral backgrounds independently.

## Fix

1. **Per-page `html`/`body` background ownership.** Each page sets
   `html`/`body` background to match its own page background on mount, and
   reverts it on unmount, rather than relying on a single global default.
   - `pages/random/index.jsx`: set to `#1a1a2e` (matches `.page` background
     in `pages/random/index.module.css`).
   - Other pages (fitness, doodle, home/Layout-based pages): set to their
     own existing background so they're consistent too, even though they
     don't currently show the bug as visibly (mostly white already).
   - `styles/global.css` is left as-is — no shared/global default
     `background-color` added there, since ownership is per-page.

2. **Align manifest and meta theme colors.** Update
   `public/manifest.json` (`theme_color`, `background_color`) and the
   `theme-color` meta tag in `components/layout.jsx` to a single consistent
   value for the main site (light pages). `random`'s own dark background is
   handled independently by fix #1 and is not driven by manifest/meta.

3. **No safe-area padding changes.** `viewport-fit=cover` stays; the
   background-color fix alone is sufficient since the safe-area regions will
   now render the correct page color instead of white. No
   `env(safe-area-inset-*)` padding is added to page containers.

## Out of scope

- Any shared color palette, CSS variables, or design tokens across pages.
- Any layout/spacing unification across fitness/random/doodle/home.
- Safe-area padding for notch/home-indicator content insets.
