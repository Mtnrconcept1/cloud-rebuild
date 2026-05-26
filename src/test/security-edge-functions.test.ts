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
    expect(source.indexOf("createRateLimiter")).toBeLessThan(source.indexOf("adminClient.from(\"event_store\")"));
  });

  it("rate limits sponsored event writes before billable campaign recording", () => {
    const source = read("supabase/functions/track-sponsored-event/index.ts");

    expect(source).toContain("createRateLimiter");
    expect(source.indexOf("createRateLimiter")).toBeLessThan(source.indexOf("\"record_ad_campaign_event\""));
  });
});

