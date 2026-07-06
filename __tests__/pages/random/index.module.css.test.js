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
