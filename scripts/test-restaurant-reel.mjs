/** Isolated real-browser check. No accounts, provider calls or external network requests. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import puppeteer from "puppeteer";

const output = resolve(process.env.REEL_TEST_OUTPUT || "artifacts/restaurant-reel");
// Exact color fixtures allow inspection of source preservation independently of a generative model.
function png(width, height, pixel) {
  const crc = (buffer) => {
    let value = 0xffffffff;
    for (const byte of buffer) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, data) => {
    const type = Buffer.from(kind); const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const images = {
  "photo-a.png": png(900, 600, (x, y) => x < 30 || y < 30 ? [220, 90, 45, 255] : [36, 74, 116, 255]),
  "photo-b.png": png(600, 900, (x, y) => x < 30 || y < 30 ? [235, 190, 70, 255] : [66, 124, 80, 255]),
  "logo.png": png(300, 200, (x, y) => x < 15 || y < 15 || x > 285 || y > 185 ? [0, 0, 0, 0]
    : (x > 130 && x < 170) || (y > 80 && y < 120) ? [25, 40, 60, 255] : [255, 202, 0, 255]),
};
const mockedTransports = new Set(["@/lib/ai/tokVideoBrandMedia", "@/lib/ai/tokVideoImageUpload", "@/integrations/supabase/client"]);
const fixtureTransport = resolve("src/test/fixtures/restaurant-reel-transports.ts");
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false, root: process.cwd(), resolve: { alias: { "@": resolve("src") } },
  optimizeDeps: { entries: ["scripts/fixtures/restaurant-reel-preview.html"] },
  plugins: [{
    name: "isolated-reel-transports", enforce: "pre",
    resolveId(source) {
      if (mockedTransports.has(source)
        || [...mockedTransports].some((name) => resolve("src", name.slice(2)) === source)) return fixtureTransport;
    },
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__reel_fixture__/")) return next();
        const body = images[req.url.split("/").pop()];
        if (!body) { res.statusCode = 404; res.end(); return; }
        res.setHeader("content-type", "image/png"); res.end(body);
      });
    },
  }, react()],
  server: { host: "127.0.0.1", port: 4197, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=fr-FR"],
  });
  for (const width of [390, 320, 1440]) {
    const page = await browser.newPage(); const errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://127.0.0.1:4197/") || url.startsWith("data:") || url.startsWith("blob:")) void request.continue();
      else { errors.push("Unexpected remote request: " + new URL(url).origin); void request.abort(); }
    });
    await page.evaluateOnNewDocument(() => { localStorage.clear(); });
    await page.goto("http://127.0.0.1:4197/scripts/fixtures/restaurant-reel-preview.html", { waitUntil: "networkidle0" });
    await page.waitForSelector('button[aria-label="Sélectionner Photo A"]');
    await page.click('button[aria-label="Sélectionner Photo A"]');
    await page.click('button[aria-label="Sélectionner Photo B"]');
    await page.select("#reel-logo", "30000000-0000-4000-8000-000000000003");
    await page.type("#tok-video-prompt", "Images fixes, coupes franches, fond blanc, logo en bas");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Appliquer les consignes au montage")?.click());
    await page.type("#reel-caption", "Notre restaurant vous accueille pour découvrir la cuisine de notre équipe et partager un moment autour de notre table.");
    await page.waitForSelector('canvas[aria-label="Aperçu du reel avec les médias sélectionnés"]');
    await page.evaluate(async () => { await document.fonts.ready; });
    const metrics = await page.evaluate(() => {
      const names = ["Importer mon logo", "Appliquer les consignes au montage", "Créer mon reel de 10 secondes"];
      const clippedActions = [...document.querySelectorAll("button")].filter((button) => names.includes(button.textContent.trim())).filter((button) => {
        const bounds = button.getBoundingClientRect();
        const parent = button.parentElement.getBoundingClientRect();
        if (bounds.left < parent.left - 1 || bounds.right > parent.right + 1) return true;
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          if ([...range.getClientRects()].some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1
            || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return true;
        }
        return false;
      }).map((button) => button.textContent.trim());
      return { overflow: document.documentElement.scrollWidth - innerWidth,
        logoWidth: document.querySelector("#reel-logo").getBoundingClientRect().width, clippedActions,
        motion: document.querySelector("#reel-motion").value, photos: document.querySelectorAll('[aria-label="Ordre des photos du reel"] li').length };
    });
    assert.equal(metrics.motion, "none"); assert.equal(metrics.photos, 2); assert.ok(metrics.overflow <= 2, "horizontal overflow");
    assert.ok(metrics.logoWidth >= 120, "logo selector must remain readable");
    assert.deepEqual(metrics.clippedActions, [], "creation controls must remain fully readable");
    assert.deepEqual(await page.evaluate(() => window.__verifyDissolve()), [255, 0, 0, 255], "a dissolve between identical sources must preserve their colors");
    await page.evaluate(() => new Promise((done) => { scrollTo(0, 0); requestAnimationFrame(done); }));
    await page.screenshot({ path: resolve(output, `studio-${width}.png`), fullPage: true });
    if (width === 390) {
      await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Créer mon reel de 10 secondes")?.click());
      await page.waitForSelector('video[aria-label="Reel final de 10 secondes"]', { timeout: 120_000 });
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Ajouter au brouillon d'actualité").disabled), true);
      await page.evaluate(() => {
        [...document.querySelectorAll("label")].find((label) => label.textContent.includes("J'ai vérifié mon reel"))?.querySelector("input")?.click();
      });
      await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Ajouter au brouillon d'actualité")?.click());
      await page.waitForFunction(() => Boolean(window.__reelExport));
      assert.equal(await page.evaluate(() => window.__validateReel()), true);
      const encoded = await page.evaluate(async () => {
        const bytes = new Uint8Array(await window.__reelExport.arrayBuffer()); let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      });
      await writeFile(resolve(output, "reel-10s.mp4"), Buffer.from(encoded, "base64"));
      console.log("Real MP4 exported; complete decode and 10s/9:16 validation passed.");
      if (process.env.REEL_TEST_FFMPEG === "true") {
        const original = resolve(output, "reel-10s.mp4");
        const metadata = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration", "-of", "json", original], { encoding: "utf8" }));
        assert.deepEqual(metadata.streams[0], { codec_name: "h264", width: 720, height: 1280, r_frame_rate: "30/1", duration: "10.000000", nb_read_frames: "300" });
        await writeFile(resolve(output, "ffprobe.json"), JSON.stringify(metadata, null, 2));
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", original, "-t", "9", "-an", "-c:v", "copy", "-movflags", "+faststart", resolve(output, "short.mp4")]);
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", original, "-vf", "scale=320:180", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-movflags", "+faststart", resolve(output, "landscape.mp4")]);
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", original, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "11", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", resolve(output, "long-audio.mp4")]);
        const bytes = await readFile(original);
        await writeFile(resolve(output, "truncated.mp4"), bytes.subarray(0, Math.floor(bytes.length / 2)));
        for (const name of ["short", "landscape", "long-audio", "truncated"]) {
          const data = (await readFile(resolve(output, name + ".mp4"))).toString("base64");
          const accepted = await page.evaluate(async (data) => {
            const file = new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], "candidate.mp4", { type: "video/mp4" });
            try { return await window.__validateReel(file); } catch { return false; }
          }, data);
          assert.equal(accepted, false, name + " must be rejected");
        }
        console.log("FFprobe: 720x1280, H.264, 300 frames, 30fps, 10.000s. Four invalid real MP4s rejected.");
      }
    }
    assert.deepEqual(errors, [], "browser errors"); console.log(JSON.stringify({ width, ...metrics, errors }));
    if (width <= 390) {
      await page.goto("http://127.0.0.1:4197/scripts/fixtures/restaurant-reel-preview.html?dialog=1", { waitUntil: "networkidle0" });
      await page.waitForSelector('button[aria-label="Sélectionner Photo A"]');
      await page.click('button[aria-label="Sélectionner Photo A"]');
      await page.select("#reel-logo", "30000000-0000-4000-8000-000000000003");
      await page.type("#tok-video-prompt", "Animer doucement les photos sélectionnées sans ajouter de sujet");
      await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Animation IA"))?.click());
      await page.waitForFunction(() => [...document.querySelectorAll("label")].some((label) => label.textContent.includes("J'autorise une interprétation")));
      await page.evaluate(() => [...document.querySelectorAll("label")].find((label) => label.textContent.includes("J'autorise une interprétation"))?.querySelector("input")?.click());
      await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Obtenir le devis de l'animation"))?.click());
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Confirmer et générer")));
      const dialogMetrics = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const clippedActions = [...dialog.querySelectorAll("button")].filter((button) => button.textContent.includes("Confirmer et générer")).filter((button) => {
          const bounds = button.getBoundingClientRect();
          const parent = button.parentElement.getBoundingClientRect();
          if (bounds.left < parent.left - 1 || bounds.right > parent.right + 1) return true;
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            if ([...range.getClientRects()].some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1
              || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return true;
          }
          return false;
        }).map((button) => button.textContent.trim());
        return { overflow: dialog.scrollWidth - dialog.clientWidth, clippedActions };
      });
      assert.ok(dialogMetrics.overflow <= 2, "Actualites dialog must not overflow horizontally");
      assert.deepEqual(dialogMetrics.clippedActions, [], "AI confirmation must fit inside the mobile dialog");
      await page.screenshot({ path: resolve(output, `studio-dialog-ai-${width}.png`), fullPage: true });
      assert.deepEqual(errors, [], "dialog browser errors");
      console.log(JSON.stringify({ width, dialog: dialogMetrics }));
    }
    await page.close();
  }
  // The Marketing route uses the real normalization/quote functions in its
  // isolated transport. The accepted receipt below is synthetic, never paid.
  for (const width of [320, 768, 1440]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({ width, height: 950, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (/^(http:\/\/127\.0\.0\.1:4197\/|data:|blob:)/.test(request.url())) void request.continue();
      else { errors.push("Unexpected remote request"); void request.abort(); }
    });
    const byLabelId = async (name) => page.evaluate((name) => [...document.querySelectorAll("label")]
      .find((label) => label.textContent.trim() === name)?.htmlFor, name);
    const selectLabel = async (name, value) => {
      const id = await byLabelId(name);
      assert.ok(id, "Missing control: " + name);
      await page.select('[id="' + id + '"]', value);
    };
    const typeLabel = async (name, value) => {
      const id = await byLabelId(name);
      assert.ok(id, "Missing control: " + name);
      await page.type('[id="' + id + '"]', value);
    };
    const clickText = async (text) => page.evaluate((text) => [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes(text))?.click(), text);
    await page.goto("http://127.0.0.1:4197/scripts/fixtures/restaurant-reel-preview.html?mode=marketing&fixtureStart=1", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => [...document.querySelectorAll("label")].some((label) => label.textContent === "Style de publicité"));
    await page.click('button[aria-label="Sélectionner Photo A"]');
    await page.click('button[aria-label="Sélectionner Photo B"]');
    await page.select("#reel-logo", "30000000-0000-4000-8000-000000000003");
    await page.type("#tok-video-prompt", "Mouvements doux et transitions nettes entre les photos sélectionnées.");
    await selectLabel("Style de publicité", "tv_spot");
    await selectLabel("Durée", "15");
    await selectLabel("Résolution", "1080p");
    await selectLabel("Format d’image", "16:9");
    await selectLabel("Type de fichier", "mov");
    await selectLabel("Débit vidéo", "high");
    await selectLabel("Photo du produit principal", "30000000-0000-4000-8000-000000000001");
    await selectLabel("Référence de fin", "30000000-0000-4000-8000-000000000002");
    await typeLabel("Accroche visuelle", "Révéler le détail puis le produit photographié.");
    await typeLabel("Appel à l’action à afficher (facultatif)", "Réservez votre table");
    await page.evaluate(() => [...document.querySelectorAll("label")]
      .find((label) => label.textContent.includes("J'autorise une interprétation"))?.querySelector("input")?.click());
    await clickText("Obtenir le devis de l'animation");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Confirmer et générer")));
    const firstQuote = await page.evaluate(() => window.__videoFixtureRequests.find((request) => request.action === "quote"));
    assert.equal(firstQuote.duration, 15);
    assert.equal(firstQuote.outputFormat, "mov");
    assert.equal(firstQuote.marketing.creativeFormat, "tv_spot");
    assert.equal(firstQuote.marketing.callToAction, "Réservez votre table");
    await selectLabel("Durée", "12");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Confirmer et générer"))), false,
      "Any setting change must invalidate the approved quote");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => [...document.querySelectorAll("label")].some((label) => label.textContent === "Style de publicité"));
    const restored = await page.evaluate(() => {
      const input = (name) => document.getElementById([...document.querySelectorAll("label")].find((label) => label.textContent.trim() === name)?.htmlFor);
      return { duration: input("Durée")?.value, resolution: input("Résolution")?.value,
        cta: input("Appel à l’action à afficher (facultatif)")?.value, output: input("Type de fichier")?.value };
    });
    assert.deepEqual(restored, { duration: "12", resolution: "1080p", cta: "Réservez votre table", output: "mov" });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Confirmer et générer"))), false,
      "A price approval must never survive reload");
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
      unlabeled: [...document.querySelectorAll('select,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea')]
        .filter((element) => !element.labels?.length && !element.getAttribute("aria-label")).map((element) => element.tagName) }));
    assert.ok(metrics.overflow <= 2, "Marketing studio must fit at " + width + " px");
    assert.deepEqual(metrics.unlabeled, [], "Every marketing input must have a label");
    await page.screenshot({ path: resolve(output, `marketing-${width}.png`), fullPage: true });
    await clickText("Obtenir le devis de l'animation");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Confirmer et générer")));
    await page.evaluate(() => [...document.querySelectorAll("label")]
      .find((label) => label.textContent.includes("Je confirme le débit"))?.querySelector("input")?.click());
    await clickText("Confirmer et générer");
    await page.waitForFunction(() => window.__videoFixtureRequests.some((request) => request.action === "start"));
    const submitted = await page.evaluate(() => window.__videoFixtureRequests.filter((request) => request.action === "start"));
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].duration, 12);
    assert.equal(submitted[0].resolution, "1080p");
    assert.equal(submitted[0].aspectRatio, "16:9");
    assert.equal(submitted[0].outputFormat, "mov");
    assert.equal(submitted[0].bitrateMode, "high");
    assert.equal(submitted[0].marketing.endImageMediaId, "30000000-0000-4000-8000-000000000002");
    assert.deepEqual(errors, [], "Marketing browser errors");
    console.log(JSON.stringify({ width, marketing: metrics, output: restored, syntheticStarts: submitted.length, errors }));
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
