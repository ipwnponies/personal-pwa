import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
  path.join(__dirname, '../../../pages/random/index.module.css'),
  'utf8',
);

describe('random page tablet breakpoints', () => {
  it('defines a tablet-portrait breakpoint at 768px', () => {
    expect(css).toContain('@media (min-width: 768px)');
  });

  it('defines a tablet-landscape breakpoint at 1024px landscape', () => {
    expect(css).toContain('@media (min-width: 1024px) and (orientation: landscape)');
  });

  it('widens the tab container within the tablet-portrait breakpoint', () => {
    const breakpointIndex = css.indexOf('@media (min-width: 768px)');
    const widenIndex = css.indexOf('max-width: 600px', breakpointIndex);
    expect(widenIndex).toBeGreaterThan(breakpointIndex);
  });

  it('enlarges the choice-delete tap target within the tablet-portrait breakpoint', () => {
    const breakpointIndex = css.indexOf('@media (min-width: 768px)');
    const nextBreakpointIndex = css.indexOf('@media (min-width: 1024px)');
    const targetIndex = css.indexOf('.choiceDelete', breakpointIndex);
    expect(targetIndex).toBeGreaterThan(breakpointIndex);
    expect(targetIndex).toBeLessThan(nextBreakpointIndex);
  });

  it('switches the container to a two-column grid within the tablet-landscape breakpoint', () => {
    const breakpointIndex = css.indexOf('@media (min-width: 1024px) and (orientation: landscape)');
    const gridIndex = css.indexOf('display: grid', breakpointIndex);
    expect(gridIndex).toBeGreaterThan(breakpointIndex);
  });
});

describe('random page sound toggle placement', () => {
  // .soundToggle is absolutely positioned relative to the viewport, not to
  // the centered, narrower .tabs strip, so it can only be kept clear of the
  // tab list (rather than the specific "Cards" tab, which shifts with
  // screen width) by never letting the two overlap vertically at all.
  const readRuleBlock = (selector) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    return css.slice(start, end);
  };

  const readRemProperty = (block, property) => {
    const match = block.match(new RegExp(`(?:^|\\s)${property}:\\s*([\\d.]+)rem`));
    expect(match, `expected ${property} (in rem) in: ${block}`).not.toBeNull();
    return parseFloat(match[1]);
  };

  it('starts the tab strip below the bottom edge of the sound toggle', () => {
    const toggleBlock = readRuleBlock('.soundToggle');
    const toggleTop = readRemProperty(toggleBlock, 'top');
    const toggleHeight = readRemProperty(toggleBlock, 'height');

    const tabsBlock = readRuleBlock('.tabs');
    const tabsPaddingTop = readRemProperty(tabsBlock, 'padding-top');

    expect(tabsPaddingTop).toBeGreaterThanOrEqual(toggleTop + toggleHeight);
  });
});
