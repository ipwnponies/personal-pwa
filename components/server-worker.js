const unregisterServiceWorkers = () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    if (registrations.length === 0) {
      return;
    }
    registrations.forEach((registration) => {
      registration.unregister();
    });
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }
  }).catch((error) => {
    console.error('SW unregister failed: ', error);
  });
};

const registerServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    unregisterServiceWorkers();
    return;
  }

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((registrationError) => {
      console.error('SW register failed: ', registrationError);
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
};

export default registerServiceWorker;
