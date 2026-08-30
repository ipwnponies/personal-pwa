import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

function expandHex(hex) {
  const stripped = hex.replace('#', '');
  if (stripped.length === 3) {
    return stripped.split('').map((c) => c + c).join('');
  }
  return stripped;
}

function isLightColor(hex) {
  const expanded = expandHex(hex);
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export function PageThemeScript({ theme }) {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html:
          `document.documentElement.setAttribute('data-theme','${theme}');` +
          "document.documentElement.setAttribute('data-theme-ssr','1');",
      }}
    />
  );
}

PageThemeScript.propTypes = {
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
};

export function usePageBackground(backgroundColor) {
  const theme = isLightColor(backgroundColor) ? 'light' : 'dark';

  useEffect(() => {
    const html = document.documentElement;
    const htmlStyle = html.style;
    const bodyStyle = document.body.style;
    const previousHtmlBackground = htmlStyle.backgroundColor;
    const previousBodyBackground = bodyStyle.backgroundColor;

    // If PageThemeScript's SSR'd inline script already set data-theme (marked by
    // data-theme-ssr), that value is this same page's own pre-hydration guess, not
    // genuine prior state left by something else. Treat it as "nothing was there"
    // so unmount doesn't restore a value this page itself invented.
    const wasSsrSet = html.hasAttribute('data-theme-ssr');
    const previousDataTheme = wasSsrSet ? null : html.getAttribute('data-theme');
    if (wasSsrSet) {
      html.removeAttribute('data-theme-ssr');
    }

    htmlStyle.backgroundColor = backgroundColor;
    bodyStyle.backgroundColor = backgroundColor;
    html.setAttribute('data-theme', theme);

    return () => {
      htmlStyle.backgroundColor = previousHtmlBackground;
      bodyStyle.backgroundColor = previousBodyBackground;
      if (previousDataTheme === null) {
        html.removeAttribute('data-theme');
      } else {
        html.setAttribute('data-theme', previousDataTheme);
      }
    };
  }, [backgroundColor, theme]);

  return theme;
}
