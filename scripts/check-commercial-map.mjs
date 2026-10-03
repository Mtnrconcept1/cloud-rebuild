// Real Leaflet component, simulated tile responses; never bulk-fetches OSM.
// Run: node scripts/check-commercial-map.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'local-browser-test';
const entry = '/__commercial-map-test.tsx';
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CommercialProspectionMap } from '/src/pages/CommercialProspection.tsx';
import '/src/index.css';
const prospects = [{ sourceObjectId: 1, name: 'Restaurant de test', latitude: 46.2044, longitude: 6.1432, commune: 'Genève' }];
const followups = new Map();
function Fixture() {
  const [opened, setOpened] = useState('');
  return <main style={{padding: 16}}>
    <CommercialProspectionMap prospects={prospects} followupsByObjectId={followups} selectedObjectId={null} onOpenDetails={p => setOpened(p.name)} />
    <output>{opened}</output>
    <img src="https://example.org/privacy-probe.png" alt="" />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`;
const server = await createServer({
  mode: 'development',
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'commercial-map-test-only',
    enforce: 'pre',
    resolveId(id) { if (id === entry) return entry; },
    load(id) { if (id === entry) return fixture; },
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/pages/CommercialProspection.tsx')) {
        return code + '\nexport { CommercialProspectionMap };';
      }
    },
    configureServer(devServer) {
      devServer.middlewares.use('/__commercial-map', async (_req, res, next) => {
        try {
          res.setHeader('Referrer-Policy', 'no-referrer');
          res.setHeader('Content-Type', 'text/html');
          res.end(await devServer.transformIndexHtml('/__commercial-map', `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`));
        } catch (error) { next(error); }
      });
    },
  }],
});
const tileSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/><path d="M0 90H256M70 0V256" stroke="#fff" stroke-width="8"/></svg>';
let browser;
try {
  await server.listen();
  const executablePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await puppeteer.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  const errors = [];
  const tileRequests = [];
  const privacyRequests = [];
  let failTiles = false;
  let failOneTile = false;
  let blockedUrl = null;
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
      tileRequests.push({ url: request.url(), referer: request.headers().referer });
      if (failOneTile && blockedUrl === null) blockedUrl = request.url();
      const blocked = failTiles || request.url() === blockedUrl;
      request.respond({ status: blocked ? 403 : 200, contentType: blocked ? 'text/plain' : 'image/svg+xml', body: blocked ? 'Access blocked' : tileSvg });
    } else if (url.hostname === 'example.org') {
      privacyRequests.push(request.headers().referer);
      request.respond({ status: 200, contentType: 'image/svg+xml', body: tileSvg });
    } else if (url.hostname === '127.0.0.1') request.continue();
    else request.abort();
  });
  const base = server.resolvedUrls.local[0];
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 900 });
    const response = await page.goto(`${base}__commercial-map?width=${width}&prospect=private-test#token=not-a-token`, { waitUntil: 'networkidle0' });
    assert.equal(response.headers()['referrer-policy'], 'no-referrer');
    await page.waitForSelector('.leaflet-tile-loaded');
    assert.equal(await page.$('[role="status"]'), null);
    assert.ok(tileRequests.length > 0);
    for (const request of tileRequests) {
      assert.equal(new URL(request.url).hostname, 'tile.openstreetmap.org');
      assert.equal(request.referer, base, 'Only the origin may be disclosed, even with a private query/hash');
    }
    assert.ok(privacyRequests.length > 0);
    assert.ok(privacyRequests.every(value => !value), `Unrelated images must retain no-referrer: ${JSON.stringify(privacyRequests)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.$('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));
    await page.click('.leaflet-marker-icon');
    await page.waitForFunction(() => document.querySelector('output').textContent === 'Restaurant de test');

    failTiles = true;
    await page.click('.leaflet-control-zoom-out');
    await page.waitForSelector('[role="status"]');
    await page.waitForNetworkIdle();
    assert.ok(await page.$('.leaflet-marker-icon'), 'Markers survive unavailable tiles');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].some(tile => tile.style.visibility === 'hidden')));

    failTiles = false;
    blockedUrl = null;
    await page.click('.leaflet-control-zoom-out');
    await page.waitForFunction(() => !document.querySelector('[role="status"]'));
    await page.waitForSelector('.leaflet-tile-loaded');
    failOneTile = true;
    await page.click('.leaflet-control-zoom-out');
    await page.waitForNetworkIdle();
    assert.ok(await page.$('[role="status"]'), 'Successful tiles must not clear a remaining tile error');
    failOneTile = false;
    blockedUrl = null;
    await page.click('.leaflet-control-zoom-out');
    await page.waitForFunction(() => !document.querySelector('[role="status"]'));
    console.log(`PASS ${width}px: origin-only Referer, private headers preserved, markers, full/partial 403 and recovery`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
