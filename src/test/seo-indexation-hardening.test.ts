import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function robotsGroup(robots: string, userAgent: string) {
  return (
    robots
      .trim()
      .split(/\n\s*\n/)
      .find((group) => group.includes(`User-agent: ${userAgent}`)) || ""
  );
}

describe("SEO indexation and crawler hardening", () => {
  it("serves real 404 responses instead of rewriting unknown public URLs", () => {
    const config = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const prerender = read("scripts/prerender-seo.mjs");
    const postDeploy = read("scripts/post-deploy-check.mjs");

    expect(config.rewrites).not.toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(prerender).toContain("function renderNotFoundHtml");
    expect(prerender).toContain(
      'writeIfDirectoryExists(DIST_DIR, "404.html", renderNotFoundHtml(baseHtml))',
    );
    expect(prerender).toContain("noindex,nofollow,noarchive");
    expect(postDeploy).toContain("route-inexistante-seo-post-deploy-check");
    expect(postDeploy).toContain("expectedStatus: 404");
  });

  it("keeps search crawlers open while opting out training and bulk crawlers", () => {
    const robots = read("public/robots.txt");

    for (const crawler of [
      "Googlebot",
      "bingbot",
      "Applebot",
      "OAI-SearchBot",
      "Claude-SearchBot",
      "PerplexityBot",
    ]) {
      const group = robotsGroup(robots, crawler);
      expect(group).toContain("Allow: /");
      expect(group).not.toContain("Disallow: /");
    }

    for (const crawler of [
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
      "Bytespider",
    ]) {
      expect(robotsGroup(robots, crawler)).toContain("Disallow: /");
    }

    expect(robotsGroup(robots, "*")).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://www.thetok.ch/sitemap.xml");
  });

  it("builds segmented, image-aware sitemaps from paginated public data", () => {
    const prerender = read("scripts/prerender-seo.mjs");
    const sitemapIndex = read("public/sitemap.xml");
    const allCommittedSitemaps = [
      read("public/sitemap-pages.xml"),
      read("public/sitemap-restaurants.xml"),
      read("public/sitemap-actualites.xml"),
    ].join("\n");

    expect(prerender).toContain('fileName: "sitemap-pages.xml"');
    expect(prerender).toContain('fileName: "sitemap-restaurants.xml"');
    expect(prerender).toContain('fileName: "sitemap-actualites.xml"');
    expect(prerender).toContain("RESTAURANT_PRERENDER_BATCH_SIZE");
    expect(prerender).toContain(".range(offset, offset + batchSize - 1)");
    expect(prerender).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    );
    expect(prerender).toContain("<image:image>");
    expect(sitemapIndex).toContain("<sitemapindex");
    expect(allCommittedSitemaps).not.toMatch(
      /https:\/\/www\.thetok\.ch\/(?:admin|dashboard|courier|commercial|auth|oauth|panier|profil|notifications|commandes|reservations|points-cadeau)(?:\/|<)/,
    );
  });

  it("does not index infinite local-route combinations or empty unknown listings", () => {
    const seoHook = read("src/hooks/useSeoMeta.ts");
    const localRestaurants = read("src/pages/LocalRestaurants.tsx");
    const prerender = read("scripts/prerender-seo.mjs");

    expect(seoHook).not.toContain(
      '["/restaurant/", "/restaurants/", "/actualites/"]',
    );
    expect(localRestaurants).toContain("hasConfirmedEmptyInventory");
    expect(localRestaurants).toContain("unknownListingRoute");
    expect(localRestaurants).toContain("legacySlugMiss");
    expect(localRestaurants).toContain('"noindex,follow,noarchive"');
    expect(prerender).toContain("MIN_LOCAL_RESTAURANTS");
    expect(prerender).toContain("MIN_SPECIALIZED_LOCAL_RESTAURANTS");
    expect(prerender).toContain('page.localPageType === "city"');
    expect(localRestaurants).toContain("hasThinInventory");
    expect(prerender).toContain("MIN_ACTUALITE_TEXT_LENGTH");
    expect(prerender).toContain('page.seoKind === "local-listing"');
    expect(prerender).toContain("includeInSitemap: false");
    expect(prerender).toContain('robots: "noindex,follow,noarchive"');
  });

  it("bounds the public Supabase catalog query before invoking its private implementation", () => {
    const migration = read(
      "supabase/migrations/20260801120000_harden_public_restaurant_search_bounds.sql",
    );

    expect(migration).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100)",
    );
    expect(migration).toContain(
      "LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)",
    );
    expect(migration).toContain("left(p_query, 160)");
    expect(migration).toContain("to_regprocedure(");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.search_restaurants_catalog_unguarded",
    );
    expect(migration).toContain("TO anon, authenticated, service_role");
  });
});
