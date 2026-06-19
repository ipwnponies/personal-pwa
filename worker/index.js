const START_URL_CACHE = 'start-url';
const START_URL = '/';

const isStartUrlRequest = (requestUrl) => {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin && url.pathname === '/';
};

const getStartUrlCacheRequest = () => new Request(START_URL, { cache: 'no-store' });

const readStartUrlCache = async () => {
  const cache = await caches.open(START_URL_CACHE);
  return cache.match(getStartUrlCacheRequest());
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(START_URL_CACHE);
    const request = getStartUrlCacheRequest();
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
    } catch (error) {
      console.warn('SW install seed failed for start URL:', error);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !isStartUrlRequest(event.request.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(START_URL_CACHE);
    const cacheRequest = getStartUrlCacheRequest();
    const cached = await readStartUrlCache();

    event.waitUntil((async () => {
      try {
        const refreshed = await fetch(event.request, { cache: 'no-store' });
        if (refreshed && refreshed.ok) {
          await cache.put(cacheRequest, refreshed.clone());
        }
      } catch (error) {
        console.warn('SW refresh failed for start URL:', error);
      }
    })());

    if (cached) return cached;

    try {
      const network = await fetch(event.request, { cache: 'no-store' });
      if (network && network.ok) {
        event.waitUntil(cache.put(cacheRequest, network.clone()));
      }
      return network;
    } catch {
      return caches.match('/_offline');
    }
  })());
});
