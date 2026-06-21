import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { siteTitle } from '../components/layout';

const resetCachesAndServiceWorkers = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
};

export default function SwReset() {
  const { basePath } = useRouter();
  const [status, setStatus] = useState('Resetting offline cache...');

  useEffect(() => {
    let cancelled = false;

    const runReset = async () => {
      try {
        await resetCachesAndServiceWorkers();
        if (!cancelled) {
          setStatus('Offline cache reset complete. Redirecting...');
          window.setTimeout(() => {
            window.location.replace(`${basePath}/`);
          }, 500);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(`Reset failed: ${error?.message || String(error)}`);
        }
      }
    };

    runReset();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: '2rem' }}>
      <Head>
        <title>{`Reset Cache | ${siteTitle}`}</title>
      </Head>
      <p>{status}</p>
    </main>
  );
}
