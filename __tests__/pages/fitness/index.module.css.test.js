import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
  path.join(__dirname, '../../../pages/fitness/index.module.css'),
  'utf8',
);

describe('fitness page tablet breakpoints', () => {
  it('defines a tablet-portrait breakpoint at 768px', () => {
    expect(css).toContain('@media (min-width: 768px)');
  });

  it('defines a tablet-landscape breakpoint at 1024px landscape', () => {
    expect(css).toContain('@media (min-width: 1024px) and (orientation: landscape)');
  });

  it('gives inputs a 44px minimum touch target within the tablet-portrait breakpoint', () => {
    const breakpointIndex = css.indexOf('@media (min-width: 768px)');
    const targetIndex = css.indexOf('min-height: 44px', breakpointIndex);
    expect(targetIndex).toBeGreaterThan(breakpointIndex);
  });

  it('widens the main container within the tablet-landscape breakpoint', () => {
    const breakpointIndex = css.indexOf('@media (min-width: 1024px) and (orientation: landscape)');
    const widenIndex = css.indexOf('max-width: 1100px', breakpointIndex);
    expect(widenIndex).toBeGreaterThan(breakpointIndex);
  });
});

describe('fitness page table scroll region', () => {
  it('defines a tableScroll class with its own overflow-y', () => {
    const classIndex = css.indexOf('.tableScroll {');
    expect(classIndex).toBeGreaterThan(-1);
    const closeIndex = css.indexOf('}', classIndex);
    const block = css.slice(classIndex, closeIndex);
    expect(block).toContain('overflow-y: auto');
  });

  it('does not leave max-height or overflow-y on tableCard', () => {
    const classIndex = css.indexOf('.tableCard {');
    const closeIndex = css.indexOf('}', classIndex);
    const block = css.slice(classIndex, closeIndex);
    expect(block).not.toContain('max-height');
    expect(block).not.toContain('overflow-y');
  });

  it('makes the header cell sticky', () => {
    const classIndex = css.indexOf('.th {');
    const closeIndex = css.indexOf('}', classIndex);
    const block = css.slice(classIndex, closeIndex);
    expect(block).toContain('position: sticky');
    expect(block).toContain('top: 0');
  });
});
