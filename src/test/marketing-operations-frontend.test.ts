import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isMarketingTotpCode,
  readMarketingCsrfToken,
} from "@/marketing/marketingBffClient";
import { normalizeMarketingSessionPayload } from "@/marketing/MarketingSessionProvider";
import { marketingPageOffset } from "@/marketing/offsetPage";

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
      expect(fallback).toContain(`"${channel}"`);
    }
    for (const channel of ["manual_call", "manual_email", "manual_visit"]) expect(fallback).toContain(`"${channel}"`);
    expect(fallback).toContain('availability: "disconnected"');
    expect(fallback).toContain('availability: "manual"');
    expect(fallback).toContain('id: "manual_visit"');
    expect(fallback).toContain("Adresse structurée et vérifiée absente");
  });

  it("uses only governed admin operations through the same-origin BFF", () => {
    const client = read("src/marketing/marketingClient.ts");
    const bff = read("src/marketing/marketingBffClient.ts");
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
      "admin_upsert_marketing_contact",
      "admin_suppress_marketing_contact",
      "admin_reveal_manual_delivery_target",
    ]) expect(client).toContain(`"${rpc}"`);
    expect(client).toContain("MARKETING_BFF_ENDPOINTS.rpc");
    expect(client).toContain("MARKETING_BFF_ENDPOINTS.orchestrator");
    expect(client).toContain("body: { operation: name, args }");
    expect(client).not.toContain("getSupabase");
    expect(client).not.toContain("supabase.rpc");
    expect(client).not.toContain("supabase.functions.invoke");
    expect(bff).toContain('rpc: "/api/marketing/rpc"');
    expect(bff).toContain('orchestrator: "/api/marketing/orchestrator"');
    expect(bff).toContain('credentials: "include"');
    expect(bff).toContain('cache: "no-store"');
    expect(bff).toContain('MARKETING_CSRF_COOKIE_NAME = "__Host-tok_marketing_csrf"');
    expect(bff).toContain('MARKETING_CSRF_HEADER_NAME = "x-tok-marketing-csrf"');
    expect(bff).toContain("MAX_MARKETING_RESPONSE_BYTES");
    expect(bff).toContain("reader.cancel()");
    expect(bff).toContain('window.location.replace(MARKETING_LOGIN_PATH)');
    expect(client).not.toMatch(/\.from\([^)]*marketing_[^)]+\)\s*\.\s*(insert|update|upsert|delete)/s);
    expect(client).not.toContain("as any");
  });

  it("isolates the privileged session and enforces MFA input contracts", () => {
    const app = read("src/App.tsx");
    const provider = read("src/marketing/MarketingSessionProvider.tsx");
    const login = read("src/pages/marketing/MarketingLogin.tsx");
    const protectedRoute = read("src/components/marketing/MarketingProtectedRoute.tsx");
    const chrome = read("src/components/marketing/MarketingWorkspaceChrome.tsx");

    expect(app).toContain("if (isMarketingExecutionLocation(pathname))");
    expect(app).toContain("return <MarketingApplication />");
    expect(app).toContain("<MarketingSessionProvider>");
    expect(app).toContain('<Route path="/marketing/login" element={<MarketingLogin />} />');
    expect(app).toContain("<MarketingProtectedRoute>");
    expect(provider).toContain("MARKETING_BFF_ENDPOINTS.session");
    expect(provider).toContain("MARKETING_BFF_ENDPOINTS.login");
    expect(provider).toContain("MARKETING_BFF_ENDPOINTS.mfaEnroll");
    expect(provider).toContain("MARKETING_BFF_ENDPOINTS.mfaVerify");
    expect(provider).toContain("MARKETING_BFF_ENDPOINTS.logout");
    expect(provider).toContain("payload.expiresAt || payload.expires_at");
    expect(provider).toContain("window.setTimeout(lockSession, remaining)");
    expect(provider).toContain('window.addEventListener("focus", revalidate)');
    expect(provider).toContain('document.addEventListener("visibilitychange", revalidateWhenVisible)');
    expect(provider).toContain("const sessionGeneration = useRef(0)");
    expect(provider).toContain("sessionGeneration.current += 1");
    expect(provider).toContain("sessionGeneration.current !== generation");
    expect(provider).not.toMatch(/localStorage|sessionStorage|getSupabase|access_token|refresh_token/);
    expect(login).toContain("qrCodeDataUrl");
    expect(login).toContain("enrollment.secret");
    expect(login).toContain('autoComplete="one-time-code"');
    expect(login).toContain('minLength={6}');
    expect(login).toContain('maxLength={6}');
    expect(protectedRoute).toContain('<Navigate to="/marketing/login" replace />');
    expect(chrome).toContain("useMarketingSession");
    expect(chrome).toContain("void logout()");
    expect(chrome).not.toContain("SignOutButton");

    expect(isMarketingTotpCode("123456")).toBe(true);
    expect(isMarketingTotpCode("12345678")).toBe(false);
    expect(isMarketingTotpCode("12345")).toBe(false);
    expect(isMarketingTotpCode("1234a6")).toBe(false);
    expect(readMarketingCsrfToken("theme=dark; __Host-tok_marketing_csrf=abcdefghijklmnop1234")).toBe("abcdefghijklmnop1234");
    expect(readMarketingCsrfToken("tok_marketing_csrf=abcdefghijklmnop1234")).toBeNull();
  });

  it("fails closed when an authenticated BFF session is expired or lacks an expiry", () => {
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    expect(normalizeMarketingSessionPayload({
      authenticated: true,
      expiresAt: "2026-08-01T12:05:00.000Z",
    }, now)).toMatchObject({
      status: "authenticated",
      expiresAt: "2026-08-01T12:05:00.000Z",
    });
    expect(normalizeMarketingSessionPayload({
      authenticated: true,
      expiresAt: "2026-08-01T11:59:59.000Z",
    }, now)).toEqual({ status: "unauthenticated", enrollment: null, expiresAt: null });
    expect(normalizeMarketingSessionPayload({ authenticated: true }, now)).toEqual({
      status: "unauthenticated",
      enrollment: null,
      expiresAt: null,
    });
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
    expect(activity).toContain("Traiter l'action manuelle");
    expect(activity).not.toMatch(/delivery\.(email|phone)\b/);
  });

  it("qualifies and suppresses restaurant contacts without starting an external send", () => {
    const audiences = read("src/components/marketing/views/MarketingAudiencesView.tsx");
    const operations = read("src/marketing/useMarketingOperations.ts");
    const client = read("src/marketing/marketingClient.ts");

    expect(audiences).toContain("Qualifier un restaurant");
    expect(audiences).toContain("Base légale");
    expect(audiences).toContain("Source de preuve");
    expect(audiences).toContain("Justification et périmètre");
    expect(audiences).toContain("aucun envoi");
    expect(audiences).toContain("Confirmer l'opposition");
    expect(operations).toContain("upsertMarketingRestaurantContact");
    expect(operations).toContain("suppressMarketingContact");
    expect(client).toContain('"admin_upsert_marketing_contact"');
    expect(client).toContain('"admin_suppress_marketing_contact"');
    expect(client).toContain("evidence_source");
    expect(client).toContain("evidence_at");
  });

  it("keeps lists masked and reveals a manual target only in ephemeral dialog state", () => {
    const activity = read("src/components/marketing/views/MarketingActivityView.tsx");
    const client = read("src/marketing/marketingClient.ts");
    const bff = read("src/marketing/marketingBffClient.ts");

    expect(activity).toContain("targetMasked");
    expect(activity).toContain("Motif d'accès obligatoire");
    expect(activity).toContain("Vérifier et révéler la cible");
    expect(activity).toContain("setRevealedTarget(null)");
    expect(activity).toContain("revealedTarget.target");
    expect(activity).toContain("const revealGeneration = useRef(0)");
    expect(activity).toContain("revealGeneration.current === requestGeneration");
    expect(activity).toContain("target.deliveryId === delivery.id");
    expect(activity).toContain("revealedTarget.deliveryId !== manualDelivery.id");
    expect(activity).toContain("openManualDialog(delivery)");
    expect(activity).not.toMatch(/delivery\.(email|phone)\b/);
    expect(client).toContain('"admin_reveal_manual_delivery_target"');
    expect(client).toContain("responseDeliveryId !== deliveryId");
    expect(bff).toContain('cache: "no-store"');
  });

  it("loads contact and delivery pages from the backend beyond the snapshot sample", () => {
    const client = read("src/marketing/marketingClient.ts");
    const operations = read("src/marketing/useMarketingOperations.ts");
    const workspace = read("src/pages/marketing/MarketingWorkspace.tsx");
    const audiences = read("src/components/marketing/views/MarketingAudiencesView.tsx");
    const activity = read("src/components/marketing/views/MarketingActivityView.tsx");
    const contactHelper = client.slice(
      client.indexOf("export async function listMarketingContactsPage"),
      client.indexOf("export async function listMarketingDeliveriesPage"),
    );
    const deliveryHelper = client.slice(
      client.indexOf("export async function listMarketingDeliveriesPage"),
      client.indexOf("export async function loadMarketingSnapshot"),
    );

    for (const helper of [contactHelper, deliveryHelper]) {
      for (const argument of ["p_query", "p_status", "p_channel", "p_limit", "p_offset"]) {
        expect(helper).toContain(argument);
      }
      expect(helper).not.toContain("p_cursor_");
    }
    expect(contactHelper).toContain('"admin_list_marketing_contacts"');
    expect(deliveryHelper).toContain('"admin_list_marketing_deliveries"');
    expect(client).toContain("normalizeOffsetPage");
    expect(client).toContain("normalizeMarketingListQuery");
    expect(client).toContain("normalized.length > 80");
    expect(read("src/marketing/useMarketingUrlState.ts")).toContain(".slice(0, 80)");
    expect(audiences).toContain("maxLength={80}");
    expect(activity).toContain("maxLength={80}");
    expect(client).toContain("rawItems.length > total");
    expect(operations).toContain("loadContactsPage");
    expect(operations).toContain("loadDeliveriesPage");
    expect(workspace).toContain("onLoadContactsPage={operations.loadContactsPage}");
    expect(workspace).toContain("onLoadDeliveriesPage={operations.loadDeliveriesPage}");
    expect(audiences).toContain("total={contactPage.total}");
    expect(activity).toContain("total={deliveryPage.total}");
    expect(audiences).not.toContain("snapshot.prospects.filter");
    expect(activity).not.toContain("snapshot.deliveries.filter");
    expect(marketingPageOffset(11, 10)).toBe(100);
    expect(marketingPageOffset(18, 12)).toBe(204);
  });

  it("invalidates stale list responses and reloads a former manual_required row after closure", () => {
    const operations = read("src/marketing/useMarketingOperations.ts");
    const audiences = read("src/components/marketing/views/MarketingAudiencesView.tsx");
    const activity = read("src/components/marketing/views/MarketingActivityView.tsx");

    expect(audiences).toContain("const contactsGeneration = useRef(0)");
    expect(audiences).toContain("contactsGeneration.current !== generation");
    expect(audiences).toContain("setContactPage(EMPTY_CONTACT_PAGE)");
    expect(audiences).toContain("contactsRevision");
    expect(activity).toContain("const deliveriesGeneration = useRef(0)");
    expect(activity).toContain("deliveriesGeneration.current !== generation");
    expect(activity).toContain("setDeliveryPage(EMPTY_DELIVERY_PAGE)");
    expect(activity).toContain("deliveriesRevision");
    expect(activity).toContain("Aucune ancienne page n'est conservée");
    expect(operations).toContain("setContactsRevision((current) => current + 1)");
    expect(operations).toContain("setDeliveriesRevision((current) => current + 1)");
    const completion = operations.slice(
      operations.indexOf("const completeManualDelivery"),
      operations.indexOf("const cancelItem"),
    );
    expect(completion).toContain("setDeliveriesRevision((current) => current + 1)");
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

  it("synchronizes sources with bounded resumable batches", () => {
    const client = read("src/marketing/marketingClient.ts");
    const operations = read("src/marketing/useMarketingOperations.ts");
    const audiences = read("src/components/marketing/views/MarketingAudiencesView.tsx");
    const catalog = client.slice(
      client.indexOf("export async function syncMarketingProspectCatalog"),
      client.indexOf("export async function syncMarketingClientConsents"),
    );
    const consents = client.slice(
      client.indexOf("export async function syncMarketingClientConsents"),
      client.indexOf("export async function upsertMarketingAutomation"),
    );

    for (const argument of ["p_limit", "p_after_source_objectid", "p_until_source_objectid"]) {
      expect(catalog).toContain(argument);
    }
    for (const argument of ["p_limit", "p_cursor"]) expect(consents).toContain(argument);
    expect(consents).not.toContain("p_after_user_id");
    expect(client).toContain("normalizeSourceSyncBatch");
    expect(client).toContain("hasMore === complete");
    expect(client).toContain("rawNextCursor.length > 512");
    expect(client).toContain("Curseur de synchronisation invalide");
    expect(operations).toContain("SOURCE_SYNC_BATCH_SIZE = 500");
    expect(operations).toContain("MAX_SOURCE_SYNC_BATCHES = 20");
    expect(operations).toContain("batchIndex < MAX_SOURCE_SYNC_BATCHES");
    expect(operations).toContain("batch.hasMore !== true");
    expect(operations).toContain("sourceSyncResume.catalog");
    expect(operations).toContain("sourceSyncResume.consents");
    expect(operations).toContain("dernier curseur confirmé");
    expect(audiences).toContain("lots bornés et reprenables");
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
