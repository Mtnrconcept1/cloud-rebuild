import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { loadMarketingCampaignItems, normalizeCalendarItem } from "@/marketing/marketingClient";
import * as client from "@/marketing/marketingClient";
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
function mount(loadItems: typeof loadMarketingCampaignItems, overrides: Partial<Parameters<typeof MarketingCampaignsView>[0]> = {}) {
  const onApprove = vi.fn();
  const onFiltersChange = vi.fn();
  const onItemsUpdated = vi.fn().mockResolvedValue(undefined);
  const onUploadPendingChange = vi.fn();
  render(<MarketingCampaignsView snapshot={snapshot} filters={filters} canMutateBackend savePending={false} pendingAction={null}
    onFiltersChange={onFiltersChange} onSave={vi.fn()} onApprove={onApprove} onRecommendChannels={vi.fn()} onLoadCampaignItems={loadItems} onItemsUpdated={onItemsUpdated} onUploadPendingChange={onUploadPendingChange} {...overrides} />);
  return { onApprove, onFiltersChange, onItemsUpdated, onUploadPendingChange };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

function mailingItem(number: number, ready = false) {
  return normalizeCalendarItem({ id: `71830000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    campaign_id: campaign.id, title: `E-mail ${number}`, channel: "email", scheduled_at: "2027-01-10T08:00:00Z",
    updated_at: "2026-10-19T08:00:00Z", status: "draft", approval_status: "pending",
    content: { mailing_version: "tok-mailing-v1", subject: `Objet ${number}`, headline: `Titre ${number}`, body: `Texte ${number}`,
      call_to_action: "Découvrir", image_mode: "manual", visual_status: ready ? "ready" : "pending_upload",
      visual_url: ready ? `https://assets.example.test/email-${number}.png` : null },
  });
}

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
    fireEvent.click(screen.getByRole("button", { name: "Créer un mailing ou une campagne IA" }));
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

  it("keeps campaign approval blocked until every mailing has its own image", async () => {
    const first = mailingItem(1); const second = mailingItem(2);
    const upload = vi.spyOn(client, "uploadMarketingMailingImage").mockResolvedValueOnce(mailingItem(1, true)).mockResolvedValueOnce(mailingItem(2, true));
    const { onApprove, onItemsUpdated } = mount(vi.fn().mockResolvedValue({ items: [first, second], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Approuver la campagne" }));
    await screen.findByLabelText("Importer une image pour E-mail 1");
    fireEvent.change(screen.getByLabelText("Motif de l'approbation"), { target: { value: "Textes et images relus" } });
    const approve = screen.getByRole("button", { name: "Approuver et journaliser" });
    expect(approve).toBeDisabled();
    const image = new File(["fixture"], "banner.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Importer une image pour E-mail 1"), { target: { files: [image] } });
    await waitFor(() => expect(screen.getByTitle("Template e-mail — E-mail 1")).toHaveAttribute("srcdoc", expect.stringContaining("https://assets.example.test/email-1.png")));
    expect(screen.getByTitle("Template e-mail — E-mail 2").getAttribute("srcdoc")).not.toContain("email-1.png");
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Importer une image pour E-mail 2"), { target: { files: [image] } });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(upload.mock.calls.map((call) => call[0])).toEqual([first.id, second.id]);
    expect(onItemsUpdated).toHaveBeenCalledTimes(2);
    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledWith(campaign.id, "Textes et images relus");
  });

  it("blocks approval, refresh and dismissal during an image replacement", async () => {
    let resolve!: (item: ReturnType<typeof mailingItem>) => void;
    vi.spyOn(client, "uploadMarketingMailingImage").mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onUploadPendingChange } = mount(vi.fn().mockResolvedValue({ items: [mailingItem(1, true), mailingItem(2, true)], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Approuver la campagne" }));
    await screen.findByLabelText("Importer une image pour E-mail 1");
    fireEvent.change(screen.getByLabelText("Motif de l'approbation"), { target: { value: "Campagne relue" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Importer une image pour E-mail 1"), { target: { files: [new File(["fixture"], "banner.png", { type: "image/png" })] } });
    expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualiser les visuels" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
    expect(screen.getByLabelText("Importer une image pour E-mail 2")).toBeDisabled();
    expect(onUploadPendingChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    resolve(mailingItem(1, true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeEnabled());
    expect(onUploadPendingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("requires all pages to load before approving but preserves empty legacy campaign approval", async () => {
    const load = vi.fn().mockResolvedValueOnce({ items: [item], nextCursor: { id: item.id } }).mockResolvedValueOnce({ items: [], nextCursor: null });
    mount(load);
    fireEvent.click(screen.getByRole("button", { name: "Approuver la campagne" }));
    await screen.findByRole("button", { name: "Charger les publications suivantes" });
    fireEvent.change(screen.getByLabelText("Motif de l'approbation"), { target: { value: "Campagne relue" } });
    expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Charger les publications suivantes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeEnabled());
    cleanup();
    const { onApprove } = mount(vi.fn().mockResolvedValue({ items: [], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Approuver la campagne" }));
    await screen.findByText("Aucune publication enregistrée");
    fireEvent.change(screen.getByLabelText("Motif de l'approbation"), { target: { value: "Campagne manuelle relue" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Approuver et journaliser" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Approuver et journaliser" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it.each([
    { approvedAt: "2026-10-19T08:00:00Z" }, { status: "completed" as const }, { status: "cancelled" as const }, { status: "failed" as const },
  ])("disables gallery uploads for an approved or terminal campaign: %j", async (override) => {
    mount(vi.fn().mockResolvedValue({ items: [mailingItem(1)], nextCursor: null }), {
      snapshot: { ...snapshot, campaigns: [{ ...campaign, ...override }] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Voir les visuels et publications" }));
    expect(await screen.findByLabelText("Importer une image pour E-mail 1")).toBeDisabled();
  });
});
