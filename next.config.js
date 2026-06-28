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

// Stopgap: pinned to Next 12 + next-pwa 5. next-pwa is unmaintained.
// TODO: migrate to Serwist (@serwist/next) to unpin Next.js.
module.exports = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  dynamicStartUrl: false,
  cacheStartUrl: false,
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
          maxAgeSeconds: 7 * 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    ...runtimeCaching,
  ],
})({
  basePath: process.env.PAGES_BASE_PATH || '',
  images: {
    unoptimized: true,
  },
});
