const fs = require('fs');
const path = require('path');

const basePath = process.env.PAGES_BASE_PATH || '';
const swPath = path.join(__dirname, '..', 'out', 'sw.js');
const prerenderPath = path.join(__dirname, '..', '.next', 'prerender-manifest.json');
const pagesDir = path.join(__dirname, '..', '.next', 'server', 'pages');
const buildIdPath = path.join(__dirname, '..', '.next', 'BUILD_ID');

if (!fs.existsSync(swPath) || !fs.existsSync(prerenderPath) || !fs.existsSync(buildIdPath)) {
  process.exit(0);
}

const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
const manifest = JSON.parse(fs.readFileSync(prerenderPath, 'utf8'));
const routes = manifest.routes || {};

const extraEntries = [];
const addEntry = (url) => {
  if (!url) return;
  if (url === '/' || url === '/404' || url === '/500' || url === '/__sw-reset') return;
  extraEntries.push({ url: `${basePath}${url}`, revision: buildId });
};

Object.keys(routes).forEach((route) => {
  addEntry(route);
  addEntry(routes[route]?.dataRoute);
});

const addHtmlRoutes = (dir, relBase = '') => {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  items.forEach((item) => {
    const relPath = path.join(relBase, item.name);
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      addHtmlRoutes(fullPath, relPath);
      return;
    }
    if (!relPath.endsWith('.html')) return;
    let urlPath = relPath.replace(/\\/g, '/').replace(/\.html$/, '');
    if (urlPath === 'index') {
      urlPath = '';
    } else if (urlPath.endsWith('/index')) {
      urlPath = urlPath.slice(0, -('/index'.length));
    }
    addEntry(`/${urlPath}`);
  });
};

addHtmlRoutes(pagesDir);

let sw = fs.readFileSync(swPath, 'utf8');

if (basePath) {
  let rewritten = 0;
  sw = sw.replace(/url:"(\/[^"]*?)"/g, (match, url) => {
    if (url.startsWith(`${basePath}/`)) return match;
    rewritten += 1;
    return `url:"${basePath}${url}"`;
  });
  if (rewritten === 0) {
    console.warn('patch-sw-precache: basePath set but no precache URLs were rewritten — Workbox output format may have changed');
  }
}

const marker = 'precacheAndRoute([';
const start = sw.indexOf(marker);
if (start === -1) { fs.writeFileSync(swPath, sw); process.exit(0); }

const arrayStart = start + marker.length;
const endMarker = '],{ignoreURLParametersMatching:';
const end = sw.indexOf(endMarker, arrayStart);
if (end === -1) { fs.writeFileSync(swPath, sw); process.exit(0); }

const existingChunk = sw.slice(arrayStart, end);
const existingUrls = new Set(
  Array.from(existingChunk.matchAll(/url:"([^"]+)"/g)).map((m) => m[1])
);

const toAdd = extraEntries.filter((entry) => !existingUrls.has(entry.url));
if (toAdd.length === 0) { fs.writeFileSync(swPath, sw); process.exit(0); }

const serialized = toAdd
  .map((entry) => `{url:"${entry.url}",revision:"${entry.revision}"}`)
  .join(',');

sw = `${sw.slice(0, end)}${existingChunk ? ',' : ''}${serialized}${sw.slice(end)}`;

fs.writeFileSync(swPath, sw);
