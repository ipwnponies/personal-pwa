const fs = require('fs');
const path = require('path');
const withPWA = require('next-pwa');
const defaultRuntimeCaching = require('next-pwa/cache');

const collectPrerenderEntries = (distDir) => {
  const prefix = process.env.PAGES_BASE_PATH || '';
  const manifestPath = path.join(distDir, 'prerender-manifest.json');
  const buildIdPath = path.join(distDir, 'BUILD_ID');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(buildIdPath)) return [];

  const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = [];
  const seen = new Set();

  const addEntry = (url) => {
    if (!url || url === '/' || url === '/404' || url === '/500' || url === '/__sw-reset') return;
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url: `${prefix}${url}`, revision: buildId });
  };

  const routes = manifest?.routes || {};
  Object.keys(routes).forEach((route) => {
    addEntry(route);
    addEntry(routes[route]?.dataRoute);
  });

  return entries;
};

const runtimeCaching = defaultRuntimeCaching.map((entry) => {
  if (entry.options?.cacheName !== 'others') return entry;
  return {
    ...entry,
    // Keep navigations fresh when the origin is up, but fail over quickly.
    handler: 'NetworkFirst',
    options: {
      ...(entry.options || {}),
      networkTimeoutSeconds: 1,
    },
  };
});

module.exports = withPWA({
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH || '',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Prefer static URLs for offline precache; avoid dynamic /_next/image variants.
    unoptimized: true,
  },
  pwa: {
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    // Avoid next-pwa's implicit start-url route so we can control "/" caching.
    dynamicStartUrl: false,
    cacheStartUrl: false,
    // cacheOnFrontEndNav: true,
    manifestTransforms: [
      async (manifestEntries, compilation) => {
        const distDir = compilation?.outputOptions?.path || path.join(process.cwd(), '.next');
        const extraEntries = collectPrerenderEntries(distDir);
        const seen = new Set(manifestEntries.map((entry) => entry.url));
        const merged = [
          ...manifestEntries,
          ...extraEntries.filter((entry) => !seen.has(entry.url)),
        ];
        return { manifest: merged, warnings: [] };
      },
    ],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => {
          if (url.origin !== self.location.origin) return false;
          const bp = self.location.pathname.replace(/\/sw\.js$/, '');
          return url.pathname === `${bp}/__sw-reset` || url.pathname === `${bp}/__sw-reset/`;
        },
        method: 'GET',
        handler: 'NetworkOnly',
        options: {},
      },
      // Cache only hashed Next assets (prod) while forcing non-hashed assets
      // (dev) to always hit the network so mode switching works on the same URL.
      {
        urlPattern: /\/_next\/webpack-hmr/i,
        method: 'GET',
        handler: 'NetworkOnly',
        options: {},
      },
      {
        urlPattern: /\/_next\/webpack/i,
        method: 'GET',
        handler: 'NetworkOnly',
        options: {},
      },
      {
        urlPattern: /\/_next\/static\/.+-[0-9a-f]{8,}\.(?:js|css)$/i,
        method: 'GET',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-static-hashed',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: /\/_next\/static\/.+\.(?:js|css)$/i,
        method: 'GET',
        handler: 'NetworkOnly',
        options: {},
      },
      {
        urlPattern: /\/random/,
        method: 'GET',
        handler: 'CacheOnly',
        options: {
          cacheName: 'random',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      ...runtimeCaching,
    ],
  },
});
