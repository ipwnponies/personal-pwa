# PWA Fixes

- Add a real `public/icons/favicon.ico` or update `<Head>` to point at an existing favicon to avoid 404s.
- Provide `/icons/browserconfig.xml` (and related Windows tiles) or remove the `msapplication-config` meta tag to stop broken requests.
- Replace the placeholder Open Graph/Twitter URLs in `components/layout.jsx` with real domain URLs and ensure `apple-touch-icon.png` / `android-chrome-192x192.png` exist before referencing them.
- Generate platform-appropriate Apple touch icons instead of reusing the Android launcher PNGs to meet Apple’s expectations.
- Update `next.config.js` to disable `next-pwa` in development (e.g., `disable: process.env.NODE_ENV === 'development'`) to prevent stale SW caches during local work.
