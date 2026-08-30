# Pico CSS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@picocss/pico` into the app as the base element-styling layer, and refactor the four `Layout`-wrapped pages (home, settings, posts, `posts/[id]`) off their hand-rolled `utils.module.css` heading/list/text utilities onto Pico's native element styling.

**Architecture:** Pico's CSS is imported once in `pages/_app.jsx`, before `styles/global.css`, so global.css's existing overrides keep winning the cascade. Pico v2.1.1 mixes zero-specificity `:where()` resets with plain element selectors (0-0-1) for typographic defaults, so a CSS-Module class outranks Pico for any property it declares, but bare/unclassed tags — and any property a class doesn't declare — fall through to Pico's defaults. Each affected page drops a utility `className` and either renders a plain semantic tag or keeps the one or two utility classes (`borderCircle`, `colorInherit`, `padding1px`) that have no native-element equivalent.

**Tech Stack:** Next.js 14 (pages router), React 18, CSS Modules, Vitest + Testing Library, `@picocss/pico` (new dependency).

**Spec:** `docs/superpowers/specs/2026-08-27-pico-css-adoption-design.md`

## Global Constraints

- Package manager: npm (repo uses `package-lock.json`).
- Pico delivered via npm package `@picocss/pico`, CSS imported from `@picocss/pico/css/pico.min.css` — not CDN.
- No `data-theme` override — Pico's `prefers-color-scheme` auto light/dark behavior is left on, per explicit decision.
- Scope is exactly the four `Layout`-wrapped routes (`/`, `/settings`, `/posts/[id]`) plus `components/layout.jsx` and `styles/utils.module.css`. Do not touch fitness/random/doodle/aquarium/volta pages or their CSS — out of scope for this plan.
- Keep in `styles/utils.module.css`: `borderCircle`, `colorInherit`, `padding1px` (no native-element Pico equivalent). Remove: `heading2Xl`, `headingXl`, `headingLg`, `headingMd`, `list`, `listItem`, `lightText`.
- No new dialog/switch/badge/toast components — out of scope (future sub-projects).

---

## File Structure

- **Modify `package.json` / `package-lock.json`** — add `@picocss/pico` dependency (via `npm install`).
- **Modify `pages/_app.jsx`** — add the Pico CSS import.
- **Modify `components/layout.jsx`** — drop `heading2Xl`/`headingLg` utility classes, keep `borderCircle`/`colorInherit`.
- **Modify `pages/index.jsx`** — drop `headingMd`/`headingLg`/`list`/`listItem`/`lightText` utility classes, keep `padding1px` on the blog section.
- **Modify `pages/settings.jsx`** — drop `headingMd`/`headingLg` utility classes, drop the now-unused `utilStyles` import.
- **Modify `pages/posts/[id].jsx`** — drop `headingXl`/`lightText` utility classes (byline `<div>` becomes `<small>`, matching the home page's blog-list byline pattern), drop the now-unused `utilStyles` import.
- **Modify `styles/utils.module.css`** — remove the six now-unused classes, keep the three still in use.

No test files change: `components/layout.test.jsx` asserts on `pwaMetaTags` HTML output and background-color side effects only, neither of which touches the classes being removed. No test files exist for `index`/`settings`/`posts/[id]`.

---

### Task 1: Install and wire Pico CSS

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Modify: `pages/_app.jsx`

**Interfaces:**
- Produces: Pico's global element styles applied to every page via `pages/_app.jsx`'s CSS imports. No exported symbols — this is a side-effecting CSS import later tasks assume is present.

- [ ] **Step 1: Install the dependency**

Run: `npm install @picocss/pico`
Expected: `package.json` gains a `@picocss/pico` entry under `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Import Pico's CSS before global.css**

In `pages/_app.jsx`, change:

```jsx
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import PropTypes from 'prop-types';
import registerServiceWorker from '../components/server-worker';
import '../styles/global.css';
```

to:

```jsx
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import PropTypes from 'prop-types';
import registerServiceWorker from '../components/server-worker';
import '@picocss/pico/css/pico.min.css';
import '../styles/global.css';
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS (no test references the new import; this confirms nothing else broke).

- [ ] **Step 4: Run a production build**

Run: `npm run build`
Expected: Build succeeds with the new CSS import bundled.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json pages/_app.jsx
git commit -m "feat: wire Pico CSS as the base element styling layer"
```

---

### Task 2: Refactor `components/layout.jsx` onto Pico headings

**Files:**
- Modify: `components/layout.jsx:106-183`

**Interfaces:**
- Consumes: Pico's default `h1`/`h2` styling (from Task 1's import). `utils.module.css`'s `borderCircle`/`colorInherit` classes (unchanged, still exported from that file).
- Produces: `Layout` component keeps its existing exported shape (`default export Layout`, `siteTitle`, `pwaMetaTags` — unchanged); only its internal JSX changes.

- [ ] **Step 1: Replace the home-branch heading**

In `components/layout.jsx`, inside the `home ?` branch, change:

```jsx
<img
  src={`${basePath}/images/profile.jpg`}
  className={utilStyles.borderCircle}
  height={144}
  width={144}
  alt={name}
  loading="eager"
/>
<h1 className={utilStyles.heading2Xl}>{name}</h1>
```

to:

```jsx
<img
  src={`${basePath}/images/profile.jpg`}
  className={utilStyles.borderCircle}
  height={144}
  width={144}
  alt={name}
  loading="eager"
/>
<h1>{name}</h1>
```

- [ ] **Step 2: Replace the non-home-branch heading**

In the `else` branch, change:

```jsx
<h2 className={utilStyles.headingLg}>
  <Link href="/">
    {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
    <a className={utilStyles.colorInherit}>{name}</a>
  </Link>
</h2>
```

to:

```jsx
<h2>
  <Link href="/">
    {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
    <a className={utilStyles.colorInherit}>{name}</a>
  </Link>
</h2>
```

(`borderCircle` on the `<img>` in this branch is unchanged — only the heading class is dropped.)

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS — `components/layout.test.jsx`'s background-color and `pwaMetaTags` tests are unaffected by this change.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — no unused-import warnings (`utilStyles` is still used for `borderCircle`/`colorInherit`).

- [ ] **Step 5: Commit**

```bash
git add components/layout.jsx
git commit -m "refactor: use Pico's default heading styles in Layout"
```

---

### Task 3: Refactor `pages/index.jsx` onto Pico elements

**Files:**
- Modify: `pages/index.jsx:22-60`

**Interfaces:**
- Consumes: Pico's default `h2`/`p`/`a`/`ul`/`li`/`small` styling (from Task 1). `utilStyles.padding1px` (unchanged, still exported).
- Produces: `Home` component's exported shape unchanged (`default export Home`, same `getStaticProps`); only internal JSX changes.

- [ ] **Step 1: Drop the Apps section's wrapper class**

Change:

```jsx
<section className={utilStyles.headingMd}>
  <h2>Apps</h2>
```

to:

```jsx
<section>
  <h2>Apps</h2>
```

- [ ] **Step 2: Drop the blog section's heading and list utility classes, keep padding1px**

Change:

```jsx
<section className={`${utilStyles.headingMd} ${utilStyles.padding1px}`}>
  <h2 className={utilStyles.headingLg}>blog</h2>
  <ul className={utilStyles.list}>
    {allPostsData.map(({ id, date, title }) => (
      <li className={utilStyles.listItem} key={id}>
        <Link href={`/posts/${id}`}>{title}</Link>
        <br />
        <small className={utilStyles.lightText}>
          <Date dateString={date} />
        </small>
      </li>
    ))}
  </ul>
</section>
```

to:

```jsx
<section className={utilStyles.padding1px}>
  <h2>blog</h2>
  <ul>
    {allPostsData.map(({ id, date, title }) => (
      <li key={id}>
        <Link href={`/posts/${id}`}>{title}</Link>
        <br />
        <small>
          <Date dateString={date} />
        </small>
      </li>
    ))}
  </ul>
</section>
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS (no test covers `pages/index.jsx` directly; this confirms no cross-file breakage).

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — `utilStyles` import still used for `padding1px`.

- [ ] **Step 5: Commit**

```bash
git add pages/index.jsx
git commit -m "refactor: use Pico's default element styles on the home page"
```

---

### Task 4: Refactor `pages/settings.jsx` onto Pico elements

**Files:**
- Modify: `pages/settings.jsx:1-83`

**Interfaces:**
- Consumes: Pico's default `h2`/`p`/`button` styling (from Task 1).
- Produces: `Settings` component's exported shape unchanged; internal JSX changes and the now-unused `utilStyles` import is removed.

- [ ] **Step 1: Remove the now-unused utilStyles import**

Change:

```jsx
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import Layout, { siteTitle } from '../components/layout';
import utilStyles from '../styles/utils.module.css';
```

to:

```jsx
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import Layout, { siteTitle } from '../components/layout';
```

- [ ] **Step 2: Drop the section and heading utility classes**

Change:

```jsx
<section className={utilStyles.headingMd}>
  <h2 className={utilStyles.headingLg}>Settings</h2>
  <p>Keep your app up to date.</p>
```

to:

```jsx
<section>
  <h2>Settings</h2>
  <p>Keep your app up to date.</p>
```

(The `<button type="button">` below is unchanged — it already had no utility class, and now picks up Pico's default button styling for free.)

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — no unused-import warning for the removed `utilStyles` import.

- [ ] **Step 5: Commit**

```bash
git add pages/settings.jsx
git commit -m "refactor: use Pico's default element styles on the settings page"
```

---

### Task 5: Refactor `pages/posts/[id].jsx` onto Pico elements

**Files:**
- Modify: `pages/posts/[id].jsx:1-27`

**Interfaces:**
- Consumes: Pico's default `h1`/`small` styling (from Task 1).
- Produces: `Post` component's exported shape unchanged (`default export Post`, same `getStaticPaths`/`getStaticProps`); internal JSX changes and the now-unused `utilStyles` import is removed.

- [ ] **Step 1: Remove the now-unused utilStyles import**

Change:

```jsx
import Date from '../../components/date';
import Layout from '../../components/layout';
import { getAllPostIds, getPostData } from '../../lib/posts';
import utilStyles from '../../styles/utils.module.css';
```

to:

```jsx
import Date from '../../components/date';
import Layout from '../../components/layout';
import { getAllPostIds, getPostData } from '../../lib/posts';
```

- [ ] **Step 2: Drop the heading and byline utility classes**

Change:

```jsx
<h1 className={utilStyles.headingXl}>{postData.title}</h1>

<div className={utilStyles.lightText}>
  <Date dateString={postData.date} />
</div>
```

to:

```jsx
<h1>{postData.title}</h1>

<small>
  <Date dateString={postData.date} />
</small>
```

(Switching the byline from `<div>` to `<small>` matches the home page's blog-list byline pattern from Task 3, and gives it Pico's muted small-text styling instead of a hand-rolled color.)

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS — no unused-import warning for the removed `utilStyles` import.

- [ ] **Step 5: Commit**

```bash
git add "pages/posts/[id].jsx"
git commit -m "refactor: use Pico's default element styles on the post page"
```

---

### Task 6: Trim `styles/utils.module.css` to the classes still in use

**Files:**
- Modify: `styles/utils.module.css`

**Interfaces:**
- Consumes: none.
- Produces: `utils.module.css` exports only `borderCircle`, `colorInherit`, `padding1px` — the three classes `components/layout.jsx` and `pages/index.jsx` still import.

- [ ] **Step 1: Verify no remaining references to the classes being removed**

Run: `grep -rn "heading2Xl\|headingXl\|headingLg\|headingMd\|utilStyles\.list\b\|utilStyles\.listItem\|lightText" --include="*.jsx" pages components`
Expected: no matches (Tasks 2-5 already removed every usage).

- [ ] **Step 2: Trim the stylesheet**

Replace the full contents of `styles/utils.module.css` with:

```css
.borderCircle {
  border-radius: 9999px;
}

.colorInherit {
  color: inherit;
}

.padding1px {
  padding-top: 1px;
}
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Run a production build**

Run: `npm run build`
Expected: Build succeeds — confirms no remaining reference to a removed CSS Module class (a missing class would still build in Next/CSS Modules, since unresolved class names just resolve to `undefined`, so this build is a smoke check, not a proof; Step 1's grep is the real check).

- [ ] **Step 5: Commit**

```bash
git add styles/utils.module.css
git commit -m "refactor: trim utils.module.css to classes still in use"
```

---

### Task 7: Manual visual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Server starts on port 8080.

- [ ] **Step 2: Check the four affected routes render correctly under Pico**

Visit and eyeball each:
- `/` — "Apps" section links, blog list with byline dates, avatar image still circular.
- `/settings` — "Settings" heading, "Check for updates" button now has Pico's default button styling, status text appears/disappears correctly on click.
- `/posts/<any-slug-from-posts-directory>` — post title as `<h1>`, byline date as `<small>`, markdown body renders.
- Any non-home page (e.g. `/settings`) — confirm the non-home `Layout` header (smaller avatar + name link) still renders correctly.

- [ ] **Step 3: Spot-check the five unaffected routes for regressions**

Visit `/fitness`, `/random`, `/doodle`, `/aquarium`, `/volta` and confirm each looks unchanged from before this plan — Pico's global import should not visibly affect their CSS-Module-styled elements.

- [ ] **Step 4: Report result**

If every page in Steps 2-3 looks correct, the plan is complete — no further commit needed for this task (verification-only).
If a regression is found, note which route and element, then fix it as a follow-up task before considering the plan done.
