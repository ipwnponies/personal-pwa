import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(
  path.join(__dirname, '../../../pages/tamagotchi/index.module.css'),
  'utf8',
);

describe('index.module.css', () => {
  // jsdom performs no real layout, so a DOM-presence test can't catch a CSS
  // property regressing away. flex-wrap: wrap + justify-content: flex-start
  // on .palette is what keeps every button's start position stable when
  // Cancel/Confirm push the row past one line — the positional guarantee the
  // restart double-tap safety depends on (see the comment above .palette and
  // by the confirmRestart buttons in index.jsx). Assert the source text
  // directly so removing either declaration fails a test.
  it('keeps .palette wrapping with items pinned to their start position', () => {
    const block = css.slice(css.indexOf('.palette'), css.indexOf('.action '));
    expect(block).toMatch(/flex-wrap:\s*wrap/);
    expect(block).toMatch(/justify-content:\s*flex-start/);
  });
});
