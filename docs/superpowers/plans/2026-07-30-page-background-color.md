# Page Background Color Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the white border/flash on notch insets and elastic overscroll by giving each page ownership of `html`/`body` background color, and align the mismatched `theme-color` meta tag with the manifest.

**Architecture:** A single reusable hook, `usePageBackground(color)`, sets `document.documentElement.style.backgroundColor` and `document.body.style.backgroundColor` to a page-supplied literal color on mount and restores the prior inline value on unmount. Each page (or the shared `Layout` component, for pages that use it) calls the hook with its own existing background color — no shared token or palette is introduced, each call site keeps its own literal value. Separately, `pwaMetaTags`'s `theme-color` meta tag is corrected to match `public/manifest.json`'s existing `theme_color`/`background_color` (`#FFFFFF`).

**Tech Stack:** Next.js 14 (pages router), React 18, vitest + React Testing Library (jsdom). No new dependencies.

## Global Constraints

- No new dependencies; do not touch `package.json`/lockfile.
- Tests: `npx vitest run <path>` per task, full suite `npm test`. Lint: `npm run lint` (airbnb + prettier) must stay clean — no unused imports, no missing `propTypes` changes needed here since no new components are added.
- `styles/global.css` is not touched — no shared/global default `background-color` is added there; ownership stays per-page per the approved spec (`docs/superpowers/specs/2026-07-30-page-background-color-design.md`).
- `random` (`pages/random/index.jsx`) keeps its own dark theme (`#1a1a2e`) independently of the manifest/meta alignment, which only affects the main-site light pages.
- No `env(safe-area-inset-*)` padding changes — out of scope per the spec.
- When comparing `style.backgroundColor` values in tests, always derive the expected string by setting the same literal color on a scratch DOM node and reading it back (see Task 1), never hardcode an `rgb(...)`/hex string — jsdom's color-string normalization is an implementation detail we shouldn't couple tests to.

---

### Task 1: Shared `usePageBackground` hook

**Files:**
- Create: `lib/usePageBackground.js`
- Test: `lib/usePageBackground.test.js`

**Interfaces:**
- Produces: `usePageBackground(color: string) => void` — a hook with no return value. Call it once per mounted page/layout component, passing that page's own background color literal.

- [ ] **Step 1: Write the failing test**

```js
// lib/usePageBackground.test.js
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { usePageBackground } from './usePageBackground';

function TestComponent({ color }) {
  usePageBackground(color);
  return null;
}

function expectedBackground(color) {
  const probe = document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe('usePageBackground', () => {
  it('sets html and body background-color on mount', () => {
    render(<TestComponent color="#1a1a2e" />);

    const expected = expectedBackground('#1a1a2e');
    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });

  it('restores the previous background-color on unmount', () => {
    document.documentElement.style.backgroundColor = '#123456';
    document.body.style.backgroundColor = '#654321';
    const htmlBefore = document.documentElement.style.backgroundColor;
    const bodyBefore = document.body.style.backgroundColor;

    const { unmount } = render(<TestComponent color="#1a1a2e" />);
    unmount();

    expect(document.documentElement.style.backgroundColor).toBe(htmlBefore);
    expect(document.body.style.backgroundColor).toBe(bodyBefore);
  });

  it('leaves background-color empty on unmount when none was set before', () => {
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';

    const { unmount } = render(<TestComponent color="#1a1a2e" />);
    unmount();

    expect(document.documentElement.style.backgroundColor).toBe('');
    expect(document.body.style.backgroundColor).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/usePageBackground.test.js`
Expected: FAIL with something like `Failed to resolve import "./usePageBackground"` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```js
// lib/usePageBackground.js
import { useEffect } from 'react';

// eslint-disable-next-line import/prefer-default-export
export function usePageBackground(color) {
  useEffect(() => {
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const previousHtmlBackground = htmlStyle.backgroundColor;
    const previousBodyBackground = bodyStyle.backgroundColor;

    htmlStyle.backgroundColor = color;
    bodyStyle.backgroundColor = color;

    return () => {
      htmlStyle.backgroundColor = previousHtmlBackground;
      bodyStyle.backgroundColor = previousBodyBackground;
    };
  }, [color]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/usePageBackground.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/usePageBackground.js lib/usePageBackground.test.js
git commit -m "feat: add usePageBackground hook for html/body bg ownership"
```

---

### Task 2: Wire into the random page (`#1a1a2e`)

**Files:**
- Modify: `pages/random/index.jsx`
- Test: `__tests__/pages/random/index.test.jsx`

**Interfaces:**
- Consumes: `usePageBackground(color: string) => void` from `lib/usePageBackground.js` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `__tests__/pages/random/index.test.jsx` (new `describe` block, same file, same imports already present):

```js
describe('Random page background', () => {
  it('sets html and body background to the page theme color on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#1a1a2e';
    const expected = probe.style.backgroundColor;

    render(<Random />);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/random/index.test.jsx`
Expected: FAIL — `expect(received).toBe(expected)`, received `""`.

- [ ] **Step 3: Wire the hook into the page**

In `pages/random/index.jsx`, add the import alongside the existing ones and call the hook inside the default-exported component, before its `return`:

```js
// add near the top, with the other local imports
import { usePageBackground } from '../../lib/usePageBackground';
```

Find the component's top-level function (the one rendering `styles.page`, around line 344 per the existing `className={styles.page}` usage) and add the hook call as its first line:

```js
usePageBackground('#1a1a2e');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/random/index.test.jsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add pages/random/index.jsx __tests__/pages/random/index.test.jsx
git commit -m "fix: set html/body background for random page"
```

---

### Task 3: Wire into the fitness page (`#ffffff`)

**Files:**
- Modify: `pages/fitness/index.jsx`
- Test: `__tests__/pages/fitness/index.test.jsx`

**Interfaces:**
- Consumes: `usePageBackground(color: string) => void` from `lib/usePageBackground.js` (Task 1).

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('FitnessCalculator', ...)` block in `__tests__/pages/fitness/index.test.jsx` (it already imports `render` and `FitnessCalculator`):

```js
  it('sets html and body background to white on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#ffffff';
    const expected = probe.style.backgroundColor;

    render(<FitnessCalculator />);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/fitness/index.test.jsx`
Expected: FAIL — `expect(received).toBe(expected)`, received `""`.

- [ ] **Step 3: Wire the hook into the page**

In `pages/fitness/index.jsx`, add the import with the other local imports (near `import { pwaMetaTags } from '../../components/layout';`):

```js
import { usePageBackground } from '../../lib/usePageBackground';
```

Inside the default-exported page component function, add as its first line:

```js
usePageBackground('#ffffff');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/fitness/index.test.jsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add pages/fitness/index.jsx __tests__/pages/fitness/index.test.jsx
git commit -m "fix: set html/body background for fitness page"
```

---

### Task 4: Wire into the doodle page (`#fdfdfd`)

**Files:**
- Modify: `pages/doodle/index.jsx`
- Test: `__tests__/pages/doodle/index.test.jsx`

**Interfaces:**
- Consumes: `usePageBackground(color: string) => void` from `lib/usePageBackground.js` (Task 1).

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('DoodlePage', ...)` block in `__tests__/pages/doodle/index.test.jsx`:

```js
  it('sets html and body background to match the canvas stage on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#fdfdfd';
    const expected = probe.style.backgroundColor;

    render(<DoodlePage />);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/pages/doodle/index.test.jsx`
Expected: FAIL — `expect(received).toBe(expected)`, received `""`.

- [ ] **Step 3: Wire the hook into the page**

In `pages/doodle/index.jsx`, add the import with the other local imports (near `import { pwaMetaTags } from '../../components/layout';`):

```js
import { usePageBackground } from '../../lib/usePageBackground';
```

Inside the default-exported `DoodlePage` component function, add as its first line:

```js
usePageBackground('#fdfdfd');
```

(`#fdfdfd` matches the existing `.stage` background in `components/doodle/doodle.module.css:12`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/pages/doodle/index.test.jsx`
Expected: PASS (both tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add pages/doodle/index.jsx __tests__/pages/doodle/index.test.jsx
git commit -m "fix: set html/body background for doodle page"
```

---

### Task 5: Wire into `Layout` (`#ffffff`) and align `theme-color` with the manifest

**Files:**
- Modify: `components/layout.jsx`
- Test: `__tests__/components/layout.test.jsx` (new file)

**Interfaces:**
- Consumes: `usePageBackground(color: string) => void` from `lib/usePageBackground.js` (Task 1).
- Covers every page that renders through `Layout`: `pages/index.jsx`, `pages/settings.jsx`, `pages/posts/[id].jsx`.

- [ ] **Step 1: Write the failing tests**

```jsx
// __tests__/components/layout.test.jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Layout, { pwaMetaTags } from '../../components/layout';

vi.mock('next/router', () => ({
  useRouter: () => ({ basePath: '' }),
}));

describe('Layout background', () => {
  it('sets html and body background to white on mount', () => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = '#ffffff';
    const expected = probe.style.backgroundColor;

    render(<Layout>content</Layout>);

    expect(document.documentElement.style.backgroundColor).toBe(expected);
    expect(document.body.style.backgroundColor).toBe(expected);
  });
});

describe('pwaMetaTags', () => {
  it('sets theme-color to match the manifest theme_color/background_color (#ffffff)', () => {
    const { container } = render(<>{pwaMetaTags('/base')}</>);
    const themeColor = container.querySelector('meta[name="theme-color"]');
    expect(themeColor.getAttribute('content')).toBe('#ffffff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/layout.test.jsx`
Expected: FAIL — the background test fails with received `""`; the `theme-color` test fails with received `"#000000"`.

- [ ] **Step 3: Wire the hook into `Layout` and fix the meta tag**

In `components/layout.jsx`, add the import with the other local imports (near `import styles from './layout.module.css';`):

```js
import { usePageBackground } from '../lib/usePageBackground';
```

Change the `theme-color` meta tag inside `pwaMetaTags` (currently `components/layout.jsx:46`):

```diff
-      <meta name="theme-color" content="#000000" />
+      <meta name="theme-color" content="#ffffff" />
```

In the `Layout` component function (`components/layout.jsx:104-106`), add the hook call as its first line, before `const { basePath } = useRouter();`:

```js
export default function Layout({ children, home }) {
  usePageBackground('#ffffff');
  const { basePath } = useRouter();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/layout.test.jsx`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (no regressions in the pages that render through `Layout`: home, settings, blog posts).

- [ ] **Step 6: Commit**

```bash
git add components/layout.jsx __tests__/components/layout.test.jsx
git commit -m "fix: set Layout html/body background and align theme-color with manifest"
```

---

## Self-Review Notes

- **Spec coverage:** per-page `html`/`body` bg ownership (spec §Fix 1) → Tasks 1–5. Manifest/meta `theme-color` alignment (spec §Fix 2) → Task 5. No global.css default, no safe-area padding change (spec §Fix 3 / Out of scope) → explicitly called out in Global Constraints, no task touches `styles/global.css` or adds `env(safe-area-inset-*)`. `volta` page and `pages/_offline.jsx`/`pages/__sw-reset.jsx` are intentionally not touched — they have no background styling of their own today (inherit default), so there's no white-border bug to fix there.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type/name consistency:** every consumer imports the same `usePageBackground` named export from `lib/usePageBackground.js` and calls it with a single `color` string argument, matching Task 1's produced interface.

## Deviations from this plan (found during review, after Task 5)

A pre-merge review found this plan's Global Constraints wrongly assumed the
`theme-color` alignment "only affects the main-site light pages" —
`pwaMetaTags` is shared, so it also reached `random`. That, plus three
related gaps the plan didn't anticipate, were fixed on top of this plan's
5 tasks. Full detail in the spec's Addendum
(`docs/superpowers/specs/2026-07-30-page-background-color-design.md`):

- `pwaMetaTags` gained a `themeColor` option (default `#FFFFFF`) so
  `random`/`doodle` can override it instead of inheriting the light-page
  default.
- `pages/_app.jsx` now imports `styles/global.css` — it was never imported
  anywhere, so its `html`/`body` margin reset was dead code.
- `random` gained an inline `<style>` in its own `<Head>` for first-paint
  background (the hook only applies post-hydration) and a dedicated
  `public/random-manifest.json` for its installed-PWA splash color
  (it was inheriting the root manifest's white).
- `__tests__/components/layout.test.jsx` (Task 5) was merged into the
  pre-existing `components/layout.test.jsx` — this repo co-locates
  component tests; only `pages/` tests live under `__tests__/`.
