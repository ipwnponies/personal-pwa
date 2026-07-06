# Agents

Instructions for AI coding agents working on this codebase.

## Stack

- Next.js (latest) with React 18 — JavaScript, not TypeScript
- next-pwa 5.5.4 with Workbox for service worker and offline caching
- CSS Modules for component-scoped styles, `styles/global.css` for base styles
- ESLint with Airbnb config + Prettier
- Vitest with jsdom, React Testing Library, jest-dom matchers

## Project Structure

```
pages/           Next.js pages (file-based routing)
  fitness/       RPE calculator app
  random/        Dice roller app
  volta/         EV charger status app
  posts/[id].jsx Dynamic blog post route
components/      Shared React components (layout, date formatter, SW registration)
lib/             Utility modules (blog post parsing)
worker/          Custom service worker logic (start-URL caching)
scripts/         Build-time scripts (fs.rename patch, SW precache injection)
posts/           Markdown blog content (parsed with gray-matter + remark)
public/          Static assets, PWA manifest, generated sw.js
styles/          Global CSS and CSS Module utilities
.github/         CI workflows (test + deploy)
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server on port 8080 (PWA disabled) |
| `npm run build` | Production build + static export to `./out` |
| `npm test` | Run tests once (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint (Airbnb rules). Config is `.eslintrc.yml` (legacy format). CI does not gate on lint |

## Testing Conventions

- Test files go **next to the source file** they test: `lib/posts.test.js` for `lib/posts.js`
- **Exception: never co-locate test files under `pages/`.** Next.js's pages-router treats every file under `pages/` as a route candidate, including `.test.js`/`.test.jsx` files — the production build (`next build`) crashes trying to statically generate a page for them. Tests for files under `pages/` go in `__tests__/pages/`, mirroring the path (e.g. `pages/fitness/index.jsx` → `__tests__/pages/fitness/index.test.jsx`).
- File pattern: `**/*.test.{js,jsx}`
- React component tests use `@testing-library/react`
- jest-dom matchers available (`toBeInTheDocument()`, etc.)
- Config: `vitest.config.js`, setup: `vitest.setup.js`
- Tests must pass before deploy — CI gates on `npm test`

## Code Style

- JavaScript only — do not introduce TypeScript files
- Follow Airbnb ESLint rules (enforced via `.eslintrc.yml`)
- Use Prettier formatting (integrated via `eslint-config-prettier`)
- CSS Modules (`.module.css`) for component styles, co-located with the page or component they style (e.g., `pages/random/index.module.css`). Shared utilities go in `styles/`. Avoid inline styles in new code
- `prop-types` for React prop validation
- Functional components with hooks — no class components

## Build Pipeline Details

The build is non-standard. `npm run build` does three things in sequence:
1. `next build` with `scripts/patch-rename.js` required (patches `fs.rename` for cross-device moves)
2. `scripts/patch-sw-precache.js` injects prerendered routes into the Workbox precache manifest in `public/sw.js`
3. `next export` generates static HTML into `./out`

Do not modify build scripts without understanding the precache injection flow.

## PWA / Service Worker

- `next-pwa` generates `public/sw.js` at build time — do not manually edit this file
- Custom SW logic lives in `worker/index.js` (start-URL caching with stale-while-revalidate)
- PWA is disabled in development (`next.config.js` sets `disable: true` for dev)
- Runtime caching strategies vary by route: NetworkFirst for home, CacheOnly for `/random`, NetworkOnly for `/__sw-reset`
- `pages/settings.jsx` handles update detection; `pages/__sw-reset.jsx` handles cache clearing

## Adding Blog Posts

Posts are markdown files in `posts/`. Filename becomes the URL slug (e.g., `posts/my-post.md` → `/posts/my-post`).

Expected frontmatter:
```yaml
---
title: 'Post Title'
date: 'YYYY-MM-DD'
---
```

Both fields are expected — there is no validation, but missing `date` breaks sorting (`NaN` comparison) and missing `title` renders as undefined in the UI.

## CI/CD

- **Test workflow** (`.github/workflows/test.yml`): Runs on push and PR. Node 20, `npm ci`, `npm test`.
- **Deploy workflow** (`.github/workflows/nextjs.yml`): Runs on push to `master`. Tests, builds, exports, deploys to GitHub Pages. Sets `PAGES_BASE_PATH` from GitHub Pages config.
- Default branch is `master` (not `main`).
