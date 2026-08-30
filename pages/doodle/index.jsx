import Head from 'next/head';
import { useRouter } from 'next/router';
import React from 'react';
import DoodleCanvas from '../../components/doodle/DoodleCanvas';
import { pwaMetaTags } from '../../components/layout';
import { usePageBackground, PageThemeScript } from '../../lib/usePageBackground';
import styles from './index.module.css';

export default function DoodlePage() {
  const theme = usePageBackground('#fdfdfd');
  const { basePath } = useRouter();
  return (
    <>
      <Head>
        <PageThemeScript theme={theme} />
        {pwaMetaTags(basePath, {
          appName: 'Doodle',
          description: 'A simple tap-and-draw musical sandbox for young children',
          path: '/doodle',
          themeColor: '#fdfdfd',
        })}
        <title>Doodle</title>
      </Head>
      <main className={styles.main}>
        <DoodleCanvas />
      </main>
    </>
  );
}
