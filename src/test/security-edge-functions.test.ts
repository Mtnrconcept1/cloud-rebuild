import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("security hardening in edge functions", () => {
  it("validates checkout return URLs before creating Stripe sessions", () => {
    const source = read("supabase/functions/create-checkout/index.ts");

    expect(source).toContain("normalizeCheckoutReturnUrl");
    expect(source).not.toContain("success_url: `${return_url}");
    expect(source).not.toContain("cancel_url: `${return_url}");
  });

  it("rate limits public analytics writes before service-role inserts", () => {
    const source = read("supabase/functions/track-analytics/index.ts");

    expect(source).toContain("createRateLimiter");
    expect(source).toContain("TRACKABLE_EVENT_NAMES_BY_ENTITY");
    expect(source).toContain("ALLOWED_EVENT_PAYLOAD_KEYS");
    expect(source).toContain("sanitizeEventPayload");
    expect(source).toContain("reject_public_analytics_event");
    expect(source).toContain("\"checkout_initiated\"");
    expect(source).toContain("\"order_completed\"");
    expect(source).toContain("\"total\"");
    expect(source).toContain("track-analytics rejected");
    expect(source).toContain("log.warn");
    expect(source).toContain("writeAuditLog");
    expect(source.indexOf("createRateLimiter")).toBeLessThan(source.indexOf("adminClient.from(\"event_store\")"));
    expect(source.indexOf("isAllowedEvent(entityType, eventName)")).toBeLessThan(source.indexOf("adminClient.from(\"event_store\")"));
    expect(source.indexOf("sanitizeEventPayload(input.payload)")).toBeLessThan(source.indexOf("adminClient.from(\"event_store\")"));
  });

  it("audits and de-duplicates Stripe Connect onboarding", () => {
    const source = read("supabase/functions/stripe-connect-onboard/index.ts");

    expect(source).toContain("authenticateRequest");
    expect(source).toContain("requireRestaurantAccess");
    expect(source).toContain("writeAuditLog");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("stripe-connect-account:${restaurant.id}");
    expect(source).toContain("persistError");
    expect(source).toContain(".select(\"id, stripe_account_id\")");
    expect(source).not.toContain("SUPABASE_ANON_KEY");
  });

  it("keeps Firecrawl seed and enrichment tools explicitly gated", () => {
    const scrape = read("supabase/functions/scrape-restaurants/index.ts");
    const enrich = read("supabase/functions/enrich-restaurants/index.ts");

    for (const source of [scrape, enrich]) {
      expect(source).toContain("ENABLE_FIRECRAWL_ADMIN_TOOLS");
      expect(source).toContain("dry_run !== false");
      expect(source).toContain("firecrawl_admin_tools_disabled");
      expect(source).toContain("writeAuditLog");
    }

    expect(scrape).toContain("firecrawl_scrape_restaurants_dry_run");
    expect(scrape).toContain("firecrawl_scrape_restaurants_write");
    expect(enrich).toContain("ENRICH_RESTAURANTS_LIMIT");
    expect(enrich).toContain(".limit(limit)");
    expect(enrich).toContain("firecrawl_enrich_restaurants_dry_run");
    expect(enrich).toContain("firecrawl_enrich_restaurants_write");
  });

  it("rate limits sponsored event writes before billable campaign recording", () => {
    const source = read("supabase/functions/track-sponsored-event/index.ts");

    expect(source).toContain("createRateLimiter");
    expect(source.indexOf("createRateLimiter")).toBeLessThan(source.indexOf("\"record_ad_campaign_event\""));
  });
});
