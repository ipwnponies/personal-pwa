---
paths:
  - "pages/doodle/**"
  - "components/doodle/**"
---

# Doodle

Tap-and-draw musical sandbox for young children. Already split cleanly: page is a thin wrapper, all behavior lives in `components/doodle/`.

## Layout

- `pages/doodle/index.jsx` — thin page shell (Head/meta, background color via `usePageBackground`), renders `<DoodleCanvas />`. Keep it thin; new behavior belongs in `components/doodle/`, not here.
- `components/doodle/DoodleCanvas.jsx` — canvas surface, pointer/touch handling, orchestrates strokes and shapes.
- `components/doodle/Stroke.jsx` — freehand line rendering.
- `components/doodle/Shape.jsx` — discrete shape stamps.
- `components/doodle/doodle.module.css` — component-scoped styles.
- Tests co-located: `DoodleCanvas.test.jsx`, `Shape.test.jsx`.

## Conventions

- This is the reference pattern for other mini-apps if they get split out of their monolithic page files — page stays presentational/thin, interaction and rendering logic moves to `components/<app>/`.
- Target audience is young children: prefer large touch targets, forgiving gesture thresholds, and immediate visual/audio feedback over precision-oriented interactions.
