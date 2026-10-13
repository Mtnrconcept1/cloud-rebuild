import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { loadMarketingCampaignItems, normalizeCalendarItem } from "@/marketing/marketingClient";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

const { bffRequest } = vi.hoisted(() => ({ bffRequest: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingBffClient")>(), marketingBffRequest: bffRequest,
}));
const filters: MarketingUrlState = { view: "campaigns", query: "", status: "all", channel: "all", page: 1, from: "2026-10-01", to: "2026-10-31" };
const campaign = { id: "campaign-1", name: "TOK Genève", objective: "Restaurateurs", status: "draft" as const, audienceId: "", audienceName: "Genève",
  channels: ["instagram" as const], startsAt: "2026-11-01T00:00:00Z", endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0,
  requiresApproval: true, content: "Message", approvedAt: null, updatedAt: "2026-10-11T08:00:00Z" };
const item = normalizeCalendarItem({ id: "post-1", campaign_id: campaign.id, title: "Zéro attente", channel: "instagram", scheduled_at: "2026-11-15T08:00:00Z",
  content: { headline: "Réservez", body: "Votre table vous attend.", visual_url: "https://example.com/visuel.png" } });
const snapshot = { ...createFallbackMarketingSnapshot(), campaigns: [campaign], calendar: [] };
function mount(loadItems: typeof loadMarketingCampaignItems) {
  const onApprove = vi.fn();
  const onFiltersChange = vi.fn();
  render(<MarketingCampaignsView snapshot={snapshot} filters={filters} canMutateBackend savePending={false} pendingAction={null}
    onFiltersChange={onFiltersChange} onSave={vi.fn()} onApprove={onApprove} onRecommendChannels={vi.fn()} onLoadCampaignItems={loadItems} />);
  return { onApprove, onFiltersChange };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("campaign visual gallery", () => {
  it("loads exact campaign posts outside the visible month, paginates and refreshes saved visuals", async () => {
    const cursor = { scheduled_at: item.scheduledAt, id: item.id };
    const loadItems = vi.fn().mockResolvedValueOnce({ items: [item], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [{ ...item, id: "post-2", title: "Deuxième post" }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ ...item, postPreview: { caption: "Texte actualisé", visualUrl: "https://example.com/new.png" } }], nextCursor: null });
    const { onApprove, onFiltersChange } = mount(loadItems);
    fireEvent.click(screen.getByRole("button", { name: "Voir les visuels et publications" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://example.com/visuel.png"));
    expect(loadItems).toHaveBeenCalledWith(campaign.id, null);
    expect(within(dialog).getByText(/Votre table vous attend/)).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onFiltersChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Charger les publications suivantes" }));
    await waitFor(() => expect(within(dialog).getAllByRole("img")).toHaveLength(2));
    expect(loadItems).toHaveBeenLastCalledWith(campaign.id, cursor);
    fireEvent.click(within(dialog).getByRole("button", { name: "Actualiser les visuels" }));
    await waitFor(() => expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://example.com/new.png"));
    expect(within(dialog).getByText("Texte actualisé")).toBeInTheDocument();
    expect(within(dialog).queryByText("Deuxième post")).toBeNull();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("distinguishes loading, failure and an empty saved campaign and allows retry", async () => {
    let rejectRequest!: (error: Error) => void;
    const loadItems = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    mount(loadItems);
    fireEvent.click(screen.getByRole("button", { name: "Approuver la campagne" }));
    expect(screen.getByText("Chargement des publications…")).toBeInTheDocument();
    rejectRequest(new Error("offline"));
    await waitFor(() => expect(screen.getByText("Publications indisponibles")).toBeInTheDocument());
    expect(screen.queryByText("Aucune publication enregistrée")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser les visuels" }));
    await waitFor(() => expect(screen.getByText("Aucune publication enregistrée")).toBeInTheDocument());
  });

  it("opens templates directly from the campaigns screen", () => {
    const { onFiltersChange } = mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Créer avec un modèle" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ view: "agent", query: "", status: "all", channel: "all", page: 1 });
  });

  it("requests bounded campaign pagination without month filters and rejects a mismatched campaign", async () => {
    bffRequest.mockResolvedValueOnce({ data: { items: [{ id: "post-1", campaign_id: campaign.id, content: "Texte" }], next_cursor: null } });
    await expect(loadMarketingCampaignItems(campaign.id)).resolves.toMatchObject({ items: [{ campaignId: campaign.id }], nextCursor: null });
    expect(bffRequest).toHaveBeenLastCalledWith(expect.any(String), { method: "POST", body: { operation: "admin_list_marketing_campaign_items",
      args: { p_campaign_id: campaign.id, p_limit: 24, p_cursor_scheduled_at: null, p_cursor_id: null } } });
    bffRequest.mockResolvedValueOnce({ items: [{ campaign_id: "another-campaign" }] });
    await expect(loadMarketingCampaignItems(campaign.id)).rejects.toThrow("ne correspondent pas");
    bffRequest.mockResolvedValueOnce({ error: "unavailable" });
    await expect(loadMarketingCampaignItems(campaign.id)).rejects.toThrow("n'a pas pu être confirmée");
  });
});
