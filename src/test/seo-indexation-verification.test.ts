import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { verifySeoIndexation } from "../../scripts/verify-seo-indexation.mjs";

const temporaryDirectories: string[] = [];

async function createFixture({ noindex = false } = {}) {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "tok-seo-indexation-"));
  temporaryDirectories.push(distDir);
  await mkdir(path.join(distDir, "restaurants", "geneve"), { recursive: true });
  await writeFile(path.join(distDir, "sitemap.xml"), `<?xml version="1.0"?>
<sitemapindex><sitemap><loc>https://www.thetok.ch/sitemap-pages.xml</loc></sitemap></sitemapindex>`);
  await writeFile(path.join(distDir, "sitemap-pages.xml"), `<?xml version="1.0"?>
<urlset><url><loc>https://www.thetok.ch/restaurants/geneve</loc></url></urlset>`);
  await writeFile(path.join(distDir, "restaurants", "geneve", "index.html"), `<!doctype html><html><head>
<meta name="robots" content="${noindex ? "noindex,follow" : "index,follow"}">
<link rel="canonical" href="https://www.thetok.ch/restaurants/geneve">
</head><body><h1>Restaurants à Genève</h1><p>${"Informations utiles sur les restaurants, les cuisines, les horaires, les services de réservation et les offres locales. ".repeat(3)}</p></body></html>`);
  return distDir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("verifySeoIndexation", () => {
  it("accepts a canonical pre-rendered sitemap URL", async () => {
    await expect(verifySeoIndexation({ distDir: await createFixture() })).resolves.toEqual({ pages: 1, sitemaps: 1 });
  });

  it("rejects a noindex page present in a sitemap", async () => {
    await expect(verifySeoIndexation({ distDir: await createFixture({ noindex: true }) })).rejects.toThrow("noindex publiée dans sitemap");
  });
});
