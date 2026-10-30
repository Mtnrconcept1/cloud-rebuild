import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { buildSeoDiscovery } from "../../scripts/build-seo-discovery.mjs";
import { auditSeoArtifact } from "../../scripts/seo-artifact-audit.mjs";

const roots: string[] = [];
const origin = "https://www.thetok.ch";
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tok-discovery-")); roots.push(root);
  const dist = path.join(root, "dist"); await mkdir(dist);
  const routes = ["/", "/restaurants/puplinge/r/cafe-de-la-poste", "/restaurants-pres/arena-geneve", "/contact"];
  await writeFile(path.join(dist, "sitemap.xml"), `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-pages.xml</loc></sitemap></sitemapindex>`);
  await writeFile(path.join(dist, "sitemap-pages.xml"), `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((r) => `<url><loc>${origin}${r}</loc></url>`).join("")}</urlset>`);
  await writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`);
  for (const route of routes) {
    const folder = path.join(dist, route); await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "index.html"), `<html><head><title>${route}</title><meta name="description" content="Page publique"><meta name="robots" content="index,follow"><link rel="canonical" href="${origin}${route}"></head><body><div id="root"><h1>${route}</h1></div></body></html>`);
  }
  return { root, dist };
}
it("makes previously orphaned pages reachable, with a permanent human-visible HTML navigation", async () => {
  const { root, dist } = await fixture();
  expect((await auditSeoArtifact(dist)).warnings).toHaveLength(3);
  const result = await buildSeoDiscovery(root);
  expect(result).toEqual({ pages: 4, restaurants: 1, venues: 1 });
  const audit = await auditSeoArtifact(dist);
  expect(audit.errors).toEqual([]); expect(audit.warnings).toEqual([]);
  const home = await readFile(path.join(dist, "index.html"), "utf8");
  expect(home.indexOf('id="tok-public-discovery"')).toBeGreaterThan(home.indexOf('</div>'));
  const hub = await readFile(path.join(dist, "decouvrir/index.html"), "utf8");
  expect(hub).toContain('href="/restaurants/puplinge/r/cafe-de-la-poste"');
  expect(hub).not.toContain('<script');
  await buildSeoDiscovery(root);
  expect((await readFile(path.join(dist, "sitemap-pages.xml"), "utf8")).match(/<loc>https:\/\/www.thetok.ch\/decouvrir<\/loc>/g)).toHaveLength(1);
  expect((await readFile(path.join(dist, "index.html"), "utf8")).match(/id="tok-public-discovery"/g)).toHaveLength(1);
});
it("refuses to publish a noindex page from a polluted sitemap", async () => {
  const { root, dist } = await fixture();
  const file = path.join(dist, "contact/index.html");
  await writeFile(file, (await readFile(file, "utf8")).replace('content="index,follow"', 'content="noindex"'));
  await expect(buildSeoDiscovery(root)).rejects.toThrow('Noindex discovery target');
});
