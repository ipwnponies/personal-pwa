import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import registerServiceWorker from '../components/server-worker';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  /* eslint-disable-next-line react/jsx-props-no-spreading */
  return <Component {...pageProps} />;
}

App.propTypes = {
  Component: PropTypes.elementType.isRequired,
  /* eslint-disable-next-line react/forbid-prop-types */
  pageProps: PropTypes.object.isRequired,
};
