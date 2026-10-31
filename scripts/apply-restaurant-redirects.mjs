import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const ORIGIN = "https://www.thetok.ch";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESTINATION = /^\/restaurants\/[a-z0-9-]+\/r\/[a-z0-9-]+$/;

export async function applyRestaurantRedirects(root = process.cwd()) {
  const dist = path.resolve(root, "dist");
  let candidates = [];
  try { candidates = JSON.parse(await readFile(path.join(dist, "restaurant-aliases.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!Array.isArray(candidates) || candidates.length > 10000) throw new Error("Invalid restaurant alias inventory");
  const destinations = new Map();
  for (const entry of candidates) {
    if (!UUID.test(entry.id) || !DESTINATION.test(entry.path)) throw new Error("Unsafe restaurant alias candidate");
    let dom;
    try {
      dom = new JSDOM(await readFile(path.join(dist, entry.path.slice(1), "index.html"), "utf8"));
      const doc = dom.window.document;
      const canonical = [...doc.querySelectorAll('link[rel~="canonical" i]')];
      if (canonical.length !== 1 || canonical[0].getAttribute("href") !== ORIGIN + entry.path) continue;
      if (doc.querySelector('meta[http-equiv="refresh" i]')) continue;
      if ([...doc.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]')].some((meta) =>
        /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(meta.getAttribute("content") || ""))) continue;
      const source = `/restaurant/${entry.id.toLowerCase()}`;
      if (destinations.has(source) && destinations.get(source) !== entry.path) throw new Error("Conflicting restaurant alias");
      destinations.set(source, entry.path);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    finally { dom?.window.close(); }
  }
  const redirects = [...destinations].sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([source, destination]) => [source, `${source}/`].map((value) => ({ source: value, destination })));
  const output = path.resolve(root, ".vercel/restaurant-redirects.mjs");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `export default ${JSON.stringify(redirects)};\n`, "utf8");
  // Candidate metadata is build-only; never serve identifiers that were removed
  // by the final quality pass as a public feed.
  await writeFile(path.join(dist, "restaurant-aliases.json"), "[]\n", "utf8");
  return redirects;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const redirects = await applyRestaurantRedirects();
  console.log(`SEO restaurants: ${redirects.length} UUID alias redirects validated.`);
}
