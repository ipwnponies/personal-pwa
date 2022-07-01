import Head from 'next/head';
import React from 'react';
import Layout from '../components/layout';

export default function offline() {
  return (
    <Layout home>
      <Head>
        <title>Offline</title>
      </Head>
      <p>We are offline</p>
    </Layout>
  );
}
