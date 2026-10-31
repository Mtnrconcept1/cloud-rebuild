/**
 * Browser canary for the separate Vercel AutoPilot review site.
 * No form submission, external publication or payment. GET/HEAD only.
 */
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2] || "https://tok-autopilot-revue.vercel.app/";
const url = new URL(target);
if (url.protocol !== "https:" || !["tok-autopilot-revue.vercel.app",
  "tok-autopilot-revue-3dumqbwax-mtnrconcepts-projects.vercel.app"].includes(url.hostname)) {
  throw new Error("Preview origin not approved");
}
const browser = await puppeteer.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-gpu", "--disable-extensions"],
});
const outDir = resolve(process.cwd(), "dist", "verification");
await mkdir(outDir, { recursive: true });
try {
  const results = [];
  for (const view of [{ name: "desktop", width: 1400, height: 880 },
    { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage();
    await page.setViewport({ ...view, deviceScaleFactor: 1 });
    const invalidWrites = [];
    const errors = [];
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
        invalidWrites.push(req.method());
        void req.abort();
      } else void req.continue();
    });
    page.on("pageerror", (err) => errors.push(String(err.message)));
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForSelector('section.panel.active#initial');
    await page.click('[data-open="followup"]');
    await page.waitForSelector('section.panel.active#followup');
    await page.click('[data-open="social"]');
    await page.waitForSelector('section.panel.active#social');
    await page.click('[data-open="metricool"]');
    await page.waitForSelector('section.panel.active#metricool');
    const state = await page.evaluate(() => ({
      title: document.title,
      tabCount: document.querySelectorAll("[data-open]").length,
      active: document.querySelector("section.panel.active")?.id,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      formCount: document.querySelectorAll("form").length,
      hasNoIndex: document.querySelector('meta[name="robots"]')?.getAttribute("content")?.includes("noindex"),
    }));
    await page.screenshot({ path: resolve(outDir, "tok-autopilot-review-" + view.name + ".png"), fullPage: false });
    results.push({ view: view.name, status: response?.status(), ...state,
      blockedWrites: invalidWrites.length, errors: errors.slice(0, 3) });
    await page.close();
  }
  console.log(JSON.stringify({ url: url.origin, results, writesSent: 0 }, null, 2));
  // HTTP 304 is a valid cache revalidation response for the same URL.
  if (results.some((r) => ![200, 304].includes(r.status) || r.tabCount !== 6 ||
    r.active !== "metricool" || r.horizontalOverflow > 0 || r.formCount !== 0 ||
    r.hasNoIndex !== true || r.errors.length)) process.exitCode = 2;
} finally {
  await browser.close();
}
