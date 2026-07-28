import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Aligro supplier catalogue", () => {
  const migration = read("supabase/migrations/20260728030000_supplier_catalog.sql");
  const cron = read("supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql");
  const sync = read("supabase/functions/aligro-catalog-sync/index.ts");
  const dailyDish = read("supabase/functions/daily-dish-ai/index.ts");
  const config = read("supabase/config.toml");

  it("stores the catalogue behind service-role writes and additive DDL only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.supplier_catalog_products");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.supplier_catalog_syncs");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.supplier_catalog_products FROM anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON public.supplier_catalog_products TO authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.supplier_catalog_products TO service_role");

    // Sync runs are operational data: admin-only, never exposed to restaurateurs.
    expect(migration).toContain("USING (public.has_role(auth.uid(), 'admin'))");

    // The upsert is service-role only and keyed so a re-crawl updates in place.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.upsert_supplier_catalog_products");
    expect(migration).toContain("Service role required.");
    expect(migration).toContain("ON CONFLICT (supplier, url) DO UPDATE");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.upsert_supplier_catalog_products(text, jsonb) FROM PUBLIC, anon, authenticated");

    // A failed parse must not wipe a price that was previously read correctly.
    expect(migration).toContain("price_chf = COALESCE(EXCLUDED.price_chf, target.price_chf)");

    // Additive only: no existing object is dropped or rewritten.
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/DROP\s+COLUMN/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+public\.(restaurant|ops_)/i);
  });

  it("crawls politely, honours robots.txt and reports what it actually parsed", () => {
    expect(config).toContain("[functions.aligro-catalog-sync]");
    expect(sync).toContain("allowSchedulerSecret: true");
    expect(sync).toContain("if (!actor.isServiceRole) throw new HttpError(403");

    // Politeness and consent.
    expect(sync).toContain("robots.txt");
    expect(sync).toContain("function parseRobots");
    expect(sync).toContain("function isAllowed");
    expect(sync).toContain("crawl-delay");
    expect(sync).toContain("USER_AGENT");
    expect(sync).toContain("CONCURRENCY");

    // Aligro only, https only.
    expect(sync).toContain("function sameOrigin");
    expect(sync).toContain('host === "aligro.ch"');

    // Extraction leans on published formats rather than guessed selectors, and
    // each strategy is counted so the first run reveals which one works.
    expect(sync).toContain("parseJsonLdBlocks");
    expect(sync).toContain("findProductNode");
    // The literal appears escaped inside the extraction regex.
    expect(sync).toContain("application\\/ld\\+json");
    expect(sync).toContain("extracted_json_ld");
    expect(sync).toContain("extracted_open_graph");
    expect(sync).toContain("extracted_microdata");
    expect(sync).toContain("pages_without_product");
    expect(sync).toContain("stopped_reason");

    // Bounded work: no unbounded crawl, and a run that finds nothing says so
    // instead of reporting success.
    expect(sync).toContain("MAX_SITEMAP_DOCUMENTS");
    expect(sync).toContain("deadline");
    expect(sync).toContain("no_crawlable_urls");
    expect(sync).toContain('status: "blocked"');
  });

  it("schedules the refresh weekly through the existing Vault cron pattern", () => {
    expect(cron).toContain("internal_cron_secret");
    expect(cron).toContain("cron.unschedule('tok-aligro-catalog-sync')");
    expect(cron).toContain("cron.schedule('tok-aligro-catalog-sync', '15 3 * * 1'");
    expect(cron).toContain("x-internal-cron-secret");
    expect(cron).toContain("/aligro-catalog-sync");
  });

  it("lets the daily dish read prices from the database instead of searching the web", () => {
    expect(dailyDish).toContain("function loadAligroCatalog");
    expect(dailyDish).toContain('.from("supplier_catalog_products")');
    expect(dailyDish).toContain('.eq("supplier", "aligro")');

    // Only priced, fresh rows: an unpriced entry would invite an invented price.
    expect(dailyDish).toContain('.not("price_chf", "is", null)');
    expect(dailyDish).toContain("CATALOG_MAX_AGE_DAYS");

    // Enough products or nothing: a thin catalogue falls back to a live search
    // rather than proposing dishes it cannot cost.
    expect(dailyDish).toContain("MIN_CATALOG_PRODUCTS");
    expect(dailyDish).toContain("catalogUsable");
    expect(dailyDish).toContain('aligro_catalog_source: catalogUsable ? "weekly_database_sync" : "live_web_search"');

    // Refining reuses the variant's own sources, so no catalogue load there.
    expect(dailyDish).toContain("!input.currentVariant && input.actor ? await loadAligroCatalog(input.actor) : []");

    // Catalogue rows double as the allowed-source list, so a basket line can only
    // reference a product that exists.
    expect(dailyDish).toContain("sources = catalog.map((product) => ({");
    expect(dailyDish).toContain('retailer: "Aligro"');
  });
});
