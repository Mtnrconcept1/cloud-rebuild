import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const BASE_URL = 'http://localhost:8080';
const OUTPUT_DIR = resolve('screenshots');

// Google Play requires: min 2 screenshots, 16:9 or 9:16
// Phone: 1080x1920 (9:16 portrait)
const VIEWPORT = { width: 412, height: 915, deviceScaleFactor: 2.625 };

const PAGES = [
  { name: '01-accueil', path: '/', waitFor: 3000 },
  { name: '02-recherche', path: '/recherche', waitFor: 3000 },
  { name: '03-anti-gaspi', path: '/anti-gaspi', waitFor: 3000 },
  { name: '04-ventes-flash', path: '/ventes-flash', waitFor: 3000 },
  { name: '05-restaurant', path: '/recherche', waitFor: 3000, clickFirst: '[data-testid="restaurant-card"], a[href*="/restaurant/"]' },
  { name: '06-panier', path: '/panier', waitFor: 2000 },
  { name: '07-profil', path: '/profil', waitFor: 2000 },
  { name: '08-chefs-table', path: '/chefs-table', waitFor: 3000 },
];

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--lang=fr-FR'],
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });

  for (const entry of PAGES) {
    try {
      console.log(`Taking ${entry.name} -> ${entry.path}`);
      await page.goto(`${BASE_URL}${entry.path}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(entry.waitFor);

      // If we need to click a link first (e.g., open a restaurant)
      if (entry.clickFirst) {
        try {
          const el = await page.$(entry.clickFirst);
          if (el) {
            await el.click();
            await sleep(3000);
          }
        } catch { /* ignore if not found */ }
      }

      // Hide scrollbar for cleaner screenshot
      await page.evaluate(() => {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      });

      await page.screenshot({
        path: resolve(OUTPUT_DIR, `${entry.name}.png`),
        fullPage: false,
        type: 'png',
      });

      console.log(`  OK -> ${entry.name}.png`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone! Screenshots saved in ${OUTPUT_DIR}`);
}

run().catch(console.error);
