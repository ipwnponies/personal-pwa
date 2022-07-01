import React from 'react';
import PropTypes from 'prop-types';

export default function App({ Component, pageProps }) {
  /* eslint-disable-next-line react/jsx-props-no-spreading */
  return <Component {...pageProps} />;
}

App.propTypes = {
  Component: PropTypes.elementType.isRequired,
  /* eslint-disable-next-line react/forbid-prop-types */
  pageProps: PropTypes.object.isRequired,
};
