import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditSeoArtifact, inspectSitemap } from "../../scripts/seo-artifact-audit.mjs";
import { runPostDeployCheck } from "../../scripts/post-deploy-check.mjs";

const roots: string[] = [];
const origin = "https://www.thetok.ch";
const xml = (urls: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
const html = (url: string, robots = "index,follow", extra = "") => `<!doctype html><html><head><title>${url}</title><meta name="description" content="Adresses vérifiées"><link rel="canonical" href="${url}"><meta name="robots" content="${robots}"></head><body><h1>Restaurants</h1>${extra}</body></html>`;
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "tok-seo-gate-")); roots.push(dir);
  await writeFile(path.join(dir, "sitemap.xml"), xml([origin + "/"]));
  await writeFile(path.join(dir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(path.join(dir, "index.html"), html(origin + "/"));
  return dir;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
describe("deployable SEO artifact validation", () => {
  it("accepts HTML without running embedded scripts", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "index.html"), html(origin + "/", "index,follow", '<script>throw new Error("must not execute")</script>'));
    expect((await auditSeoArtifact(dir)).ok).toBe(true);
  });
  it("rejects missing prerender, noindex, mismatched canonical and invalid JSON-LD", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "index.html"), html(origin + "/wrong", "noindex").replace("<h1>Restaurants</h1>", '<script type="application/ld+json">broken</script>'));
    const result = await auditSeoArtifact(dir);
    expect(result.ok).toBe(false);
    for (const part of ["H1", "Canonical", "Noindex", "JSON-LD"]) expect(result.errors.some((e: { message: string }) => e.message.includes(part))).toBe(true);
  });
  it("rejects private routes and missing sitemap targets", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "sitemap.xml"), xml([origin + "/", origin + "/dashboard", origin + "/absent"]));
    const result = await auditSeoArtifact(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: { message: string }) => e.message.includes("Private route"))).toBe(true);
    expect(result.errors.some((e: { url: string }) => e.url.endsWith("/absent"))).toBe(true);
  });
  it("detects duplicates and pages unreachable from the home HTML", async () => {
    const dir = await fixture(); await mkdir(path.join(dir, "orphan"));
    await writeFile(path.join(dir, "sitemap.xml"), xml([origin + "/", origin + "/orphan"]));
    await writeFile(path.join(dir, "orphan/index.html"), html(origin + "/orphan").replace(`<title>${origin}/orphan</title>`, `<title>${origin}/</title>`));
    const result = await auditSeoArtifact(dir);
    expect(result.errors.some((e: { message: string }) => e.message.includes("Duplicate title"))).toBe(true);
    expect(result.warnings.some((e: { url: string }) => e.url.endsWith("/orphan"))).toBe(true);
  });
  it("blocks global Googlebot disallow while allowing a training crawler policy", async () => {
    const dir = await fixture();
    const sitemap = `Sitemap: ${origin}/sitemap.xml`;
    await writeFile(path.join(dir, "robots.txt"), `User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n${sitemap}`);
    expect((await auditSeoArtifact(dir)).ok).toBe(true);
    await writeFile(path.join(dir, "robots.txt"), `User-agent: Googlebot\nDisallow: /\n${sitemap}`);
    expect((await auditSeoArtifact(dir)).ok).toBe(false);
  });
  it("parses sitemap namespaces and image locs without counting images as pages", () => {
    const source = xml([origin + "/"]).replace('</url>', '<image:image xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><image:loc>https://example.org/photo.webp</image:loc></image:image></url>');
    expect(inspectSitemap(source).urls).toEqual([origin + "/"]);
    expect(() => inspectSitemap("<broken>")).toThrow();
    expect(() => inspectSitemap(xml(["https://example.org/"]))).toThrow();
  });
  it("accepts genuine changed dates without requiring a frozen September date", async () => {
    const source = xml([origin + "/"]).replace('</url>', '<lastmod>2026-10-20</lastmod></url>');
    const result = await runPostDeployCheck([{ url: `data:application/xml,${encodeURIComponent(source)}`, sitemap: true }]);
    expect(result.ok).toBe(true);
    expect(() => inspectSitemap(source.replace('2026-10-20', '2099-10-20'))).toThrow();
    expect(() => inspectSitemap(source.replace('2026-10-20', '2026-02-30'))).toThrow();
    expect(() => inspectSitemap(source.replace('2026-10-20', '2026-09-18T23:00:00-05:00'))).not.toThrow();
  });
  it("does not allow a cyclic sitemap index to hide an empty artifact", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "sitemap.xml"), `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap.xml</loc></sitemap></sitemapindex>`);
    const result = await auditSeoArtifact(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: { message: string }) => e.message.includes("cyclic"))).toBe(true);
  });
});
