const unregisterServiceWorkers = () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
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
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      console.log('SW registered: ', registration);
    }).catch((registrationError) => {
      console.error('SW registration failed: ', registrationError);
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
};

export default registerServiceWorker;
