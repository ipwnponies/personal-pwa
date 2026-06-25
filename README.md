# Personal PWA

A personal progressive web app with mini-tools and a blog, built with Next.js and deployed to GitHub Pages. Designed for mobile-first, offline-capable use.

## Features

### Blog
Markdown-powered blog with static generation. Posts live in `posts/` and are rendered at build time.

### Fitness Calculator
RPE-based rep-max calculator using the Epley formula. Enter weight, reps (1–30), and reps-in-reserve (0–10) to get estimated 1RM, projected rep maxes, and percentage breakdowns.

### Dice Roller
Touch-optimized random number generator with swipe controls. Roll multiple dice with configurable min/max bounds. Supports tab-based navigation (swipe left/right to switch tabs).

### Volta EV Charging
Displays real-time EV charging station status from the Volta API. Shows station names, charger states, and availability counts. Requires a `NEXT_PUBLIC_VOLTA_API_KEY` environment variable.

### Offline Support
Full PWA with service worker caching. The app works offline after the first visit — pages are precached at build time and the `/random` route is cached for 24 hours. A settings page lets you check for updates and reset the cache.

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Install and Run

```sh
npm install
npm run dev
```

The dev server starts at `http://localhost:8080`.

### Build for Production

```sh
npm run build
```

Produces a static site in `./out`.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_VOLTA_API_KEY` | API key for Volta EV charging status |
| `NEXT_PUBLIC_SITE_URL` | Public origin for Open Graph/Twitter meta tags. Defaults to `http://localhost:8080` in dev; falls back to relative paths if unset in other environments |
| `PAGES_BASE_PATH` | Base path prefix for GitHub Pages deployment (set automatically by CI) |

## Deployment

Deployed automatically to GitHub Pages on push to `master` via GitHub Actions. The CI pipeline runs tests, builds the static export, and deploys.

## Attribution

This site starts from the official [Learn Next.js](https://nextjs.org/learn) tutorial template.

### Icon Guidance
Use the dedicated Apple touch icons in `public/icons/apple-touch-icon*.png` rather than reusing Android launcher assets. Android adaptive icons include transparent padding for system masking, which produces an undesired inset on iOS. Apple expects a full-bleed PNG without transparency.
