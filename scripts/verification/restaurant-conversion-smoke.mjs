/**
 * Read-only browser smoke test of TOK's public restaurateur acquisition.
 *
 * Usage: node scripts/verification/restaurant-conversion-smoke.mjs [URL] [--assert-new]
 * NEVER sends a demo form or makes a payment. POST/PUT/PATCH/DELETE are blocked.
 * Screenshots are written to ignored dist/verification/.
 */
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2] : "https://www.thetok.ch/restaurateurs/geneve";
const expectNew = process.argv.includes("--assert-new");
const url = new URL(input);
if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
  throw new Error("Invalid smoke-test URL");
}
if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" &&
  url.hostname !== "www.thetok.ch") throw new Error("Untrusted smoke-test domain");

const output = resolve(process.cwd(), "dist", "verification");
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-gpu", "--disable-extensions"],
});
try {
  const views = [];
  for (const view of [
    { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
    { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
  ]) {
    const page = await browser.newPage();
    const blockedMethods = [];
    const pageErrors = [];
    await page.setViewport(view);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedMethods.push(request.method());
        void request.abort();
        return;
      }
      void request.continue();
    });
    page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 200)));
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 35000 });
    try { await page.waitForSelector("h1", { timeout: 18000 }); } catch { /* Report page state. */ }
    await new Promise((resolve) => setTimeout(resolve, 1200)); // Allow client hydration, not just SEO prerender.
    const consent = await page.$("button");
    if (consent) {
      try {
        await page.evaluate(() => {
          const reject = [...document.querySelectorAll("button")]
            .find((el) => /Tout refuser/i.test(el.textContent ?? ""));
          reject?.click();
        });
      } catch { /* Banner absent or unavailable. */ }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const metrics = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent?.trim().slice(0, 260) ?? null,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      directSignupLinks: [...document.querySelectorAll('a[href*="/auth?role=restaurateur"]')]
        .map((el) => el.textContent?.trim()).filter(Boolean),
      demoLinks: [...document.querySelectorAll('a[href="#demande-demo"]')]
        .map((el) => el.textContent?.trim()).filter(Boolean),
      demoFormExists: !!document.querySelector("#demande-demo"),
      demoFields: [...(document.querySelector("#demande-demo")?.querySelectorAll("input,textarea,select") ?? [])]
        .map((el) => el.getAttribute("name")).filter(Boolean),
      consentOptInInitiallyChecked: document.querySelector("#marketing_optin")?.checked ?? null,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      cookieOverlapsSignup: (() => {
        const cookie = document.querySelector('button[aria-label="Gérer mes cookies"]');
        const signup = document.querySelector('a[href*="/auth?role=restaurateur"]');
        if (!cookie || !signup) return null;
        const a = cookie.getBoundingClientRect();
        const b = signup.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      })(),
    }));
    await page.screenshot({ path: resolve(output, `restaurateur-${view.name}-hero.png`) });
    if (metrics.demoFormExists) {
      await page.evaluate(() => document.querySelector("#demande-demo")?.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: resolve(output, `restaurateur-${view.name}-demo.png`) });
    }
    views.push({ view: view.name, httpStatus: response?.status() ?? null, ...metrics,
      blockedWriteRequests: blockedMethods.length, pageErrors: pageErrors.slice(0, 5) });
    await page.close();
  }
  console.log(JSON.stringify({ url: url.origin + url.pathname, views, writesSent: 0 }, null, 2));
  if (views.some((item) => ![200, 304].includes(item.httpStatus) || !item.heading || !item.demoFormExists || item.horizontalOverflowPx > 0)) {
    process.exitCode = 2;
  }
  if (expectNew && views.some((item) => !item.directSignupLinks.length)) process.exitCode = 3;
  if (expectNew && views.some((item) => item.cookieOverlapsSignup || item.consentOptInInitiallyChecked !== false)) process.exitCode = 4;
} finally {
  await browser.close();
}
