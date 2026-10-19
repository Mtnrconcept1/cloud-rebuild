import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingWorkspace from "@/pages/marketing/MarketingWorkspace";
import { ensureSeoMetadataForRoute } from "@/hooks/useSeoMeta";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem, type MarketingReviewContext } from "@/marketing/marketingClient";
import type { MarketingCampaign, MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const { environment, loadReview } = vi.hoisted(() => ({
  environment: { snapshot: null as MarketingSnapshot | null, filters: null as MarketingUrlState | null },
  loadReview: vi.fn(),
}));
vi.mock("@/marketing/useMarketingUrlState", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/useMarketingUrlState")>(),
  useMarketingUrlState: () => ({ state: environment.filters, setView: vi.fn(), update: vi.fn() }),
}));
vi.mock("@/marketing/marketingClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingClient")>(), loadMarketingReviewContext: loadReview,
}));
vi.mock("@/marketing/useMarketingOperations", () => ({ useMarketingOperations: () => ({
  snapshot: environment.snapshot, loading: false, refreshing: false, canMutateBackend: true, pendingAction: null,
}) }));
vi.mock("@/marketing/useMarketingAutopilot", () => ({ useMarketingAutopilot: () => ({ notice: null }) }));
vi.mock("@/marketing/MarketingSessionContext", () => ({ useMarketingSession: () => ({ logout: vi.fn(), submitting: false }) }));
vi.mock("@/components/marketing/views/MarketingCalendarView", () => ({ default: ({ snapshot, canMutateBackend, reviewPending, reviewError }: {
  snapshot: MarketingSnapshot; canMutateBackend: boolean; reviewPending: boolean; reviewError: string | null;
}) => <section>
  <output aria-label="Éléments résolus">{JSON.stringify(snapshot.calendar.map((item) => ({ id: item.id, status: item.status })))}</output>
  <button disabled={!canMutateBackend}>Approuver la publication test</button>
  {reviewPending ? <p>Revue en actualisation</p> : null}
  {reviewError ? <output aria-label="Erreur de revue">{reviewError}</output> : null}
</section> }));

const campaignId = "82450000-0000-4000-8000-000000000001";
const itemId = "82450000-0000-4000-8000-000000000002";
const campaign: MarketingCampaign = {
  id: campaignId, name: "Campagne Genève", objective: "Faire découvrir TOK", status: "draft", audienceId: "", audienceName: "Genève",
  channels: ["instagram"], startsAt: "2026-11-01T09:00:00Z", endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0,
  requiresApproval: true, content: "Découvrez TOK", approvedAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z",
};
const item = normalizeCalendarItem({ id: itemId, campaign_id: campaignId, title: "Publication novembre", channel: "instagram",
  scheduled_at: "2026-11-15T09:00:00Z", status: "draft", approval_status: "pending", content: "Découvrez TOK à Genève.",
  updated_at: "2026-10-19T12:00:00Z" });
const clients: QueryClient[] = [];
beforeEach(() => {
  loadReview.mockReset();
  environment.snapshot = { ...createFallbackMarketingSnapshot(), source: "backend", campaigns: [campaign], calendar: [] };
  environment.filters = { view: "calendar", query: "", status: "all", channel: "all", page: 1, from: "2026-11-01", to: "2026-11-30", campaignId, itemId };
  window.history.replaceState(null, "", "/marketing");
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); window.history.replaceState(null, "", "/"); });

function mount(cached?: MarketingReviewContext) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  if (cached) client.setQueryData(["admin-marketing-review-context", campaignId, itemId], cached);
  return render(<MarketingWorkspace />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

describe("marketing workspace exact review context", () => {
  it("waits for an out-of-sample item before declaring it unavailable", async () => {
    let resolve!: (value: MarketingReviewContext) => void;
    loadReview.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount();
    expect(screen.getByText("Revue en actualisation")).toBeInTheDocument();
    expect(screen.queryByLabelText("Erreur de revue")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeDisabled();
    await act(async () => { resolve({ campaign, item }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeEnabled());
    expect(screen.getByLabelText("Éléments résolus")).toHaveTextContent(itemId);
  });

  it("keeps cached previews non-actionable until their latest context is confirmed", async () => {
    let resolve!: (value: MarketingReviewContext) => void;
    loadReview.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount({ campaign, item });
    expect(screen.getByLabelText("Éléments résolus")).toHaveTextContent(itemId);
    expect(screen.getByText("Revue en actualisation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeDisabled();
    await act(async () => { resolve({ campaign, item: { ...item, status: "scheduled", approvalStatus: "approved" } }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeEnabled());
    expect(screen.getByLabelText("Éléments résolus")).toHaveTextContent("scheduled");
  });

  it("retains an explicit error and disables actions when refreshing a cached context fails", async () => {
    loadReview.mockRejectedValue(new Error("offline"));
    mount({ campaign, item });
    expect(await screen.findByLabelText("Erreur de revue")).toHaveTextContent("n’a pas pu être confirmée");
    expect(screen.getByLabelText("Éléments résolus")).toHaveTextContent(itemId);
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeDisabled();
  });

  it("prefers the current shared snapshot over older detail cache without an extra request", () => {
    environment.snapshot = { ...environment.snapshot!, calendar: [{ ...item, status: "scheduled", approvalStatus: "approved" }] };
    mount({ campaign, item });
    expect(screen.getByLabelText("Éléments résolus")).toHaveTextContent("scheduled");
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeEnabled();
    expect(loadReview).not.toHaveBeenCalled();
  });

  it("rejects a mismatched campaign/item pair even when both records are present", () => {
    const otherId = "82450000-0000-4000-8000-000000000003";
    environment.snapshot = { ...environment.snapshot!, campaigns: [campaign, { ...campaign, id: otherId }], calendar: [{ ...item, campaignId: otherId }] };
    mount();
    expect(screen.getByLabelText("Erreur de revue")).toHaveTextContent("ne correspond pas à cette campagne");
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeDisabled();
    expect(loadReview).not.toHaveBeenCalled();
  });

  it("shows an unavailable target after a confirmed empty result", async () => {
    loadReview.mockResolvedValue({ campaign, item: null });
    mount();
    expect(await screen.findByLabelText("Erreur de revue")).toHaveTextContent("n’a pas pu être confirmée");
    expect(screen.getByRole("button", { name: "Approuver la publication test" })).toBeDisabled();
  });

  it("uses private view-specific metadata that survives route fallback", () => {
    environment.snapshot = { ...environment.snapshot!, calendar: [item] };
    mount();
    ensureSeoMetadataForRoute("/marketing");
    expect(document.title).toBe("Calendrier · Marketing TOK");
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
  });
});
