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
const media = [
  { id: "photo-a", media_url: "/__reel_fixture__/photo-a.png", alt_text: "Photo A", media_type: "photo" },
  { id: "photo-b", media_url: "/__reel_fixture__/photo-b.png", alt_text: "Photo B", media_type: "photo" },
  { id: "logo", media_url: "/__reel_fixture__/logo.png", alt_text: "Logo original", media_type: "marketing_logo" },
];
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
const mocks = {
  "@/lib/ai/tokVideoBrandMedia": `export async function loadTokVideoBrandMedia() { return { media: ${JSON.stringify(media)}, hasMore: false }; }`,
  "@/lib/ai/tokVideoImageUpload": 'export const VIDEO_IMAGE_ACCEPT="image/jpeg,image/png,image/webp"; export async function uploadTokVideoImage(){ throw new Error("No remote upload in this fixture"); }',
};
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false, root: process.cwd(), resolve: { alias: { "@": resolve("src") } },
  plugins: [{
    name: "isolated-reel-transports", enforce: "pre",
    resolveId(source) {
      const key = source in mocks ? source : Object.keys(mocks).find((name) => resolve("src", name.slice(2)) === source);
      if (key) return "\0" + key;
    },
    load(id) { if (id.startsWith("\0") && id.slice(1) in mocks) return mocks[id.slice(1)]; },
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
    await page.select("#reel-logo", "logo");
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
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
