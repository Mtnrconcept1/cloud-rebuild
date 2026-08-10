import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import puppeteer from "puppeteer";

const APP_URL = (process.env.APP_URL || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const SUPABASE_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
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

let temporaryUserId = null;
let browser = null;

try {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const restaurant = await selectLiveRestaurant();
  console.log(`Selected live restaurant: ${restaurant.name} (${restaurant.id})`);

  const credentials = await createTemporaryClientUser();
  temporaryUserId = credentials.userId;
  const session = await signInProduction(credentials.email, credentials.password);

  browser = await launchBrowser();
  const bootstrap = await browser.newPage();
  await bootstrap.setViewport({ width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await bootstrap.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await installProductionSession(bootstrap, session);
  await bootstrap.close();

  const screens = [
    { slug: "01_accueil", label: "Accueil client", path: "/mon-espace" },
    { slug: "02_recherche", label: "Recherche restaurants", path: "/recherche" },
    { slug: "03_restaurant", label: `Fiche restaurant — ${restaurant.name}`, path: `/restaurant/${restaurant.id}` },
    { slug: "04_anti_gaspi", label: "Anti-gaspi", path: "/anti-gaspi" },
    { slug: "05_table_du_chef", label: "Table du Chef", path: "/chefs-table" },
    { slug: "06_zero_attente", label: "Zéro Attente", path: "/zero-attente" },
    { slug: "07_ventes_flash", label: "Ventes flash", path: "/ventes-flash" },
    { slug: "08_actualites", label: "Actualités", path: "/actualites" },
  ];

  const manifest = {
    generated_at: new Date().toISOString(),
    source: APP_URL,
    source_mode: "authenticated-live-production-browser-capture",
    screenshots_are_mockups: false,
    screenshots_use_demo_frame: false,
    temporary_account_deleted_after_capture: true,
    selected_live_restaurant: restaurant,
    screens,
    devices: [],
  };

  for (const device of DEVICES) {
    console.log(`Capturing ${device.id}...`);
    const deviceDir = path.join(OUTPUT_DIR, device.id);
    await fs.mkdir(deviceDir, { recursive: true });
    const records = [];

    for (const screen of screens) {
      const target = `${APP_URL}${screen.path}`;
      const output = path.join(deviceDir, `${screen.slug}.jpg`);
      const result = await captureRoute(browser, device, target, output);
      records.push({
        slug: screen.slug,
        label: screen.label,
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
      "TheTok App Store — authenticated LIVE production screenshots",
      "",
      `Source: ${APP_URL}`,
      `Live restaurant selected at capture time: ${restaurant.name}`,
      "Capture method: Chromium/Puppeteer on GitHub Actions connected directly to the deployed production SPA.",
      "Authentication: temporary production client account created for capture and deleted at job end.",
      "Demo frames: not used.",
      "Mockups: not used.",
      "No payment or transaction is executed by this capture job.",
      "",
      "Each folder name contains the exact screenshot pixel dimensions.",
      "JPEG is used intentionally and contains no alpha channel.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`Captured ${DEVICES.length * screens.length} authenticated live-production screenshots.`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (temporaryUserId) {
    await deleteAuthUser(temporaryUserId).catch((error) => {
      console.warn(`Temporary-user cleanup failed: ${safeError(error)}`);
    });
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

async function selectLiveRestaurant() {
  const params = new URLSearchParams({
    select: "id,name,city,status,is_active",
    is_active: "eq.true",
    status: "eq.active",
    order: "created_at.desc",
    limit: "1",
  });
  const rows = await jsonRequest(`${SUPABASE_URL}/rest/v1/restaurants?${params.toString()}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const restaurant = Array.isArray(rows) ? rows[0] : null;
  if (!restaurant?.id || !restaurant?.name) {
    throw new Error("No active non-demo production restaurant is available for App Store capture");
  }
  return {
    id: String(restaurant.id),
    name: String(restaurant.name),
    city: restaurant.city ? String(restaurant.city) : null,
  };
}

async function createTemporaryClientUser() {
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
        full_name: "Client TOK",
        capture_only: true,
        legal_terms_accepted: true,
        privacy_policy_accepted: true,
      },
    }),
  });

  const userId = String(created?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
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
      body: JSON.stringify({ user_id: userId, role: "client" }),
    });
  } catch (error) {
    await deleteAuthUser(userId).catch(() => undefined);
    throw error;
  }

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

async function deleteAuthUser(userId) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Auth cleanup returned HTTP ${response.status}`);
  }
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
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

async function dismissNonContentOverlays(page) {
  const candidates = [
    "Tout accepter",
    "Accepter",
    "J’accepte",
    "J'accepte",
    "Continuer",
    "Compris",
    "Fermer",
  ];
  for (const label of candidates) {
    const clicked = await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((item) => item.textContent?.trim() === text && item.offsetParent !== null);
      if (!button) return false;
      button.click();
      return true;
    }, label).catch(() => false);
    if (clicked) await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    return !text.includes("Chargement…")
      && !text.includes("Chargement...")
      && !text.includes("Préparation de votre session sécurisée.");
  }, { timeout: 30_000 }).catch(() => undefined);
  await dismissNonContentOverlays(page);
  await new Promise((resolve) => setTimeout(resolve, 1_800));
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
    if (/Accès refusé|Impossible d'ouvrir|Erreur inattendue|Page introuvable/i.test(visibleText)) {
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
      visible_text_excerpt: visibleText.replace(/\s+/g, " ").trim().slice(0, 300),
      console_error_count: consoleErrors.length,
      console_errors: consoleErrors.slice(0, 5),
    };
  } finally {
    await page.close();
  }
}
