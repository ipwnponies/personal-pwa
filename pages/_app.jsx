import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import PropTypes from 'prop-types';
import registerServiceWorker from '../components/server-worker';
import '../styles/global.css';

export default function App({ Component, pageProps }) {
  const { basePath } = useRouter();
  useEffect(() => {
    registerServiceWorker(basePath);
  }, [basePath]);
  /* eslint-disable-next-line react/jsx-props-no-spreading */
  return <Component {...pageProps} />;
}

App.propTypes = {
  Component: PropTypes.elementType.isRequired,
  /* eslint-disable-next-line react/forbid-prop-types */
  pageProps: PropTypes.object.isRequired,
};
