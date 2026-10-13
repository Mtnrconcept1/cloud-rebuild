import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_URL = process.env.GOLDEN_TOK_TEST_URL || "http://127.0.0.1:4173/scripts/fixtures/golden-tok-preview.html";
const OUTPUT_DIR = resolve("artifacts/golden-tok-responsive");
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

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=fr-FR"],
  });
  let failures = 0;
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        await page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30_000 });
        await page.waitForSelector("[data-golden-tok-chefs-table] h1.golden-tok-hero-title", { timeout: 8_000 });
        await page.evaluate(async () => { await document.fonts.ready; });
        const metrics = await page.evaluate(() => {
          const root = document.querySelector("[data-golden-tok-chefs-table]");
          const hero = root?.querySelector(".golden-tok-heading");
          const heading = root?.querySelector("h1.golden-tok-hero-title");
          const action = root?.querySelector(".golden-tok-discover");
          const alert = root?.querySelector(".golden-tok-header-action button");
          const box = (node) => {
            const rect = node?.getBoundingClientRect();
            return rect ? { left: rect.left, right: rect.right, width: rect.width, height: rect.height } : null;
          };
          return {
            name: heading?.textContent?.replace(/\s+/g, " ").trim(),
            hero: box(hero),
            heading: box(heading),
            action: box(action),
            notification: box(alert),
            benefits: root?.querySelectorAll(".golden-tok-benefit").length,
            artwork: hero ? getComputedStyle(hero).backgroundImage : "",
            horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
            anchor: action?.getAttribute("href"),
            targetPresent: !!root?.querySelector("#la-tok-dor-offres"),
          };
        });
        const checks = {
          semanticTitle: metrics.name === "La Tok d’Or",
          visibleHero: (metrics.hero?.height || 0) > 450,
          realArtwork: metrics.artwork.includes("11_06_16.png"),
          visibleCTA: (metrics.action?.height || 0) >= 44,
          visibleNotification: (metrics.notification?.height || 0) >= 44,
          fourBenefits: metrics.benefits === 4,
          validNavigation: metrics.anchor === "#la-tok-dor-offres" && metrics.targetPresent,
          noHorizontalOverflow: metrics.horizontalOverflow <= 4,
          headingFits: (metrics.heading?.left || 0) >= 0 && (metrics.heading?.right || Infinity) <= viewport.width + 2,
          actionFits: (metrics.action?.left || 0) >= 0 && (metrics.action?.right || Infinity) <= viewport.width + 2,
          noBrowserError: errors.length === 0,
        };
        await page.screenshot({ path: resolve(OUTPUT_DIR, viewport.name + ".png"), fullPage: true });
        console.log(JSON.stringify({ viewport: viewport.name, width: viewport.width, checks, metrics, errors }));
        if (Object.values(checks).some((v) => !v)) failures += 1;
      } catch (error) {
        failures += 1;
        console.error(viewport.name + ": " + error.message);
        await page.screenshot({ path: resolve(OUTPUT_DIR, viewport.name + "-failure.png"), fullPage: true }).catch(() => {});
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures) throw new Error(failures + " viewport(s) have visual or geometry failures");
  console.log("Golden TOK UI component passed in Chromium at eight viewport sizes");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });