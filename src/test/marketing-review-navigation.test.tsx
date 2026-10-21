import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import type { MarketingContentReviewTarget } from "@/marketing/contentReviewClient";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem } from "@/marketing/marketingClient";
import { MARKETING_VIEWS, type MarketingCampaign, type MarketingSnapshot } from "@/marketing/types";
import { useMarketingUrlState, type MarketingUrlState } from "@/marketing/useMarketingUrlState";

vi.mock("@/marketing/contentReviewClient", () => ({
  loadMarketingContentReview: vi.fn(async (target: MarketingContentReviewTarget) => ({
    ...target, revision: 0, status: "not_requested", updatedAt: null, review: null,
  })),
  retryMarketingContentReview: vi.fn(),
}));

const campaignId = "82450000-0000-4000-8000-000000000001";
const itemId = "82450000-0000-4000-8000-000000000002";
const campaign: MarketingCampaign = {
  id: campaignId, name: "Campagne Genève", objective: "Faire découvrir TOK", status: "draft",
  audienceId: "", audienceName: "Genève", channels: ["instagram"], startsAt: "2026-11-01T09:00:00Z",
  endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0, requiresApproval: true,
  content: "Découvrez TOK", approvedAt: null, updatedAt: "2026-10-19T12:00:00Z",
};
const item = normalizeCalendarItem({
  id: itemId, campaign_id: campaignId, campaign_name: campaign.name,
  title: "Publication Genève", channel: "instagram", scheduled_at: "2026-11-15T09:00:00Z",
  status: "draft", approval_status: "pending", content: "Découvrez notre offre TOK à Genève.",
});
const filters: MarketingUrlState = {
  view: "calendar", query: "", status: "all", channel: "all", page: 1,
  from: "2026-11-01", to: "2026-11-30", campaignId, itemId,
};

function snapshot(approved = false): MarketingSnapshot {
  const fallback = createFallbackMarketingSnapshot();
  return {
    ...fallback, source: "backend", campaigns: [{ ...campaign, approvedAt: approved ? "2026-10-19T13:00:00Z" : null }],
    calendar: [item], channels: fallback.channels.map((channel) => channel.id === "instagram" ? { ...channel, availability: "available" } : channel),
  };
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function UrlHarness() {
  const { state, setView, update } = useMarketingUrlState();
  return <>
    <output aria-label="Filtres marketing">{JSON.stringify(state)}</output>
    <button onClick={() => setView("calendar", { campaignId, itemId, scheduledAt: "2026-10-31T23:30:00Z" })}>Ouvrir la publication</button>
    <button onClick={() => setView("calendar")}>Fermer la sélection</button>
    <button onClick={() => update({ query: "Genève", page: 1 })}>Rechercher</button>
  </>;
}

function urlRouter(entry: string) {
  const router = createMemoryRouter([{ path: "/marketing", element: <UrlHarness /> }], { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
  return router;
}

function readFilters() { return JSON.parse(screen.getByLabelText("Filtres marketing").textContent || "{}"); }

async function settleContentReview() {
  await screen.findByText("Aucune demande enregistrée");
}

describe("marketing review URLs", () => {
  it.each(MARKETING_VIEWS)("restores the %s view from its URL", (view) => {
    urlRouter(`/marketing?view=${view}`);
    expect(readFilters().view).toBe(view);
  });

  it("opens an exact publication in its Swiss month and preserves browser history", async () => {
    const router = urlRouter("/marketing?view=campaigns&q=restaurant&status=draft&page=4&from=2026-10-01&to=2026-10-31");
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la publication" }));
    expect(readFilters()).toMatchObject({ view: "calendar", campaignId, itemId, from: "2026-11-01", to: "2026-11-30", query: "", status: "all", page: 1 });
    await act(async () => { await router.navigate(-1); });
    expect(readFilters()).toMatchObject({ view: "campaigns", query: "restaurant", status: "draft", page: 4 });
    await act(async () => { await router.navigate(1); });
    expect(readFilters()).toMatchObject({ view: "calendar", campaignId, itemId });
    fireEvent.click(screen.getByRole("button", { name: "Fermer la sélection" }));
    expect(readFilters()).toMatchObject({ view: "calendar", campaignId: "", itemId: "" });
  });

  it("rejects malformed identifiers, impossible dates and unsafe page numbers", () => {
    urlRouter("/marketing?view=calendar&campaignId=../../admin&itemId=javascript:bad&from=2026-02-31&to=2026-99-10&page=9007199254740992");
    expect(readFilters()).toMatchObject({ campaignId: "", itemId: "", from: "", to: "", page: 1 });
  });

  it("normalizes UUIDs and ignores review identifiers outside review views", () => {
    const id = "ABCDEF00-0000-4000-8000-000000000001";
    urlRouter(`/marketing?view=calendar&campaignId=${id}`);
    expect(readFilters().campaignId).toBe(id.toLowerCase());
    cleanup();
    urlRouter(`/marketing?view=activity&campaignId=${campaignId}&itemId=${itemId}`);
    expect(readFilters()).toMatchObject({ campaignId: "", itemId: "" });
  });
});

describe("calendar approval navigation", () => {
  it("does not open an item belonging to a different explicit campaign", () => {
    const otherCampaignId = "82450000-0000-4000-8000-000000000003";
    render(<MarketingCalendarView snapshot={{ ...snapshot(), campaigns: [campaign, { ...campaign, id: otherCampaignId }],
      calendar: [{ ...item, campaignId: otherCampaignId }] }} filters={filters} canMutateBackend pendingAction={null}
      onFiltersChange={vi.fn()} onCancel={vi.fn()} onApprove={vi.fn()} onCompleteManual={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps an existing standalone publication accessible without a campaign identifier", async () => {
    render(<MarketingCalendarView snapshot={{ ...snapshot(), calendar: [{ ...item, campaignId: null }] }}
      filters={{ ...filters, campaignId: "" }} canMutateBackend pendingAction={null}
      onFiltersChange={vi.fn()} onCancel={vi.fn()} onApprove={vi.fn()} onCompleteManual={vi.fn()} />);
    await settleContentReview();
    const dialog = screen.getByRole("dialog", { name: item.title });
    expect(within(dialog).getByText("Publication autonome")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Approuver et planifier" })).toBeEnabled();
  });

  it("opens the selected item directly and provides the exact prerequisite campaign", async () => {
    const onNavigate = vi.fn();
    render(<MarketingCalendarView snapshot={snapshot()} filters={filters} canMutateBackend pendingAction={null}
      onFiltersChange={vi.fn()} onNavigate={onNavigate} onCancel={vi.fn()} onApprove={vi.fn()} onCompleteManual={vi.fn()} />);
    await settleContentReview();
    const dialog = screen.getByRole("dialog", { name: item.title });
    expect(within(dialog).getByRole("button", { name: "Approuver et planifier" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Relire et approuver la campagne" }));
    expect(onNavigate).toHaveBeenCalledWith("campaigns", { campaignId, itemId, scheduledAt: item.scheduledAt });
  });

  it("keeps the selected publication open and shows its confirmed status after approval", async () => {
    const onApprove = vi.fn().mockResolvedValue(true);
    function ApprovalHarness() {
      const [current, setCurrent] = useState(snapshot(true));
      return <MarketingCalendarView snapshot={current} filters={filters} canMutateBackend pendingAction={null}
        onFiltersChange={vi.fn()} onCancel={vi.fn()} onCompleteManual={vi.fn()}
        onApprove={async (id, scheduledAt) => {
          const result = await onApprove(id, scheduledAt);
          setCurrent((value) => ({ ...value, calendar: [{ ...item, scheduledAt, status: "scheduled", approvalStatus: "approved" }] }));
          return result;
        }} />;
    }
    render(<ApprovalHarness />);
    await settleContentReview();
    fireEvent.click(screen.getByRole("button", { name: "Approuver et planifier" }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(itemId, "2026-11-15T09:00:00.000Z"));
    const dialog = screen.getByRole("dialog", { name: item.title });
    await waitFor(() => expect(within(dialog).getByText("Planifié")).toBeInTheDocument());
    expect(within(dialog).queryByRole("button", { name: "Approuver et planifier" })).not.toBeInTheDocument();
  });

  it("keeps retryable approval failures in the same dialog without navigation", async () => {
    const onApprove = vi.fn().mockResolvedValue(false);
    const onNavigate = vi.fn();
    render(<MarketingCalendarView snapshot={snapshot(true)} filters={filters} canMutateBackend pendingAction={null}
      onFiltersChange={vi.fn()} onNavigate={onNavigate} onCancel={vi.fn()} onApprove={onApprove} onCompleteManual={vi.fn()} />);
    await settleContentReview();
    fireEvent.click(screen.getByRole("button", { name: "Approuver et planifier" }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: item.title })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("exposes month controls outside the desktop-only calendar grid", () => {
    const onFiltersChange = vi.fn();
    render(<MarketingCalendarView snapshot={snapshot()} filters={{ ...filters, itemId: "" }} canMutateBackend pendingAction={null}
      onFiltersChange={onFiltersChange} onCancel={vi.fn()} onApprove={vi.fn()} onCompleteManual={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Mois suivant" });
    expect(next.closest(".hidden")).toBeNull();
    fireEvent.click(next);
    expect(onFiltersChange).toHaveBeenCalledWith({ from: "2026-12-01", to: "2026-12-31", page: 1, itemId: "" });
  });

  it("restores the current month when browser history removes a month filter", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const props = { snapshot: snapshot(), filters: { ...filters, itemId: "" }, canMutateBackend: true, pendingAction: null,
      onFiltersChange: vi.fn(), onCancel: vi.fn(), onApprove: vi.fn(), onCompleteManual: vi.fn() };
    const { rerender } = render(<MarketingCalendarView {...props} />);
    expect(screen.getByText("novembre 2026")).toBeInTheDocument();
    rerender(<MarketingCalendarView {...props} filters={{ ...props.filters, from: "", to: "" }} />);
    expect(screen.getByText("octobre 2026")).toBeInTheDocument();
  });

  it("aligns a pasted deep link to the actual month after the exact item arrives", async () => {
    const onFiltersChange = vi.fn();
    const props = { snapshot: { ...snapshot(), calendar: [] }, filters: { ...filters, from: "", to: "" }, canMutateBackend: true,
      pendingAction: null, onFiltersChange, onCancel: vi.fn(), onApprove: vi.fn(), onCompleteManual: vi.fn() };
    const { rerender } = render(<MarketingCalendarView {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<MarketingCalendarView {...props} snapshot={snapshot()} />);
    await settleContentReview();
    expect(screen.getByRole("dialog", { name: item.title })).toBeInTheDocument();
    expect(onFiltersChange).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-30", page: 1 });
  });
});

describe("campaign review navigation", () => {
  const galleryProps = {
    filters: { ...filters, view: "campaigns" as const }, canMutateBackend: true, savePending: false, pendingAction: null,
    onFiltersChange: vi.fn(), onSave: vi.fn(), onApprove: vi.fn(), onRecommendChannels: vi.fn(),
  };

  it("opens the exact campaign from its URL and returns to the original calendar item", async () => {
    const onNavigate = vi.fn();
    const onLoadCampaignItems = vi.fn().mockResolvedValue({ items: [item], nextCursor: null });
    render(<MarketingCampaignsView {...galleryProps} snapshot={snapshot()} onNavigate={onNavigate} onLoadCampaignItems={onLoadCampaignItems} />);
    const dialog = screen.getByRole("dialog", { name: campaign.name });
    await waitFor(() => expect(onLoadCampaignItems).toHaveBeenCalledWith(campaignId, null));
    await settleContentReview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retrouver la publication sélectionnée" }));
    expect(onNavigate).toHaveBeenCalledWith("calendar", { campaignId, itemId, scheduledAt: item.scheduledAt });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Ouvrir cette publication dans le calendrier" }));
    expect(onNavigate).toHaveBeenLastCalledWith("calendar", { campaignId, itemId, scheduledAt: item.scheduledAt });
  });

  it("reads fresh campaign state in an open dialog and removes approved campaigns from Drafts", async () => {
    const load = vi.fn().mockResolvedValue({ items: [item], nextCursor: null });
    const { rerender } = render(<MarketingCampaignsView {...galleryProps} snapshot={snapshot()} onLoadCampaignItems={load} />);
    await waitFor(() => expect(screen.getByLabelText("Motif de l'approbation")).toBeInTheDocument());
    await settleContentReview();
    rerender(<MarketingCampaignsView {...galleryProps} snapshot={snapshot(true)} onLoadCampaignItems={load} />);
    const dialog = screen.getByRole("dialog", { name: campaign.name });
    expect(within(dialog).getByText("Approuvé")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Approuver et journaliser" })).not.toBeInTheDocument();
    rerender(<MarketingCampaignsView {...galleryProps} filters={{ ...galleryProps.filters, status: "draft", campaignId: "", itemId: "" }} snapshot={snapshot(true)} onLoadCampaignItems={load} />);
    expect(screen.queryByRole("button", { name: "Voir les visuels et publications" })).not.toBeInTheDocument();
  });

  it("reconciles a refreshed item approval in an already open gallery at microsecond precision", async () => {
    const oldItem = { ...item, updatedAt: "2026-10-19T12:00:00.123450Z" };
    const oldSnapshot = { ...snapshot(true), calendar: [oldItem] };
    const load = vi.fn().mockResolvedValue({ items: [oldItem], nextCursor: null });
    const { rerender } = render(<MarketingCampaignsView {...galleryProps} snapshot={oldSnapshot} onLoadCampaignItems={load} />);
    const gallery = screen.getByRole("region", { name: "Publications de la campagne" });
    await waitFor(() => expect(within(gallery).getByText("À approuver")).toBeInTheDocument());
    await settleContentReview();
    rerender(<MarketingCampaignsView {...galleryProps} snapshot={{ ...oldSnapshot, calendar: [{ ...oldItem,
      status: "scheduled", approvalStatus: "approved", updatedAt: "2026-10-19T12:00:00.123451Z" }] }} onLoadCampaignItems={load} />);
    expect(within(gallery).getByText("Approuvé")).toBeInTheDocument();
    expect(within(gallery).queryByText("À approuver")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    await settleContentReview();
  });

  it("preserves a newer confirmed visual while the shared snapshot still has the older revision", async () => {
    const oldItem = { ...item, updatedAt: "2026-10-19T12:00:00.123450Z", postPreview: { caption: "Avant", visualUrl: "https://assets.example.test/old.png" } };
    const savedItem = { ...oldItem, updatedAt: "2026-10-19T12:00:00.123451Z", postPreview: { caption: "Après", visualUrl: "https://assets.example.test/new.png" } };
    render(<MarketingCampaignsView {...galleryProps} snapshot={{ ...snapshot(), calendar: [oldItem] }}
      onLoadCampaignItems={vi.fn().mockResolvedValue({ items: [savedItem], nextCursor: null })} />);
    const gallery = screen.getByRole("region", { name: "Publications de la campagne" });
    await waitFor(() => expect(within(gallery).getByRole("img")).toHaveAttribute("src", "https://assets.example.test/new.png"));
    expect(within(gallery).getByText("Après")).toBeInTheDocument();
    await settleContentReview();
  });
});
