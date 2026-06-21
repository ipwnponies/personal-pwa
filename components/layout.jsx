import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import PropTypes from 'prop-types';

import styles from './layout.module.css';
import utilStyles from '../styles/utils.module.css';

const name = 'ipwnponies';
export const siteTitle = 'Next.js Sample Website';
const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : '')
).replace(/\/+$/, '');

const withSiteUrl = (path = '/', basePath = '') => {
  const ensuredPath = (path || '/').startsWith('/') ? path || '/' : `/${path}`;

  if (siteUrl) return `${siteUrl}${ensuredPath}`;
  return `${basePath}${ensuredPath}`;
};

function metadata(basePath) {
  return (
    <>
      <meta name="application-name" content="PWA App" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="PWA App" />
      <meta name="description" content="Best PWA App in the world" />
      <meta name="format-detection" content="telephone=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="msapplication-TileColor" content="#2B5797" />
      <meta name="msapplication-tap-highlight" content="no" />
      <meta name="theme-color" content="#000000" />

      <link
        rel="apple-touch-icon"
        sizes="152x152"
        href={`${basePath}/icons/apple-touch-icon-152x152.png`}
      />
      <link
        rel="apple-touch-icon"
        sizes="167x167"
        href={`${basePath}/icons/apple-touch-icon-167x167.png`}
      />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href={`${basePath}/icons/apple-touch-icon-180x180.png`}
      />
      <link rel="apple-touch-icon" href={`${basePath}/icons/apple-touch-icon.png`} />

      <link rel="icon" type="image/png" sizes="48x48" href={`${basePath}/icons/android-launchericon-48-48.png`} />
      <link rel="icon" type="image/png" sizes="72x72" href={`${basePath}/icons/android-launchericon-72-72.png`} />
      <link rel="icon" type="image/png" sizes="96x96" href={`${basePath}/icons/android-launchericon-96-96.png`} />
      <link rel="icon" type="image/png" sizes="144x144" href={`${basePath}/icons/android-launchericon-144-144.png`} />
      <link rel="icon" type="image/png" sizes="192x192" href={`${basePath}/icons/android-launchericon-192-192.png`} />
      <link rel="icon" type="image/png" sizes="512x512" href={`${basePath}/icons/android-launchericon-512-512.png`} />
      <link rel="manifest" href={`${basePath}/manifest.json`} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css?family=Roboto:300,400,500"
      />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:url" content={withSiteUrl('', basePath)} />
      <meta name="twitter:title" content="PWA App" />
      <meta name="twitter:description" content="Best PWA App in the world" />
      <meta
        name="twitter:image"
        content={withSiteUrl('/icons/apple-touch-icon.png', basePath)}
      />
      <meta name="twitter:creator" content="@DavidWShadow" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="PWA App" />
      <meta property="og:description" content="Best PWA App in the world" />
      <meta property="og:site_name" content="PWA App" />
      <meta property="og:url" content={withSiteUrl('', basePath)} />
      <meta
        property="og:image"
        content={withSiteUrl('/icons/apple-touch-icon.png', basePath)}
      />
    </>
  );
}

export default function Layout({ children, home }) {
  const { basePath } = useRouter();
  return (
    <div className={styles.container}>
      <Head>
        <link
          rel="icon"
          type="image/png"
          href={`${basePath}/icons/android-launchericon-48-48.png`}
        />
        <meta
          name="description"
          content="Learn how to build a personal website using Next.js"
        />
        <meta
          name="og:image"
          content={`https://og-image.vercel.app/${encodeURI(
            siteTitle,
          )}.png?theme=light&md=0&fontSize=75px&images=https%3A%2F%2Fassets.vercel.com%2Fimage%2Fupload%2Ffront%2Fassets%2Fdesign%2Fnextjs-black-logo.svg`}
        />
        <meta name="og:title" content={siteTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover"
        />
        {metadata(basePath)}
      </Head>
      <header className={styles.header}>
        {home ? (
          <>
            <img
              src={`${basePath}/images/profile.jpg`}
              className={utilStyles.borderCircle}
              height={144}
              width={144}
              alt={name}
              loading="eager"
            />
            <h1 className={utilStyles.heading2Xl}>{name}</h1>
          </>
        ) : (
          <>
            <Link href="/">
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a>
                <img
                  src={`${basePath}/images/profile.jpg`}
                  className={utilStyles.borderCircle}
                  height={108}
                  width={108}
                  alt={name}
                  loading="eager"
                />
              </a>
            </Link>
            <h2 className={utilStyles.headingLg}>
              <Link href="/">
                {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                <a className={utilStyles.colorInherit}>{name}</a>
              </Link>
            </h2>
          </>
        )}
      </header>
      <main>{children}</main>
      {!home && (
        <div className={styles.backToHome}>
          <Link href="/">
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a>⬅ Back to home</a>
          </Link>
        </div>
      )}
    </div>
  );
}
/* eslint-disable react/forbid-prop-types */
Layout.propTypes = {
  children: PropTypes.node.isRequired,
  home: PropTypes.bool,
};

Layout.defaultProps = {
  home: false,
};
/* eslint-enable react/forbid-prop-types */
