import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterAll } from 'vitest';
import { PNG } from 'pngjs';
import {
  generateSplash, SPLASH_WIDTH, SPLASH_HEIGHT, hexToRgb,
} from './generate-splash';

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const OUTPUT_FILENAME = 'splash-test-output.png';
const OUTPUT_PATH = path.join(ICONS_DIR, OUTPUT_FILENAME);

describe('hexToRgb', () => {
  it('converts a hex color string to an RGB triple', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });
});

describe('generateSplash', () => {
  afterAll(() => {
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
  });

  it('composites the icon centered on a background-colored canvas', () => {
    generateSplash({
      icon: 'apple-touch-icon-180x180.png',
      manifestFile: 'manifest.json',
      output: OUTPUT_FILENAME,
    });

    const output = PNG.sync.read(fs.readFileSync(OUTPUT_PATH));
    expect(output.width).toBe(SPLASH_WIDTH);
    expect(output.height).toBe(SPLASH_HEIGHT);

    // Corner pixel should be pure background color (white, from manifest.json).
    expect([output.data[0], output.data[1], output.data[2]]).toEqual([255, 255, 255]);

    // A pixel inside the icon's bounding box should match the source icon exactly.
    const icon = PNG.sync.read(fs.readFileSync(path.join(ICONS_DIR, 'apple-touch-icon-180x180.png')));
    const iconCenterX = Math.floor(icon.width / 2);
    const iconCenterY = Math.floor(icon.height / 2);
    const iconIdx = (icon.width * iconCenterY + iconCenterX) * 4;

    const offsetX = Math.floor((SPLASH_WIDTH - icon.width) / 2);
    const offsetY = Math.floor((SPLASH_HEIGHT - icon.height) / 2);
    const canvasX = offsetX + iconCenterX;
    const canvasY = offsetY + iconCenterY;
    const canvasIdx = (SPLASH_WIDTH * canvasY + canvasX) * 4;

    expect(output.data[canvasIdx]).toBe(icon.data[iconIdx]);
    expect(output.data[canvasIdx + 1]).toBe(icon.data[iconIdx + 1]);
    expect(output.data[canvasIdx + 2]).toBe(icon.data[iconIdx + 2]);
  });
});
