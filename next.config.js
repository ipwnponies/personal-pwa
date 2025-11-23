const withPWA = require('next-pwa');
const defaultRuntimeCaching = require('next-pwa/cache');

const runtimeCaching = defaultRuntimeCaching.map((entry) => {
  if (entry.options?.cacheName !== 'others') return entry;
  const { networkTimeoutSeconds, ...options } = entry.options || {};
  return {
    ...entry,
    handler: 'CacheFirst',
    options,
  };
});

module.exports = withPWA({
  pwa: {
    dest: 'public',
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
