import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("marketing operations frontend contracts", () => {
  it("fails closed without synthetic operational data", () => {
    const fallback = read("src/marketing/fallbackSnapshot.ts");
    expect(fallback).toContain("globalPaused: true");
    expect(fallback).toContain("campaigns: []");
    expect(fallback).toContain("calendar: []");
    expect(fallback).toContain("prospects: []");
    expect(fallback).toContain("deliveries: []");
    expect(fallback).toContain("results: []");
    expect(fallback).toContain("sent: 0");
    expect(fallback).toContain("schedulerReady: false");
  });

  it("declares blocked providers and manual-only actions truthfully", () => {
    const fallback = read("src/marketing/fallbackSnapshot.ts");
    for (const channel of ["email", "push"]) expect(fallback).toContain(`id: "${channel}"`);
    for (const channel of ["instagram", "facebook", "tiktok", "linkedin", "youtube", "google_business", "telegram", "website"]) {
      expect(fallback).toContain(`\"${channel}\"`);
    }
    for (const channel of ["manual_call", "manual_email", "manual_visit"]) expect(fallback).toContain(`\"${channel}\"`);
    expect(fallback).toContain('availability: "disconnected"');
    expect(fallback).toContain('availability: "manual"');
  });

  it("uses only governed admin RPCs and the orchestrator for mutations", () => {
    const client = read("src/marketing/marketingClient.ts");
    for (const rpc of [
      "admin_upsert_marketing_campaign",
      "admin_upsert_marketing_calendar_item",
      "admin_approve_marketing_campaign",
      "admin_approve_marketing_item",
      "admin_cancel_marketing_item",
      "admin_set_marketing_global_pause",
      "admin_retry_marketing_delivery",
      "admin_complete_manual_marketing_delivery",
      "admin_complete_manual_marketing_item",
      "admin_create_marketing_campaign_bundle",
      "admin_upsert_marketing_automation",
    ]) expect(client).toContain(`\"${rpc}\"`);
    expect(client).toContain('supabase.functions.invoke("marketing-orchestrator"');
    expect(client).not.toMatch(/\.from\([^)]*marketing_[^)]+\)\s*\.\s*(insert|update|upsert|delete)/s);
    expect(client).not.toContain("as any");
  });

  it("creates drafts before separate approvals and keeps recipient identities masked", () => {
    const operations = read("src/marketing/useMarketingOperations.ts");
    const activity = read("src/components/marketing/views/MarketingActivityView.tsx");
    expect(operations).toContain('status: "draft"');
    expect(operations).toContain('approval_status: "pending"');
    expect(operations).toContain("targeting: audienceFilter");
    expect(operations).toContain("audienceEstimate.byChannel[channel]");
    expect(operations).toContain("ineligibleIndividualChannels");
    expect(operations).toContain("(audienceEstimate.byChannel[channel] ?? 0) <= 0");
    expect(operations).toContain("audienceEstimate.availabilityByChannel[channel]");
    expect(operations).toContain("isPublicMarketingChannel(channel)");
    expect(operations).not.toContain("audience_definition: audienceFilter");
    expect(operations).toContain("draft.audienceFilter.audience_kind");
    const wizard = read("src/components/marketing/views/MarketingCampaignsView.tsx");
    expect(wizard).toContain("audience_kind:");
    expect(wizard).toContain('!== "CH"');
    expect(wizard).not.toContain("{ kind:");
    expect(wizard).not.toContain("{ audience_id:");
    expect(wizard).toContain("CHANNEL_PRIORITY");
    expect(wizard).toContain("Recommandation déterministe · sans ML");
    const saveStart = operations.indexOf("const saveCampaign");
    const saveEnd = operations.indexOf("const recommendChannels", saveStart);
    const saveFunction = operations.slice(saveStart, saveEnd);
    expect(saveFunction).toContain("createMarketingCampaignBundle");
    expect(saveFunction).not.toContain("Promise.allSettled");
    expect(saveFunction).not.toContain("upsertMarketingCalendarItem");
    expect(wizard).toContain("result?.complete === true");
    expect(operations).toContain("approveMarketingCampaign");
    expect(operations).toContain("approveMarketingItem");
    expect(activity).toContain("targetMasked");
    expect(activity).toContain("delivery.scheduledAt");
    expect(activity).toContain("delivery.sentAt");
    expect(activity).toContain("delivery.manualNote");
    expect(activity).toContain("Clôturer l'action terrain");
    expect(activity).not.toMatch(/delivery\.(email|phone)\b/);
  });

  it("closes approved public manual publications through an audited RPC", () => {
    const calendar = read("src/components/marketing/views/MarketingCalendarView.tsx");
    const operations = read("src/marketing/useMarketingOperations.ts");
    expect(calendar).toContain("Clôturer la publication");
    expect(calendar).toContain('manualOutcome === "published"');
    expect(calendar).toContain('selectedChannel?.availability === "manual"');
    expect(operations).toContain("completeManualMarketingItem");
    expect(operations).toContain('outcome: "published" | "failed"');
  });

  it("refreshes calendar months and synchronizes governed audience sources", () => {
    const operations = read("src/marketing/useMarketingOperations.ts");
    const client = read("src/marketing/marketingClient.ts");
    const audiences = read("src/components/marketing/views/MarketingAudiencesView.tsx");
    expect(operations).toContain('calendarRange?.from || "default"');
    expect(client).toContain("marketingZurichDateBoundaryToIso");
    expect(client).toContain('"admin_sync_marketing_prospect_catalog"');
    expect(client).toContain('"admin_sync_marketing_client_consents"');
    expect(audiences).toContain("Synchroniser les sources");
    expect(audiences).toContain("Aperçu non juridique");
    expect(audiences).not.toContain("Éligibles dans l'aperçu");
  });

  it("does not invent approval or scheduler lifecycle states", () => {
    const types = read("src/marketing/types.ts");
    const campaigns = read("src/components/marketing/views/MarketingCampaignsView.tsx");
    const automations = read("src/components/marketing/views/MarketingAutomationsView.tsx");
    const operations = read("src/marketing/useMarketingOperations.ts");
    expect(types).not.toMatch(/MarketingCampaignStatus\s*=.*"approved"/);
    expect(campaigns).toContain('filters.status === "approved" ? Boolean(campaign.approvedAt)');
    expect(automations).toContain("snapshot.overview.schedulerReady");
    expect(operations).toContain("if (!snapshot.overview.schedulerReady)");
  });

  it("provides every requested operational view", () => {
    const workspace = read("src/pages/marketing/MarketingWorkspace.tsx");
    for (const view of ["Overview", "Calendar", "Campaigns", "Audiences", "Automations", "Activity", "Results", "Integrations"]) {
      expect(workspace).toContain(`Marketing${view}View`);
    }
  });
});
