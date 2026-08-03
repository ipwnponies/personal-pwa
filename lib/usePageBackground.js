import { useEffect } from 'react';

// eslint-disable-next-line import/prefer-default-export
export function usePageBackground(color) {
  useEffect(() => {
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const previousHtmlBackground = htmlStyle.backgroundColor;
    const previousBodyBackground = bodyStyle.backgroundColor;

    htmlStyle.backgroundColor = color;
    bodyStyle.backgroundColor = color;

    return () => {
      htmlStyle.backgroundColor = previousHtmlBackground;
      bodyStyle.backgroundColor = previousBodyBackground;
    };
  }, [color]);
}
