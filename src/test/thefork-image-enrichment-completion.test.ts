import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("TheFork directory image enrichment completion", () => {
  it("reuses verified official sites discovered by exact web search", () => {
    const worker = read("supabase/functions/enrich-directory-images/index.ts");

    expect(worker).toContain("verifiedOfficialPages");
    expect(worker).toContain('discoveryMethod: "verified_search_result"');
    expect(worker).toContain("isLikelyOfficialRestaurantHost");
    expect(worker).toContain("findBestImageFromHomepage");
  });

  it("never imports images from TheFork-owned hosts across country domains", () => {
    const worker = read("supabase/functions/enrich-directory-images/index.ts");

    expect(worker).toContain("isTheForkHost");
    expect(worker).toContain("isRejectedSiteHost(sourceHost) || isRejectedSiteHost(imageHost)");
    expect(worker).toContain("if (isTheForkHost(normalized)) return true");
  });

  it("checks official hints before spending a Firecrawl exact-search request", () => {
    const worker = read("supabase/functions/enrich-directory-images/index.ts");
    const bestImage = worker.match(/async function findBestImage[\s\S]*?\n}\n\nasync function downloadImage/)?.[0] || "";

    expect(bestImage).toContain("getLeadHints");
    expect(bestImage).toContain("discoverWebsite");
    expect(bestImage).toContain("findExactSearchImage");
    expect(bestImage.indexOf("discoverWebsite")).toBeLessThan(bestImage.indexOf("findExactSearchImage"));
  });
});
