import Head from 'next/head';
import React, { useState } from 'react';
import Layout, { siteTitle } from '../components/layout';
import utilStyles from '../styles/utils.module.css';

const UPDATE_CHECK_TIMEOUT_MS = 10000;

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timerId = window.setTimeout(() => {
    reject(new Error('Update check timed out'));
  }, timeoutMs);

  promise
    .then((value) => {
      window.clearTimeout(timerId);
      resolve(value);
    })
    .catch((error) => {
      window.clearTimeout(timerId);
      reject(error);
    });
});

export default function Settings() {
  const [status, setStatus] = useState('');

  const checkForUpdates = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setStatus('Service workers are not available on this device.');
      return;
    }

    setStatus('Checking for updates...');

    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        setStatus('No installed app cache found. Open the app once in production first.');
        return;
      }

      const previousWaitingScript = registration.waiting?.scriptURL;
      await withTimeout(registration.update(), UPDATE_CHECK_TIMEOUT_MS);
      const refreshedRegistration = await navigator.serviceWorker.getRegistration('/');

      const hasFreshWorker = Boolean(
        refreshedRegistration?.installing
          || (refreshedRegistration?.waiting
            && refreshedRegistration.waiting.scriptURL !== previousWaitingScript)
      );

      if (hasFreshWorker) {
        setStatus('Update found. Applying update...');
        window.location.assign('/__sw-reset');
        return;
      }

      setStatus('No updates found.');
    } catch (error) {
      setStatus(`Unable to check for updates: ${error?.message || String(error)}`);
    }
  };

  return (
    <Layout>
      <Head>
        <title>{`Settings | ${siteTitle}`}</title>
      </Head>
      <section className={utilStyles.headingMd}>
        <h2 className={utilStyles.headingLg}>Settings</h2>
        <p>Keep your app up to date.</p>
        <p>
          <button type="button" onClick={checkForUpdates}>
            Check for updates
          </button>
        </p>
        {status ? <p>{status}</p> : null}
      </section>
    </Layout>
  );
}
