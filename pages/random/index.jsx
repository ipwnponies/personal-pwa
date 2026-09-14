import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TabList, Tabs, Tab, TabPanel } from 'react-tabs';

import 'react-tabs/style/react-tabs.css';
import styles from './index.module.css';
import DiceRoll from './DiceRoll';
import WeightedChoices from './WeightedChoices';
import CoinFlip from './CoinFlip';
import MagicEightBall from './MagicEightBall';
import ShuffleList from './ShuffleList';
import CardDraw from './CardDraw';
import { SoundProvider, SoundToggle } from './SoundContext';
import { usePageBackground, PageThemeScript } from '../../lib/usePageBackground';
import { pwaMetaTags } from '../../components/layout';

const HORIZONTAL_SWIPE_THRESHOLD = 50;

function useHorizontalSwipe(onSwipeLeft, onSwipeRight) {
  const touchRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      decided: false,
      isHorizontal: false,
    };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchRef.current) return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    const dy = e.touches[0].clientY - touchRef.current.startY;

    if (!touchRef.current.decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      touchRef.current.decided = true;
      touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current) return;
      if (!touchRef.current.isHorizontal) {
        touchRef.current = null;
        return;
      }
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      touchRef.current = null;

      if (Math.abs(dx) < HORIZONTAL_SWIPE_THRESHOLD) return;
      if (dx > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    },
    [onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd };
}

const TAB_COUNT = 6;

export default function Random() {
  const theme = usePageBackground('#1a1a2e');
  const { basePath } = useRouter();
  const [tabIndex, setTabIndex] = useState(0);
  // Same pattern as highlightedRowRef in pages/fitness/index.jsx: one ref,
  // reassigned to whichever tab's label span is currently selected.
  const selectedTabRef = useRef(null);

  useEffect(() => {
    // Scroll the selected tab's parent <li> (the actual react-tabs tab
    // element) into view within the scrolling strip.
    selectedTabRef.current?.parentElement?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [tabIndex]);

  const swipeLeft = useCallback(() => {
    setTabIndex((i) => Math.min(i + 1, TAB_COUNT - 1));
  }, []);
  const swipeRight = useCallback(() => {
    setTabIndex((i) => Math.max(i - 1, 0));
  }, []);

  const pageSwipe = useHorizontalSwipe(swipeLeft, swipeRight);

  const stopTouchMovePropagation = useCallback((e) => e.stopPropagation(), []);

  return (
    <div
      className={styles.page}
      onTouchStart={pageSwipe.onTouchStart}
      onTouchMove={pageSwipe.onTouchMove}
      onTouchEnd={pageSwipe.onTouchEnd}
    >
      <Head>
        <PageThemeScript theme={theme} />
        {pwaMetaTags(basePath, { themeColor: '#1a1a2e', manifestPath: 'random-manifest.json' })}
        <style>{'html,body{background-color:#1a1a2e}'}</style>
      </Head>
      <SoundProvider>
        <SoundToggle />
        <Tabs
          className={styles.tabs}
          selectedIndex={tabIndex}
          onSelect={setTabIndex}
        >
          <TabList
            className={styles.tabList}
            // The tab strip now scrolls horizontally on its own (carousel).
            // Without this, a touch-drag here would also bubble to the
            // page-level swipe classifier in useHorizontalSwipe and flip
            // tabs underneath the scroll — same fix as .dragHandle in
            // WeightedChoices.jsx.
            onTouchMove={stopTouchMovePropagation}
          >
            {/*
              react-tabs' own Tabs component clones each <Tab> with its
              own `tabRef` prop (see UncontrolledTabs.js), which would
              silently override one passed here. Ref a plain span inside
              the label instead — see selectedTabRef above.
            */}
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 0 ? selectedTabRef : undefined}>Dice</span>
            </Tab>
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 1 ? selectedTabRef : undefined}>Choices</span>
            </Tab>
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 2 ? selectedTabRef : undefined}>Coin</span>
            </Tab>
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 3 ? selectedTabRef : undefined}>8-Ball</span>
            </Tab>
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 4 ? selectedTabRef : undefined}>Shuffle</span>
            </Tab>
            <Tab
              className={styles.tab}
              selectedClassName={styles.tabSelected}
            >
              <span ref={tabIndex === 5 ? selectedTabRef : undefined}>Cards</span>
            </Tab>
          </TabList>
          <TabPanel>
            <DiceRoll />
          </TabPanel>
          <TabPanel>
            <WeightedChoices />
          </TabPanel>
          <TabPanel>
            <CoinFlip />
          </TabPanel>
          <TabPanel>
            <MagicEightBall />
          </TabPanel>
          <TabPanel>
            <ShuffleList />
          </TabPanel>
          <TabPanel>
            <CardDraw />
          </TabPanel>
        </Tabs>
      </SoundProvider>
    </div>
  );
}
