import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import puppeteer from "puppeteer";

const APP_URL = (process.env.APP_URL || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const SUPABASE_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
const DEMO_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim() || "";
const OUTPUT_DIR = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || "appstore-real-screenshots");

const DEVICES = [
  { id: "iphone_6_9_1320x2868", width: 440, height: 956, dpr: 3, kind: "iphone" },
  { id: "iphone_6_5_1284x2778", width: 428, height: 926, dpr: 3, kind: "iphone" },
  { id: "iphone_6_3_1206x2622", width: 402, height: 874, dpr: 3, kind: "iphone" },
  { id: "iphone_6_1_1170x2532", width: 390, height: 844, dpr: 3, kind: "iphone" },
  { id: "iphone_5_5_1242x2208", width: 414, height: 736, dpr: 3, kind: "iphone" },
  { id: "iphone_4_7_750x1334", width: 375, height: 667, dpr: 2, kind: "iphone" },
  { id: "ipad_13_2064x2752", width: 1032, height: 1376, dpr: 2, kind: "ipad" },
  { id: "ipad_12_9_2048x2732", width: 1024, height: 1366, dpr: 2, kind: "ipad" },
  { id: "ipad_11_1668x2420", width: 834, height: 1210, dpr: 2, kind: "ipad" },
  { id: "ipad_10_5_1668x2224", width: 834, height: 1112, dpr: 2, kind: "ipad" },
  { id: "ipad_9_7_1536x2048", width: 768, height: 1024, dpr: 2, kind: "ipad" },
];

const BASE_SCREENS = [
  { slug: "01_accueil", label: "Accueil client", surface: "client", path: "/mon-espace" },
  { slug: "02_recherche", label: "Recherche restaurants", surface: "client", path: "/recherche" },
  { slug: "03_restaurant", label: "Fiche restaurant", surface: "client", path: null },
  { slug: "04_reservations", label: "Réservations", surface: "client", path: "/reservations" },
  { slug: "05_anti_gaspi", label: "Anti-gaspi", surface: "client", path: "/anti-gaspi" },
  { slug: "06_miamz", label: "Miamz et fidélité", surface: "client", path: "/profil?tab=fidelite" },
  { slug: "07_dashboard_restaurateur", label: "Dashboard restaurateur", surface: "restaurant", path: "/dashboard" },
  { slug: "08_studio_marketing", label: "Studio marketing", surface: "restaurant", path: "/dashboard/campaign-studio" },
];

let productionUserId = null;
let demoServiceRoleKey = null;
let browser = null;

try {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const credentials = await createTemporaryCommercialUser();
  productionUserId = credentials.userId;
  demoServiceRoleKey = await resolveDemoServiceRoleKey().catch(() => null);

  const session = await signInProduction(credentials.email, credentials.password);
  browser = await launchBrowser();

  const bootstrap = await browser.newPage();
  await bootstrap.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await bootstrap.goto(APP_URL, { waitUntil: "networkidle2", timeout: 120_000 });
  await installProductionSession(bootstrap, session);
  await bootstrap.goto(`${APP_URL}/commercial/demo-live`, { waitUntil: "networkidle2", timeout: 120_000 });

  await waitForDemoConsole(bootstrap);
  const frameInfo = await readFrameInfo(bootstrap);
  console.log(`Commercial demo session ready: ${frameInfo.sessionId}`);

  // Loading the parent console provisions the matching user/session into the
  // dedicated demo Supabase project. Direct frame pages in this same browser
  // context then render the real Client and Restaurateur SPAs.
  const restaurantPath = await discoverRestaurantDetailPath(browser, frameInfo.clientBase);
  const screens = BASE_SCREENS.map((screen) => (
    screen.slug === "03_restaurant"
      ? { ...screen, path: restaurantPath || "/recherche" }
      : screen
  ));

  const manifest = {
    generated_at: new Date().toISOString(),
    source: APP_URL,
    source_mode: "live-production-browser-capture",
    demo_session_id: frameInfo.sessionId,
    screenshots_are_mockups: false,
    account: "temporary-commercial-user-deleted-after-capture",
    screens: screens.map(({ slug, label, surface, path: screenPath }) => ({ slug, label, surface, path: screenPath })),
    devices: [],
  };

  for (const device of DEVICES) {
    console.log(`Capturing ${device.id}...`);
    const deviceDir = path.join(OUTPUT_DIR, device.id);
    await fs.mkdir(deviceDir, { recursive: true });
    const records = [];

    for (const screen of screens) {
      const base = screen.surface === "restaurant" ? frameInfo.restaurantBase : frameInfo.clientBase;
      const target = `${base}${screen.path}`;
      const output = path.join(deviceDir, `${screen.slug}.jpg`);
      const result = await captureRoute(browser, device, target, output);
      records.push({
        slug: screen.slug,
        label: screen.label,
        surface: screen.surface,
        route: screen.path,
        file: path.relative(OUTPUT_DIR, output),
        ...result,
      });
    }

    manifest.devices.push({
      ...device,
      pixel_width: device.width * device.dpr,
      pixel_height: device.height * device.dpr,
      screenshots: records,
    });
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(OUTPUT_DIR, "README.txt"),
    [
      "TheTok App Store — real production screenshots",
      "",
      `Source: ${APP_URL}`,
      "Capture method: Chromium/Puppeteer on GitHub Actions, connected to the deployed production SPA.",
      "Authenticated screens: real commercial-demo Client/Restaurateur frames provisioned by TOK.",
      "Payment mode: demo/simulated only; no real payment provider is invoked.",
      "The temporary capture account is deleted after the job.",
      "",
      "Each folder name contains the exact App Store pixel dimensions.",
      "JPEG is used intentionally: App Store Connect accepts JPG and it contains no alpha channel.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`Captured ${DEVICES.length * screens.length} real screenshots.`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (productionUserId) {
    await deleteAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, productionUserId).catch((error) => {
      console.warn(`Production temporary-user cleanup failed: ${safeError(error)}`);
    });
    if (demoServiceRoleKey) {
      await deleteAuthUser(DEMO_URL, demoServiceRoleKey, productionUserId).catch((error) => {
        console.warn(`Demo temporary-user cleanup failed: ${safeError(error)}`);
      });
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body && typeof body === "object"
      ? body.msg || body.message || body.error_description || body.error || `HTTP ${response.status}`
      : String(body || `HTTP ${response.status}`);
    throw new Error(message);
  }
  return body;
}

async function createTemporaryCommercialUser() {
  const email = `appstore.capture.${Date.now()}@thetok.ch`;
  const password = `Tok-${crypto.randomBytes(18).toString("base64url")}!9a`;
  const created = await jsonRequest(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "TOK App Store Capture",
        capture_only: true,
        legal_terms_accepted: true,
        privacy_policy_accepted: true,
      },
    }),
  });
  const userId = created?.id;
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ""))) {
    throw new Error("Supabase did not return a valid temporary user id");
  }

  try {
    await jsonRequest(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ user_id: userId, role: "commercial" }),
    });
  } catch (error) {
    await deleteAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, userId).catch(() => undefined);
    throw error;
  }

  // Role checks are server-backed. Give the insert a brief moment to become
  // visible before the first protected-route request.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return { userId, email, password };
}

async function signInProduction(email, password) {
  const session = await jsonRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error("Production sign-in did not return a complete session");
  }
  return session;
}

async function deleteAuthUser(baseUrl, secretKey, userId) {
  const response = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Auth cleanup returned HTTP ${response.status}`);
  }
}

async function resolveDemoServiceRoleKey() {
  if (!SUPABASE_ACCESS_TOKEN) return null;
  const keys = await jsonRequest(
    `https://api.supabase.com/v1/projects/${DEMO_PROJECT_REF}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` } },
  );
  if (!Array.isArray(keys)) return null;
  const entry = keys.find((item) => item && item.type === "secret" && item.disabled !== true)
    || keys.find((item) => item && (item.name === "service_role" || item.type === "service_role") && item.disabled !== true);
  return String(entry?.api_key || entry?.value || entry?.key || "").trim() || null;
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
    ],
  });
}

async function installProductionSession(page, session) {
  const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
  await page.evaluate(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });
  await page.reload({ waitUntil: "networkidle2", timeout: 120_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

async function waitForDemoConsole(page) {
  try {
    await page.waitForSelector('[data-testid="commercial-demo-frame-client"]', { timeout: 90_000 });
    await page.waitForSelector('[data-testid="commercial-demo-frame-restaurant"]', { timeout: 90_000 });
  } catch (error) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2_000) || "").catch(() => "");
    throw new Error(`Commercial demo did not open. Visible text: ${body.replace(/\s+/g, " ").slice(0, 1_000)}`);
  }

  // The first demo RPC also provisions and verifies the matching auth session
  // in the dedicated demo Supabase project.
  await page.waitForFunction(() => {
    const client = document.querySelector('[data-testid="commercial-demo-frame-client"]');
    const restaurant = document.querySelector('[data-testid="commercial-demo-frame-restaurant"]');
    return Boolean(client?.getAttribute("src") && restaurant?.getAttribute("src"));
  }, { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 4_000));
}

async function readFrameInfo(page) {
  const { clientSrc, restaurantSrc } = await page.evaluate(() => ({
    clientSrc: document.querySelector('[data-testid="commercial-demo-frame-client"]')?.getAttribute("src") || "",
    restaurantSrc: document.querySelector('[data-testid="commercial-demo-frame-restaurant"]')?.getAttribute("src") || "",
  }));
  const clientUrl = new URL(clientSrc, APP_URL);
  const restaurantUrl = new URL(restaurantSrc, APP_URL);
  const sessionMatch = clientUrl.pathname.match(/\/commercial\/demo-live\/frame\/client\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!sessionMatch) throw new Error("Unable to resolve the commercial demo session id from the client frame");
  const sessionId = sessionMatch[1];
  const clientBase = `${clientUrl.origin}/commercial/demo-live/frame/client/${sessionId}`;
  const restaurantBase = `${restaurantUrl.origin}/commercial/demo-live/frame/restaurant/${sessionId}`;
  return { sessionId, clientBase, restaurantBase };
}

async function discoverRestaurantDetailPath(currentBrowser, clientBase) {
  const page = await currentBrowser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await gotoReady(page, `${clientBase}/recherche`);
    const href = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a[href*="/restaurant/"]'));
      const anchor = candidates.find((element) => element instanceof HTMLAnchorElement && element.offsetParent !== null)
        || candidates[0];
      return anchor?.getAttribute("href") || "";
    });
    if (!href) return null;
    const url = new URL(href, APP_URL);
    const marker = clientBase.replace(APP_URL, "");
    const markerIndex = url.pathname.indexOf(marker);
    const suffix = markerIndex >= 0
      ? url.pathname.slice(markerIndex + marker.length)
      : url.pathname;
    if (!suffix.startsWith("/restaurant/")) return null;
    return `${suffix}${url.search}`;
  } finally {
    await page.close();
  }
}

async function dismissNonContentOverlays(page) {
  const candidates = [
    "Tout accepter",
    "Accepter",
    "J’accepte",
    "J'accepte",
    "Continuer",
  ];
  for (const label of candidates) {
    const clicked = await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((item) => item.textContent?.trim() === text && item.offsetParent !== null);
      if (!button) return false;
      button.click();
      return true;
    }, label).catch(() => false);
    if (clicked) await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    return !text.includes("Ouverture de votre espace…")
      && !text.includes("Préparation de votre session sécurisée.")
      && !text.includes("Chargement…");
  }, { timeout: 45_000 }).catch(() => undefined);
  await dismissNonContentOverlays(page);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

async function captureRoute(currentBrowser, device, url, output) {
  const page = await currentBrowser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("pageerror", (error) => consoleErrors.push(safeError(error).slice(0, 500)));

  try {
    await page.setViewport({
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.dpr,
      isMobile: true,
      hasTouch: true,
    });
    await gotoReady(page, url);

    const visibleText = await page.evaluate(() => document.body?.innerText || "");
    if (/Accès refusé|Impossible d'ouvrir|Erreur inattendue/i.test(visibleText)) {
      throw new Error(`Screen failed to render: ${visibleText.replace(/\s+/g, " ").slice(0, 500)}`);
    }

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 96,
      fullPage: false,
      captureBeyondViewport: false,
    });
    await fs.writeFile(output, buffer);

    return {
      expected_pixel_width: device.width * device.dpr,
      expected_pixel_height: device.height * device.dpr,
      final_url: page.url(),
      console_error_count: consoleErrors.length,
      console_errors: consoleErrors.slice(0, 5),
    };
  } finally {
    await page.close();
  }
}
