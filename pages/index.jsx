import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import PropTypes from 'prop-types';
import Layout, { siteTitle } from '../components/layout';
import utilStyles from '../styles/utils.module.css';

import { getSortedPostsData } from '../lib/posts';
import Date from '../components/date';

export const getStaticProps = async () => {
  const allPostsData = getSortedPostsData();
  return { props: { allPostsData } };
};

export default function Home({ allPostsData }) {
  return (
    <Layout home>
      <Head>
        <title>{siteTitle}</title>
      </Head>
      <section className={utilStyles.headingMd}>
        <h2>Apps</h2>
        <p>
          <a href="_offline">offline mode</a>
        </p>
        <p>
          <Link href="/volta/">Volta App</Link>
        </p>
        <p>
          <Link href="/fitness/">Zero-to-Hero App</Link>
        </p>
        <p>
          <Link href="/random/">Random App</Link>
        </p>
        <p>
          <Link href="/settings">Settings</Link>
        </p>
      </section>

      <section className={`${utilStyles.headingMd} ${utilStyles.padding1px}`}>
        <h2 className={utilStyles.headingLg}>blog</h2>
        <ul className={utilStyles.list}>
          {allPostsData.map(({ id, date, title }) => (
            <li className={utilStyles.listItem} key={id}>
              <Link href={`/posts/${id}`}>{title}</Link>
              <br />
              <small className={utilStyles.lightText}>
                <Date dateString={date} />
              </small>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
Home.propTypes = {
  /* eslint-disable-next-line react/forbid-prop-types */
  allPostsData: PropTypes.array.isRequired,
};
