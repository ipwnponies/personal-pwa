---
paths:
  - "pages/volta/**"
---

# Volta (EV Charger Status)

Fetches live charger/station status from the Volta GraphQL API and displays state per station on button press.

## Layout

- `pages/volta/index.jsx` — everything in one file: API call (`voltaApi`), status-to-color map (`colour`), display rendering (`displayStation`), and the page component (currently named `Foo`, not `Volta`).

## Conventions / known rough edges

- `NEXT_PUBLIC_VOLTA_API_KEY` is a build-time-inlined, client-visible env var — the key ships in the static export. This is an existing tradeoff (no backend to hide it behind in a fully static PWA), not something to silently "fix" by moving it server-side without discussing the approach.
- The locationNodeId is hardcoded to one site; this page has no multi-location support.
- No `pwaMetaTags`/`Head` usage and no CSS module, unlike other pages — this page predates or diverges from the shared page conventions in root `AGENTS.md`. Match existing sibling pages' conventions (Head/meta tags, CSS modules, `usePageBackground`) if doing substantial work here rather than extending the current ad hoc style.
- No offline caching strategy documented for this route in root `AGENTS.md`'s PWA section — confirm before assuming a caching behavior.
