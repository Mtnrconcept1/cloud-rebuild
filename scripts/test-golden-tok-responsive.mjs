import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_URL = process.env.GOLDEN_TOK_TEST_URL || "http://127.0.0.1:4173/chefs-table";
const ARTIFACT_DIR = resolve("artifacts/golden-tok-responsive");
const VIEWPORTS = [
  { name: "mobile-small", width: 320, height: 740 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-wide", width: 430, height: 932 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-wide", width: 1680, height: 945 },
];

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=fr-FR"],
  });
  let failures = 0;
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      const remoteRequests = [];
      page.on("request", (req) => {
        if (req.url().includes("supabase.co")) {
          try {
            const u = new URL(req.url());
            if (remoteRequests.length < 18) remoteRequests.push(req.method() + " " + u.origin + u.pathname);
          } catch {}
        }
      });
      // The production launch gate fails closed with a fake CI database.
      // Stub only this read-only gate RPC in the browser, never application code.
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (!url.startsWith("https://example.supabase.co/")) {
          void request.continue();
          return;
        }
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, prefer",
        };
        if (request.method() === "OPTIONS") {
          void request.respond({ status: 204, headers });
          return;
        }
        if (url.includes("/rest/v1/feature_flags") && request.method() === "GET") {
          void request.respond({
            status: 200,
            headers: { ...headers, "content-type": "application/json", "content-range": "0-0/1" },
            body: JSON.stringify([{ id: "chefs-table", name: "chefs-table", label: "La Tok d’Or", description: "Expériences exclusives", is_active: true }]),
          });
          return;
        }
        if (url.includes("/rpc/get_launch_gate_state")) {
          void request.respond({
            status: 200,
            contentType: "application/json",
            headers,
            body: JSON.stringify({ enabled: false, ends_at: null, server_now: new Date().toISOString() }),
          });
          return;
        }
        // All other remote traffic stays unavailable in CI; only the Golden TOK flag
        // are used, and no real financial or reservation actions are performed.
        void request.abort();
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      try {
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForFunction(
          () => Array.from(document.querySelectorAll("button")).some((el) => el.textContent?.includes("Tout refuser")),
          { timeout: 3_000 },
        ).catch(() => {});
        await page.evaluate(() => {
          const reject = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.includes("Tout refuser"));
          reject?.click();
        });
        await page.waitForSelector("[data-golden-tok-chefs-table] h1.golden-tok-hero-title", { timeout: 15_000 });
        await page.evaluate(async () => { await document.fonts?.ready; });
        const metrics = await page.evaluate(() => {
          const root = document.querySelector("[data-golden-tok-chefs-table]");
          const heading = root?.querySelector(".golden-tok-heading");
          const title = root?.querySelector(".golden-tok-hero-title");
          const action = root?.querySelector(".golden-tok-discover");
          const alert = root?.querySelector(".golden-tok-header-action button");
          const benefits = root?.querySelectorAll(".golden-tok-benefit") || [];
          const bounding = (element) => {
            const b = element?.getBoundingClientRect();
            return b && { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
          };
          return {
            title: title?.textContent?.replace(/\s+/g, " ").trim(),
            hero: bounding(heading),
            heading: bounding(title),
            cta: bounding(action),
            notify: bounding(alert),
            benefits: benefits.length,
            horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
            background: heading ? getComputedStyle(heading).backgroundImage : "",
            linkWorks: action?.getAttribute("href") === "#la-tok-dor-offres" && !!document.querySelector("#la-tok-dor-offres"),
          };
        });
        const checks = {
          hasSemanticName: metrics.title === "La Tok d’Or",
          hasHero: metrics.hero?.width > 0 && metrics.hero.height > 450,
          hasOriginalArtwork: metrics.background.includes("11_06_16.png"),
          visibleAction: metrics.cta?.height >= 44,
          visibleAlerts: metrics.notify?.height >= 40,
          hasFourBenefits: metrics.benefits === 4,
          navigableCTA: metrics.linkWorks,
          noHorizontalOverflow: metrics.horizontalOverflow <= 4,
          titleWithinViewport: metrics.heading?.left >= 0 && metrics.heading?.right <= viewport.width + 2,
          actionWithinViewport: metrics.cta?.left >= 0 && metrics.cta?.right <= viewport.width + 2,
        };
        const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
        if (failed.length) failures += 1;
        await page.screenshot({
          path: resolve(ARTIFACT_DIR, viewport.name + ".png"),
          fullPage: true,
          type: "png",
        });
        console.log(JSON.stringify({ viewport: viewport.name, dimensions: [viewport.width, viewport.height], checks, errors: pageErrors.slice(0, 3), result: failed.length ? "FAIL" : "PASS" }));
      } catch (error) {
        failures += 1;
        console.error(viewport.name + ": " + error.message + " (" + page.url() + ")");
        console.error("requests: " + JSON.stringify(remoteRequests));
        console.error("page errors: " + JSON.stringify(pageErrors.slice(0,5)));
        console.error("render states: " + (await page.evaluate(() => JSON.stringify({ path: location.pathname, spinners: document.querySelectorAll(".animate-spin").length, rootText: document.querySelector("#root")?.textContent?.slice(0,500) })).catch(()=>"error")));
        console.error("visible text: " + (await page.evaluate(() => document.body?.innerText?.slice(0,600) ?? "").catch(()=>"error")) );
        await page.screenshot({ path: resolve(ARTIFACT_DIR, viewport.name + "-failure.png"), fullPage: false }).catch(() => {});
        throw error; // One blocked route is enough for diagnosis; do not repeat eight timeouts.
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures) throw new Error(failures + " responsive viewport(s) failed");
  console.log("Golden TOK responsive browser validation passed at all 8 device widths");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
