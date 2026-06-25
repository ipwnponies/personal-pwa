# Personal PWA

Next.js static-export PWA deployed to GitHub Pages.

## Stack

- Next.js with React 18
- JavaScript (not TypeScript)
- ESLint with Airbnb config + Prettier
- next-pwa for service worker

## Testing

- Framework: Vitest with jsdom environment
- Run: `npm test` (single run), `npm run test:watch` (watch mode)
- Test file pattern: `**/*.test.{js,jsx}`
- Place test files next to the source file they test (e.g., `lib/posts.test.js` for `lib/posts.js`)
- React component tests use @testing-library/react
- jest-dom matchers available (e.g., `toBeInTheDocument()`)
- Config: `vitest.config.js`, setup: `vitest.setup.js`

## Project Structure

- `pages/` — Next.js pages
- `components/` — React components
- `lib/` — Utility/data functions
- `worker/` — Service worker code
- `posts/` — Markdown blog posts
- `scripts/` — Build-time scripts
- `public/` — Static assets
