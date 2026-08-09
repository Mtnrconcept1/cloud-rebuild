const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'https://www.thetok.ch';
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || 'screenshots-all-routes');
const APP_PATH = path.resolve('src/App.tsx');
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const WAIT_MS = Number(process.env.WAIT_MS || 2500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function unique(values) {
  return [...new Set(values)];
}

function safeFilename(routePattern, index) {
  const raw = routePattern === '/' ? 'root' : routePattern;
  const safe = raw
    .replace(/^\/+/, '')
    .replace(/[:*]/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'root';
  return `${String(index + 1).padStart(3, '0')}-${safe}.jpg`;
}

function routeCategory(route) {
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/dashboard')) return 'restaurateur';
  if (route.startsWith('/courier')) return 'coursier';
  if (route.startsWith('/commercial')) return 'commercial';
  if (route.startsWith('/marketing')) return 'marketing';
  if (route.startsWith('/auth') || route === '/espaces' || route === '/oauth/consent') return 'auth';
  if (['/mon-espace', '/compte', '/espace-client', '/reservations', '/mes-avis', '/profil', '/parametres/securite', '/memoire-tok', '/notifications', '/commandes'].some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) return 'client-protege';
  return 'public';
}

function extractRoutePatterns() {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  return unique(
    [...source.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((route) => route !== '*'),
  );
}

async function collectInternalLinks(page, pathname) {
  try {
    await page.goto(new URL(pathname, BASE_URL).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(WAIT_MS);
    return await page.$$eval('a[href]', (anchors) => anchors
      .map((anchor) => anchor.getAttribute('href'))
      .filter(Boolean));
  } catch (error) {
    console.warn(`Discovery failed for ${pathname}: ${error.message}`);
    return [];
  }
}

function normalizeInternalPath(href) {
  try {
    const url = new URL(href, BASE_URL);
    const base = new URL(BASE_URL);
    if (url.hostname !== base.hostname && !url.hostname.endsWith('.thetok.ch')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

async function buildDiscovery(page) {
  const discovered = unique([
    ...(await collectInternalLinks(page, '/')),
    ...(await collectInternalLinks(page, '/recherche')),
    ...(await collectInternalLinks(page, '/restaurants/geneve')),
    ...(await collectInternalLinks(page, '/actualites')),
  ].map(normalizeInternalPath).filter(Boolean));

  const restaurantDetail = discovered.find((value) => /^\/restaurant\/[^/?#]+/.test(value)) || null;
  const restaurantCitySlug = discovered.find((value) => /^\/restaurants\/[^/]+\/r\/[^/?#]+/.test(value)) || null;
  const restaurantShort = discovered.find((value) => /^\/r\/[^/?#]+(?:\/reserver)?/.test(value)) || null;
  const category = discovered.find((value) => /^\/restaurants\/geneve\/[^/?#]+/.test(value) && !value.startsWith('/restaurants/geneve/r/')) || null;
  const actualite = discovered.find((value) => /^\/actualites\/[^/?#]+/.test(value)) || null;

  let slug = null;
  if (restaurantCitySlug) slug = restaurantCitySlug.split('/')[4];
  if (!slug && restaurantShort) slug = restaurantShort.split('/')[2];

  return {
    links: discovered,
    restaurantDetail,
    restaurantCitySlug,
    restaurantShort,
    category,
    actualite,
    slug: slug || 'restaurant-demo',
  };
}

function resolveRoute(routePattern, discovery) {
  if (routePattern === '/restaurants/:city/r/:restaurantSlug' && discovery.restaurantCitySlug) {
    return discovery.restaurantCitySlug.split(/[?#]/)[0];
  }
  if (routePattern === '/restaurants/:city/:category' && discovery.category) {
    return discovery.category.split(/[?#]/)[0];
  }
  if (routePattern === '/restaurant/:id' && discovery.restaurantDetail) {
    return discovery.restaurantDetail.split(/[?#]/)[0];
  }
  if (routePattern === '/actualites/:postId' && discovery.actualite) {
    return discovery.actualite.split(/[?#]/)[0];
  }
  if (routePattern === '/r/:slug/reserver') return `/r/${discovery.slug}/reserver`;
  if (routePattern === '/r/:slug') return `/r/${discovery.slug}`;

  return routePattern
    .replaceAll(':city', 'geneve')
    .replaceAll(':restaurantSlug', discovery.slug)
    .replaceAll(':postId', 'demo')
    .replaceAll(':slug', discovery.slug)
    .replaceAll(':id', 'demo')
    .replaceAll('*', '__wildcard-probe__');
}

async function dismissCommonOverlays(page) {
  try {
    await page.evaluate(() => {
      const labels = ['Tout accepter', 'Accepter', 'J’accepte', "J'accepte", 'OK'];
      const buttons = Array.from(document.querySelectorAll('button'));
      const button = buttons.find((item) => labels.includes((item.textContent || '').trim()));
      if (button) button.click();
    });
    await sleep(250);
  } catch {
    // Best effort only.
  }
}

async function captureRoute(page, routePattern, index, discovery) {
  const requestedPath = resolveRoute(routePattern, discovery);
  const requestedUrl = new URL(requestedPath, BASE_URL).href;
  const screenshot = safeFilename(routePattern, index);
  const outputPath = path.join(OUTPUT_DIR, screenshot);
  const startedAt = Date.now();
  let responseStatus = null;
  let error = null;

  console.log(`[${index + 1}] ${routePattern} -> ${requestedPath}`);

  try {
    const response = await page.goto(requestedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    responseStatus = response ? response.status() : null;
    await sleep(WAIT_MS);
    await dismissCommonOverlays(page);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    console.warn(`  navigation warning: ${error}`);
  }

  let title = null;
  try { title = await page.title(); } catch { /* ignore */ }

  try {
    await page.screenshot({
      path: outputPath,
      type: 'jpeg',
      quality: 84,
      fullPage: true,
      captureBeyondViewport: true,
    });
  } catch (caught) {
    const screenshotError = caught instanceof Error ? caught.message : String(caught);
    error = error ? `${error}; screenshot: ${screenshotError}` : `screenshot: ${screenshotError}`;
    console.warn(`  screenshot warning: ${screenshotError}`);
  }

  const finalUrl = page.url();
  return {
    index: index + 1,
    category: routeCategory(routePattern),
    routePattern,
    requestedPath,
    requestedUrl,
    finalUrl,
    responseStatus,
    title,
    screenshot,
    redirected: finalUrl !== requestedUrl,
    durationMs: Date.now() - startedAt,
    error,
  };
}

function writeHtmlGallery(manifest) {
  const cards = manifest.entries.map((entry) => `
    <article class="card">
      <div class="meta">
        <strong>${entry.index}. ${escapeHtml(entry.routePattern)}</strong>
        <span>${escapeHtml(entry.category)}</span>
        <code>${escapeHtml(entry.requestedPath)}</code>
        <small>${entry.redirected ? `Redirection → ${escapeHtml(entry.finalUrl)}` : escapeHtml(entry.finalUrl)}</small>
        ${entry.error ? `<small class="error">${escapeHtml(entry.error)}</small>` : ''}
      </div>
      <a href="${encodeURI(entry.screenshot)}"><img loading="lazy" src="${encodeURI(entry.screenshot)}" alt="${escapeHtml(entry.routePattern)}"></a>
    </article>`).join('\n');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOK — captures de toutes les routes</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#f4f4f5;color:#18181b}.head{position:sticky;top:0;z-index:2;background:#fff;padding:18px 24px;border-bottom:1px solid #ddd}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px;padding:18px}.card{background:#fff;border:1px solid #ddd;border-radius:14px;overflow:hidden}.meta{display:flex;flex-direction:column;gap:5px;padding:12px}.meta span{font-size:12px;text-transform:uppercase;color:#71717a}.meta code,.meta small{word-break:break-all}.error{color:#b91c1c}.card img{display:block;width:100%;height:auto;border-top:1px solid #eee}
</style></head><body><div class="head"><h1>TOK — captures de toutes les routes</h1><p>${manifest.entries.length} routes extraites automatiquement de src/App.tsx. Généré le ${escapeHtml(manifest.generatedAt)}.</p></div><main class="grid">${cards}</main></body></html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const routePatterns = extractRoutePatterns();
  console.log(`Found ${routePatterns.length} route patterns in ${APP_PATH}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--lang=fr-FR',
      '--disable-features=Translate,MediaRouter',
    ],
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);

  const discovery = await buildDiscovery(page);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'discovery.json'), JSON.stringify(discovery, null, 2));

  const entries = [];
  for (let index = 0; index < routePatterns.length; index += 1) {
    entries.push(await captureRoute(page, routePatterns[index], index, discovery));
  }

  await browser.close();

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    source: 'src/App.tsx',
    routeCount: routePatterns.length,
    discovery,
    entries,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeHtmlGallery(manifest);

  const redirected = entries.filter((entry) => entry.redirected).length;
  const errors = entries.filter((entry) => entry.error).length;
  console.log(`Done: ${entries.length} captures, ${redirected} redirections, ${errors} warnings/errors.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
