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
