const withPWA = require('next-pwa');
const defaultRuntimeCaching = require('next-pwa/cache');

module.exports = withPWA({
  pwa: {
    dest: 'public',
    // cacheOnFrontEndNav: true,
    // runtimeCaching: [
    //   {
    //     urlPattern: /\/posts\/ssg-ssr/,
    //     method: "GET",
    //     handler: "CacheOnly",
    //     options: {
    //       cacheName: "todoApp-api",
    //       expiration: {
    //         maxEntries: 64,
    //         maxAgeSeconds: 24 * 60 * 60, // 24 hours
    //       },
    //     },
    //   },
    //   ...defaultRuntimeCaching,
    // ],
  },
});
