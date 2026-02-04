const withPWA = require('next-pwa');
const defaultRuntimeCaching = require('next-pwa/cache');

const runtimeCaching = defaultRuntimeCaching.map((entry) => {
  if (entry.options?.cacheName !== 'others') return entry;
  return {
    ...entry,
    // Keep navigations network-first so dev bundles can reliably load and
    // unregister service workers when switching between prod and dev.
    handler: 'NetworkFirst',
    options: {
      ...(entry.options || {}),
      networkTimeoutSeconds: 0.1,
    },
  };
});

module.exports = withPWA({
  pwa: {
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    dynamicStartUrl: false,
    // cacheOnFrontEndNav: true,
    runtimeCaching: [
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
