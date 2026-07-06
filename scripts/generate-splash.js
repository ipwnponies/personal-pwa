const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT_DIR = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'public', 'icons');

const SPLASH_WIDTH = 1536;
const SPLASH_HEIGHT = 2048;

// iPad 6th generation (2018), 9.7": 768x1024pt @2x. This same 2048x1536px
// panel was reused across several iPad generations (3rd gen through 6th
// gen), so this splash also displays correctly on those older models.
const SPLASH_TARGETS = [
  {
    icon: 'apple-touch-icon-180x180.png',
    manifestFile: 'manifest.json',
    output: 'splash-root-1536x2048.png',
  },
  {
    icon: 'fitness-apple-touch-icon-180x180.png',
    manifestFile: 'fitness-manifest.json',
    output: 'splash-fitness-1536x2048.png',
  },
];

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
};

const readManifestBackgroundColor = (manifestFile) => {
  const manifestPath = path.join(ROOT_DIR, 'public', manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.background_color;
};

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));

const generateSplash = ({ icon, manifestFile, output }) => {
  const iconPng = readPng(path.join(ICONS_DIR, icon));
  const [r, g, b] = hexToRgb(readManifestBackgroundColor(manifestFile));

  const canvas = new PNG({ width: SPLASH_WIDTH, height: SPLASH_HEIGHT });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = r;
    canvas.data[i + 1] = g;
    canvas.data[i + 2] = b;
    canvas.data[i + 3] = 255;
  }

  const offsetX = Math.floor((SPLASH_WIDTH - iconPng.width) / 2);
  const offsetY = Math.floor((SPLASH_HEIGHT - iconPng.height) / 2);
  PNG.bitblt(iconPng, canvas, 0, 0, iconPng.width, iconPng.height, offsetX, offsetY);

  fs.writeFileSync(path.join(ICONS_DIR, output), PNG.sync.write(canvas));
  // eslint-disable-next-line no-console
  console.log(`Generated public/icons/${output}`);
};

module.exports = {
  generateSplash, SPLASH_TARGETS, SPLASH_WIDTH, SPLASH_HEIGHT, hexToRgb,
};

if (require.main === module) {
  SPLASH_TARGETS.forEach(generateSplash);
}
