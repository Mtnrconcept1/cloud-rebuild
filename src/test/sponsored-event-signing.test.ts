import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("sponsored event integrity", () => {
  it("derives billable identity and deduplication on the server", () => {
    const edgeFunction = read("supabase/functions/track-sponsored-event/index.ts");
    const analytics = read("src/lib/analytics.ts");

    expect(edgeFunction).toContain("isRequestOriginAllowed");
    expect(edgeFunction).toContain("createRateLimiter");
    expect(edgeFunction).toContain("serverFingerprint");
    expect(edgeFunction).toContain("client:${await sha256(`${clientIp}|${userAgent}`)}");
    expect(edgeFunction).toContain("Browser-generated event ids are useful for transport idempotence");
    expect(edgeFunction).toContain("cannot be trusted for billing");
    expect(edgeFunction).toContain("conversion_authentication_required");
    expect(edgeFunction).toContain("anonymous_client_identity_unavailable");
    expect(edgeFunction).toContain("is_restaurant_internal_actor");
    expect(edgeFunction).toContain("ad_campaign_internal_test_events");
    expect(edgeFunction).toContain("VALID_JOURNEY_TYPES");
    expect(edgeFunction).toContain("journey_type: journeyType || null");
    expect(edgeFunction).toContain("sha256(`actualites|${campaignId}|${conversionType || \"conversion\"}|${entityId}`)");
    expect(edgeFunction).not.toContain("SPONSORED_EVENT_SIGNING_SECRET");

    expect(analytics).toContain("trackingCallId?: string");
    expect(analytics).toContain("journeyType?: SponsoredJourneyType | null");
    expect(analytics).toContain("eventId: stableTrackingCallId");
    expect(analytics).toContain("journeyType: input.journeyType || null");
    expect(analytics).not.toContain("eventSignature");
    expect(analytics).not.toContain("signedAt");
  });
});
