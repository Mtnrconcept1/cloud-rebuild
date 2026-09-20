import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The same behavioral suite runs with plain Node 22 and in the normal Vitest CI.
// It imports the real modules and uses temporary HTML fixtures, never production.
describe("Stoppin venue SEO", () => {
  it("passes the standalone behavioral and filesystem regression suite", () => {
    const output = execFileSync(process.execPath, ["--test", "scripts/stoppin-venue-seo.test.mjs"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
    });
    expect(output).toContain("# fail 0");
  }, 35_000);

  it("finalizes redirects after all hardening and prioritizes exact legacy redirects", () => {
    const root = process.cwd();
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
    for (const script of ["build:prod", "seo:prerender"]) {
      expect(pkg.scripts[script].endsWith("node ./scripts/apply-stoppin-venue-redirects.mjs")).toBe(true);
    }
    expect(vercel.bulkRedirectsPath).toBe(".vercel/stoppin-venue-redirects.json");
    const old = "/restaurants/carouge-ge/r/fernandes-de-almeida-restaurant-le-par";
    const exact = vercel.redirects.findIndex((rule: { source: string }) => rule.source === old);
    const generic = vercel.redirects.findIndex((rule: { source: string }) => rule.source === "/restaurants/carouge-ge/:path*");
    expect(exact).toBeGreaterThanOrEqual(0);
    expect(exact).toBeLessThan(generic);
    expect(vercel.redirects[exact].destination).toBe("/restaurants/carouge/r/fernandes-de-almeida-restaurant-le-paradisio");
    expect(vercel.redirects[exact].statusCode).toBe(301);
    const bounded = readFileSync(path.join(root, "scripts/prerender-stoppin-restaurants-bounded.mjs"), "utf8");
    expect(bounded).toContain("dedupeVenuesByPlace([...deduped.values()])");
    expect(bounded).toContain("await writeAliasReport(targetDir, new Map())");
    expect(bounded).toContain("await writeAliasReport(targetDir, bounded.aliasToCanonical)");
  });
});
