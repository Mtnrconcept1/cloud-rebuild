// Browser regression for the real campaign editor, with no account or backend.
// Run: node scripts/check-campaign-layout.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'local-browser-test';

const entry = '/__campaign-layout-test.tsx';
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignCreativeStudio } from '/src/pages/dashboard/DashboardCampagnes.tsx';
import SponsoredRestaurantTemplateCard from '/src/components/campaigns/SponsoredRestaurantTemplateCard.tsx';
import { normalizeCampaignCreative } from '/src/lib/campaignCreative.ts';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '/src/components/ui/dialog.tsx';
import '/src/index.css';
const title = 'Déjeuner soigné à Vernier';
const body = 'À Vernier, prenez le temps d’un déjeuner généreux : mezzés à partager et assiettes préparées avec soin.';
function Fixture() {
  const [value, onChange] = useState(() => normalizeCampaignCreative(null));
  const [type, setType] = useState('banner');
  return <>
    <Dialog><DialogTrigger>Créer une campagne</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>Créer une campagne</DialogTitle>
        <DialogDescription>Vérification locale du studio visuel.</DialogDescription>
        <label>Format de test <select value={type} onChange={e => setType(e.target.value)}>
          <option value="banner">Bannière</option><option value="card">Carte</option><option value="push">Push</option>
        </select></label>
        <CampaignCreativeStudio {...{value, onChange, title, body, type}} imageUrl="/images/pasta-assortment.jpeg" placementSelection={{banner: type === 'banner'}} />
      </DialogContent>
    </Dialog>
    <div id="narrow-banner" style={{width: 340, maxWidth: '100%'}}><SponsoredRestaurantTemplateCard restaurantName="Quirinale" headline={title} body={body} variant="banner" /></div>
    <div id="wide-banner" style={{width: 1100, maxWidth: '100%'}}><SponsoredRestaurantTemplateCard restaurantName="Quirinale" headline={title} body={body} variant="banner" compactBanner /></div>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`;

const server = await createServer({
  mode: 'development',
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'campaign-layout-test-only',
    enforce: 'pre',
    resolveId(id) { if (id === entry) return entry; },
    load(id) { if (id === entry) return fixture; },
    // Expose the internal editor only in this test server; production is untouched.
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/pages/dashboard/DashboardCampagnes.tsx')) {
        return code + '\nexport { CampaignCreativeStudio };';
      }
    },
    configureServer(devServer) {
      devServer.middlewares.use('/__campaign-layout', async (_req, res, next) => {
        try {
          res.setHeader('Content-Type', 'text/html');
          res.end(await devServer.transformIndexHtml('/__campaign-layout', `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`));
        } catch (error) { next(error); }
      });
    },
  }],
});

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
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:') || request.url().startsWith('data:')) request.continue();
    else request.abort();
  });
  for (const width of [1920, 1024, 768, 390, 320]) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${server.resolvedUrls.local[0]}__campaign-layout`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#narrow-banner article');
    const banners = await page.evaluate(() => ['narrow-banner', 'wide-banner'].map(id => {
      const article = document.querySelector('#' + id + ' article');
      const heading = article.querySelector('h3').getBoundingClientRect();
      const media = article.querySelector('[data-sponsored-banner-media]').getBoundingClientRect();
      return { id, width: article.clientWidth, height: article.clientHeight, textWidth: heading.width, sideBySide: media.x > heading.right };
    }));
    for (const banner of banners) {
      assert.ok(banner.textWidth >= Math.min(210, banner.width - 100), JSON.stringify(banner));
      assert.ok(banner.height < 1000, JSON.stringify(banner));
      assert.equal(banner.sideBySide, banner.width >= 768, JSON.stringify(banner));
    }
    const imageFits = await page.evaluate(() => Array.from(document.querySelectorAll('[data-sponsored-banner-media]')).every(media => {
      const image = media.querySelector('img');
      return image.clientHeight <= media.clientHeight && image.clientWidth <= media.clientWidth && getComputedStyle(image).objectFit === 'contain';
    }));
    assert.ok(imageFits, 'Banner images must fit their frame without cropping');
    await page.locator('button').filter(button => button.textContent === 'Créer une campagne').click();
    await page.waitForSelector('[role="dialog"] section article');
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const article = dialog.querySelector('article');
      return { dialogWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth, previewWidth: article.clientWidth, height: article.clientHeight };
    });
    assert.ok(geometry.scrollWidth <= geometry.dialogWidth + 1, JSON.stringify(geometry));
    assert.ok(geometry.previewWidth >= geometry.dialogWidth - 90, JSON.stringify(geometry));
    assert.ok(geometry.height < 1000, JSON.stringify(geometry));
    const input = await page.waitForSelector('input[placeholder="Italien · Puplinge"]');
    await input.click();
    await input.type('Menu du jour');
    assert.equal(await input.evaluate(el => el.value), 'Menu du jour');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    assert.equal(await input.evaluate(el => el.value), '');
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] section input, [role="dialog"] section [role="combobox"]')).filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length);
    assert.equal(unnamed, 0, 'Every editor field must have an accessible name');
    for (const type of ['card', 'push', 'banner']) {
      await page.select('select', type);
      assert.equal(await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d.scrollWidth <= d.clientWidth + 1; }), true);
    }
    // Long unbroken copy must remain inside the preview, even at mobile widths.
    const restaurantInput = await page.$('input[placeholder="Quirinale"]');
    await restaurantInput.type('R'.repeat(90));
    for (const type of ['banner', 'card']) {
      await page.select('select', type);
      const titleFits = await page.evaluate(() => {
        const article = document.querySelector('[role="dialog"] article');
        const title = article.querySelector('h3');
        const box = article.getBoundingClientRect();
        const text = title.getBoundingClientRect();
        return title.textContent.trim().length === 90 && title.scrollWidth <= title.clientWidth + 1 && text.bottom <= box.bottom && text.right <= box.right;
      });
      assert.ok(titleFits, `Long restaurant name clipped at ${width}px in ${type}`);
    }
    await restaurantInput.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.select('select', 'banner');
    await page.evaluate(() => { document.querySelector('[role="dialog"]').scrollTop = 0; });
    if (process.env.CAMPAIGN_SCREENSHOT_DIR) {
      await page.screenshot({ path: resolve(process.env.CAMPAIGN_SCREENSHOT_DIR, `campaign-${width}.png`) });
    }
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"] article h3')).color === 'rgb(248, 250, 252)');
    assert.equal(await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d.scrollWidth <= d.clientWidth + 1; }), true);
    if (process.env.CAMPAIGN_SCREENSHOT_DIR && width === 390) {
      await page.screenshot({ path: resolve(process.env.CAMPAIGN_SCREENSHOT_DIR, 'campaign-390-dark.png') });
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Créer une campagne');
    console.log(`PASS campaign editor ${width}px: banner/card/push, input, long copy, labels, light/dark overflow, Escape/focus`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
