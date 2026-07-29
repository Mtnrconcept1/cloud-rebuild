import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql";

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("campaign tracking integrity", () => {
  it("keeps sponsored events durable without disabling the whole browser session", () => {
    const analytics = read("src/lib/analytics.ts");

    expect(analytics).toContain("miamz-sponsored-event-queue-v1");
    expect(analytics).toContain("miamz-sponsored-social-event-queue-v1");
    expect(analytics).toContain("miamz-sponsored-deferred-conversion-queue-v1");
    expect(analytics).toContain("MAX_SPONSORED_EVENT_ATTEMPTS");
    expect(analytics).toContain("flushSponsoredEventQueue");
    expect(analytics).toContain("flushSponsoredSocialEventQueue");
    expect(analytics).toContain('"record_social_feed_event_v2"');
    expect(analytics).toContain("eventId: stableTrackingCallId");
    expect(analytics).toContain("trackingCallId: stableTrackingCallId");
    expect(analytics).toContain("touchToken: attribution.touchToken || null");
    expect(analytics).toContain("isRetryableSponsoredError");
    expect(analytics).toContain("isRetryableSponsoredSocialError");
    expect(analytics).toContain("actorUserId");
    expect(analytics).toContain("createAnalyticsTrackingCallId");
    expect(analytics).toContain("(bytes[6] & 0x0f) | 0x40");
    expect(analytics).toContain("(bytes[8] & 0x3f) | 0x80");
    expect(analytics).toContain('trackingWindow.addEventListener("online"');
    expect(analytics).toContain('trackingWindow.addEventListener("pageshow"');
    expect(analytics).not.toContain("_sponsoredTrackingDisabled");
  });

  it("waits for auth hydration and never consumes an actor event under another account", () => {
    const analytics = read("src/lib/analytics.ts");

    expect(analytics).toContain("analyticsAuthHydration");
    expect(analytics).toContain("ANALYTICS_AUTH_HYDRATION_TIMEOUT_MS");
    expect(analytics).toContain("analyticsAuthIdentityVerified");
    expect(analytics).toContain("analyticsAuthHydrationTimer");
    expect(analytics).toContain("window.clearTimeout(analyticsAuthHydrationTimer)");
    expect(analytics).toContain("if (!analyticsAuthHydrated)");
    expect(analytics).toContain("await analyticsAuthHydration");
    expect(analytics).toContain('"queued_until_auth_verified"');
    expect(analytics).toContain("replayInput.actorUserId !== currentUserId");
    expect(analytics).toContain("must not replay it under another identity");
    expect(analytics).not.toContain("currentUserId || attempts >= MAX_SPONSORED_EVENT_ATTEMPTS");
  });

  it("reports non-durable fallback honestly and uses one random runtime viewer id", () => {
    const analytics = read("src/lib/analytics.ts");

    expect(analytics).toContain("sponsoredSocialEventQueueMemory");
    expect(analytics).toContain("runtimeAnalyticsViewerId");
    expect(analytics).toContain('reason: persisted ? "queued_for_retry" : "durable_storage_unavailable"');
    expect(analytics).toContain('reason: persisted ? "queued_offline" : "durable_storage_unavailable"');
    expect(analytics).not.toContain('return "ephemeral-viewer"');
  });

  it("uses a write-ahead queue before sponsored network calls and guards in-flight replays", () => {
    const analytics = read("src/lib/analytics.ts");

    expect(analytics).toMatch(
      /trackSponsoredEvent[\s\S]*enqueueSponsoredEvent\(durableInput\)[\s\S]*await analyticsAuthHydration[\s\S]*invokeSponsoredEvent\(durableInput\)/,
    );
    expect(analytics).toMatch(
      /recordSponsoredSocialFeedEvent[\s\S]*enqueueSponsoredSocialEvent\(input\)[\s\S]*await analyticsAuthHydration[\s\S]*invokeSponsoredSocialEvent\(input\)/,
    );
    expect(analytics).toContain("sponsoredEventInFlightIds");
    expect(analytics).toContain("sponsoredSocialEventInFlightIds");
    expect(analytics).toContain("hasQueuedSponsoredSocialClick");
    expect(analytics).toContain("enqueueDeferredSponsoredConversion");
    expect(analytics).toContain("flushDeferredSponsoredConversionQueue");
    expect(analytics).toContain("claimQueuedSponsoredSocialClicks");
    expect(analytics).toContain('"queued_for_click_attribution"');
    expect(analytics).toContain("removeQueuedSponsoredEvent(eventId)");
    expect(analytics).toContain("removeQueuedSponsoredSocialEvent(stableTrackingCallId)");
  });

  it("records exactly one paid click for every Actualites CTA surface", () => {
    const card = read("src/components/social/SocialPostCard.tsx");
    const trackedCard = read("src/components/social/TrackedSocialPostCard.tsx");
    const ctaLinks = card.match(/<Link to=\{cta\.to\}[^>]*>/g) || [];

    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link).toContain('data-social-sponsored-cta="true"');
    });
    expect(trackedCard).toContain("closest(\"[data-social-sponsored-cta='true']\")");
    expect(trackedCard).toContain("button,input,textarea,select");
    expect(card).toContain('eventType: "cta_click"');
    expect(
      card.match(/restaurantId: post\.restaurantId/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("preserves all campaign touches returned by a multi-campaign social post", () => {
    const analytics = read("src/lib/analytics.ts");
    const hook = read("src/hooks/useSocialFeed.ts");
    const trackedCard = read("src/components/social/TrackedSocialPostCard.tsx");

    expect(analytics).toContain("applySponsoredSocialTrackResult");
    expect(analytics).toContain("result.attributions");
    expect(analytics).toContain("attributions.forEach");
    expect(analytics).toMatch(
      /invokeSponsoredSocialEvent\(replayInput\)[\s\S]*applySponsoredSocialTrackResult\(replayInput, result\)/,
    );
    expect(hook).toContain("recordSponsoredSocialFeedEvent");
    expect(trackedCard).toContain("recordSponsoredSocialFeedEvent");
  });

  it("keeps one impression call id per post and cleans every retry timer", () => {
    const trackedCard = read("src/components/social/TrackedSocialPostCard.tsx");

    expect(trackedCard).toContain("const impressionTrackingRef = useRef");
    expect(trackedCard).toMatch(
      /useEffect\(\(\) => \{\s*impressionTrackingRef\.current = \{[\s\S]*trackingCallId: createAnalyticsTrackingCallId\(\)/,
    );
    expect(trackedCard).toContain("[post.id]");
    expect(trackedCard).toContain("const impressionTracking = impressionTrackingRef.current");
    expect(trackedCard).toContain("trackingCallId: impressionTracking.trackingCallId");
    expect(trackedCard).toContain("lastClickAtRef.current = 0");
    expect(trackedCard).toContain("impressionRetryTimerRef");
    expect(trackedCard).toContain("if (disposed) return");
    expect(trackedCard).toContain("window.clearTimeout(impressionRetryTimerRef.current)");
  });

  it("uses one winning last-click touch per conversion instead of billing every remembered campaign", () => {
    const analytics = read("src/lib/analytics.ts");
    const sql = read(migrationPath);

    expect(analytics).toContain("for (const attribution of attributions)");
    expect(analytics).not.toContain("Promise.allSettled(");
    expect(sql).toContain("ad_campaign_conversion_entity_unique");
  });

  it("distinguishes internal tests, duplicates, pending conversions, and campaign guard rejections", () => {
    const edge = read("supabase/functions/track-sponsored-event/index.ts");

    expect(edge).toContain('reason: "internal_actor"');
    expect(edge).toContain('from("ad_campaign_internal_test_events")');
    expect(edge).toContain("eventMatchesPricingStrategy");
    expect(edge).toContain('from("ad_campaign_pending_conversions")');
    expect(edge).toContain('"rejected_by_campaign_guard"');
    expect(edge).toContain('reason: "missing_attribution_touch"');
    expect(edge).toContain("touch.viewer_id === viewerId");
    expect(edge).not.toContain("{ recorded: false, deduped: true, ignored: false }");
  });

  it("derives paid-event deduplication on the server instead of trusting rotating browser ids", () => {
    const analytics = read("src/lib/analytics.ts");
    const edge = read("supabase/functions/track-sponsored-event/index.ts");

    expect(edge).toContain("MAX_REQUEST_BODY_BYTES");
    expect(edge).toContain("isRequestOriginAllowed(req)");
    expect(edge).toContain("canonicalUuid");
    expect(edge).toContain("serverFingerprint");
    expect(edge).toContain("fingerprint:${serverFingerprint}:campaign:${campaignId}");
    expect(edge).toContain("server-derived client fingerprint and time window");
    expect(edge).toContain("invalid_authentication");
    expect(edge).toContain("sponsored-touch|${campaignId}|${eventId || dedupeKey}");
    expect(edge).toContain("tracking_call_id: eventId || null");
    expect(edge).not.toContain("SPONSORED_EVENT_SIGNING_SECRET");
    expect(analytics).not.toContain("eventSignature");
    expect(analytics).not.toContain("signedAt");
  });

  it("creates server-side internal-test and anonymous attribution ledgers", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ad_campaign_internal_test_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ad_campaign_attribution_touches");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.record_social_feed_event_v2");
    expect(sql).toContain("trackingCallId");
    expect(sql).toContain("'attributions'");
    expect(sql).toContain("get_ad_campaign_internal_test_metrics");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("p_payload->>'touch_token'");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("record_actualites_latest_click_conversion");
    expect(sql).toContain("A pending business entity has claimed this touch");
  });

  it("measures confirmed conversions after budget exhaustion while capping the billable charge", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("v_pricing_strategy");
    expect(sql).toContain("v_billable_cost");
    expect(sql).toContain("'listed_cost_chf'");
    expect(sql).toContain("'charged_cost_chf'");
    expect(sql).toContain("'unbilled_cost_chf'");
    expect(sql).toContain("greatest(COALESCE(v_campaign.cpc_rate, 0.95), 0)");
    expect(sql).toContain("greatest(COALESCE(spent, 0), 0) + v_billable_cost");
    expect(sql).toMatch(/p_event_type\s*=\s*'conversion'[\s\S]*?INSERT INTO public\.ad_campaign_events/i);
    expect(sql).toContain("ad_campaign_conversion_entity_state");
    expect(sql).toContain("'arrived'");
    expect(sql).toContain("'seated'");
    expect(sql).toContain("'completed'");
  });

  it("selects one deterministic global conversion winner and only trusts accepted paid clicks", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("ad_campaign_conversion_entity_unique");
    expect(sql).toContain("lower(trim(payload->>'entity_id'))");
    expect(sql).toContain("v_existing_touch");
    expect(sql).toContain(
      "IF v_auth_user_id IS NOT NULL THEN",
    );
    expect(sql).toContain("v_viewer_id := v_auth_user_id::text");
    expect(sql).toContain("anonymous_social_identity_unavailable");
    expect(sql).toMatch(
      /v_existing_call\.user_id IS NOT NULL[\s\S]*?v_existing_call\.user_id\s*<>\s*'00000000-0000-0000-0000-000000000000'::uuid[\s\S]*?v_existing_call\.user_id IS DISTINCT FROM v_auth_user_id/,
    );
    expect(sql).toContain("ad_campaign_event_transport_unique");
    expect(sql).toContain("'social-touch'");
    expect(sql).toContain("OR v_event.id IS DISTINCT FROM v_first_event_id");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_social_feed_event\(uuid, text, jsonb\)[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toContain("touch.tracking_call_id = v_tracking_call_id");
    expect(sql).toContain("touch.dedupe_key = v_touch_dedupe_key");
    expect(sql).toMatch(
      /pending\.user_id IS NOT NULL[\s\S]*?click\.user_id = pending\.user_id[\s\S]*?pending\.user_id IS NULL[\s\S]*?pending\.payload->>'viewer_id'[\s\S]*?pending\.payload->>'viewerId'[\s\S]*?click\.payload->>'viewer_id'[\s\S]*?click\.payload->>'viewerId'/,
    );
    expect(sql).not.toMatch(
      /AND \(\s*pending\.user_id IS NULL\s*OR click\.user_id = pending\.user_id/,
    );
    expect(sql).toContain("FROM public.ad_campaign_events paid_click");
    expect(sql).toContain("global_last_click");
    expect(sql).not.toContain("DISTINCT ON (e.campaign_id)");
  });

  it("uses one conversion lock order and never locks a touch before the entity", () => {
    const sql = read(migrationPath);
    const recorder = sql.match(
      /CREATE OR REPLACE FUNCTION public\.record_ad_campaign_event\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] || "";
    const touchHelper = sql.match(
      /CREATE OR REPLACE FUNCTION private_campaign\.record_actualites_touch_conversions\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] || "";

    expect(recorder.indexOf("hashtext('ad_campaign_conversion_entity')")).toBeGreaterThan(-1);
    expect(recorder.indexOf("hashtext('ad_campaign_conversion_entity')"))
      .toBeLessThan(recorder.indexOf("FROM public.ad_campaigns"));
    expect(touchHelper).not.toContain("FOR UPDATE OF touch");
  });

  it("shows owner and admin tests separately from paid campaign KPIs", () => {
    const summary = read("src/components/campaigns/CampaignInternalTestSummary.tsx");
    const dashboard = read("src/pages/dashboard/DashboardCampagnes.tsx");

    expect(summary).toContain("Tests internes — non facturés");
    expect(summary).toContain("get_ad_campaign_internal_test_metrics");
    expect(summary).toContain("exclues des KPI payants et du budget");
    expect(summary).toContain("refetchInterval: 10_000");
    expect(dashboard).toContain("<CampaignInternalTestSummary");
  });
});
