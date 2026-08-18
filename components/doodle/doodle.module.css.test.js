import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'doodle.module.css'), 'utf8');

describe('doodle.module.css', () => {
  it('has a tablet+ breakpoint at 768px', () => {
    expect(css).toMatch(/@media \(min-width: 768px\)/);
  });

  it('keeps the phone-base toolButton size unchanged', () => {
    const base = css.slice(0, css.indexOf('@media'));
    expect(base).toMatch(/\.toolButton\s*{[^}]*width:\s*48px/);
    expect(base).toMatch(/\.toolButton\s*{[^}]*height:\s*48px/);
  });

  it('enlarges toolButton within the tablet+ breakpoint', () => {
    const breakpoint = css.slice(css.indexOf('@media'));
    expect(breakpoint).toMatch(/\.toolButton\s*{[^}]*width:\s*72px/);
    expect(breakpoint).toMatch(/\.toolButton\s*{[^}]*height:\s*72px/);
  });
});
