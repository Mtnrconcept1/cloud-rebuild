import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketingContentReview } from "@/components/marketing/MarketingContentReview";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import { loadMarketingContentReview, retryMarketingContentReview, type MarketingContentReviewState } from "@/marketing/contentReviewClient";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem } from "@/marketing/marketingClient";
import type { MarketingCampaign, MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

vi.mock("@/marketing/contentReviewClient", () => ({ loadMarketingContentReview: vi.fn(), retryMarketingContentReview: vi.fn() }));

const campaignId = "b286ddc7-7335-4fd2-a633-000000000001";
const itemId = "b286ddc7-7335-4fd2-a633-000000000002";
const reviewId = "b286ddc7-7335-4fd2-a633-000000000003";
const target = { targetType: "campaign" as const, targetId: campaignId };

function state(status: MarketingContentReviewState["status"] = "pending", overrides: Partial<MarketingContentReviewState> = {}): MarketingContentReviewState {
  return { ...target, revision: 3, status, updatedAt: "2026-10-21T10:00:00Z",
    review: { id: reviewId, status, createdAt: "2026-10-21T09:00:00Z", expiresAt: "2026-10-22T09:00:00Z",
      decidedAt: ["approved", "rejected"].includes(status) ? "2026-10-21T10:00:00Z" : null, deliveryComplete: true, messageCount: 5 }, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(loadMarketingContentReview).mockReset();
  vi.mocked(retryMarketingContentReview).mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Telegram content review", () => {
  it("reads once, refreshes manually and keeps content approval separate from scheduling", async () => {
    vi.mocked(loadMarketingContentReview).mockResolvedValueOnce(state()).mockResolvedValueOnce(state("approved"));
    render(<MarketingContentReview {...target} canRetry />);
    expect(await screen.findByText("À valider dans Telegram")).toBeInTheDocument();
    expect(loadMarketingContentReview).toHaveBeenCalledWith(target, expect.any(AbortSignal));
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /publier|planifier|approuver/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser le statut Telegram" }));
    expect(await screen.findByText("Contenu approuvé")).toBeInTheDocument();
    expect(screen.getByText(/La diffusion suit la programmation confirmée dans TOK/)).toBeInTheDocument();
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(loadMarketingContentReview).toHaveBeenCalledTimes(2);
  });

  it.each(["failed", "expired", "rejected", "delivery_unknown", "stale"] as const)("retries %s only after a click using the displayed version", async (status) => {
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state(status));
    vi.mocked(retryMarketingContentReview).mockResolvedValue(state("queued"));
    render(<MarketingContentReview {...target} canRetry />);
    const button = await screen.findByRole("button", { name: "Relancer la validation Telegram" });
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText("Nouvelle demande mise en file d’attente pour Telegram.");
    expect(retryMarketingContentReview).toHaveBeenCalledTimes(1);
    expect(retryMarketingContentReview).toHaveBeenCalledWith({ ...target, expectedRevision: 3, expectedReviewId: reviewId }, expect.any(AbortSignal));
    expect(screen.getByText("En file d’attente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relancer la validation Telegram" })).not.toBeInTheDocument();
  });

  it.each(["queued", "waiting_items", "waiting_visuals", "delivering", "pending", "approved", "cancelled", "not_requested"] as const)("does not offer a retry for %s", async (status) => {
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state(status, status === "not_requested" ? { revision: 0, review: null } : {}));
    render(<MarketingContentReview {...target} canRetry />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Validation Telegram" })).toHaveAttribute("aria-busy", "false"));
    expect(screen.queryByRole("button", { name: "Relancer la validation Telegram" })).not.toBeInTheDocument();
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });

  it("requires a fresh status after an unconfirmed retry and never exposes an internal error", async () => {
    vi.mocked(loadMarketingContentReview).mockResolvedValueOnce(state("failed")).mockResolvedValueOnce(state("pending"));
    vi.mocked(retryMarketingContentReview).mockRejectedValue(new Error("private-token internal timeout"));
    render(<MarketingContentReview {...target} canRetry />);
    fireEvent.click(await screen.findByRole("button", { name: "Relancer la validation Telegram" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Actualisez le statut avant une nouvelle tentative");
    expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relancer la validation Telegram" })).not.toBeInTheDocument();
    expect(loadMarketingContentReview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Actualiser le statut Telegram" }));
    await screen.findByText("À valider dans Telegram");
    expect(retryMarketingContentReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a known delivery limit without automatically retrying", async () => {
    const failure = state("failed");
    vi.mocked(loadMarketingContentReview).mockResolvedValue({ ...failure,
      review: { ...failure.review!, errorCode: "content_review_document_too_large" } });
    render(<MarketingContentReview {...target} canRetry />);
    expect(await screen.findByText(/Le dossier dépasse la limite d’envoi Telegram/)).toBeInTheDocument();
    expect(screen.getByText(/Réduisez sa taille/)).toBeInTheDocument();
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });

  it("isolates campaign and item requests even when they share an ID and an old response arrives last", async () => {
    const first = deferred<MarketingContentReviewState>();
    const second = deferred<MarketingContentReviewState>();
    vi.mocked(loadMarketingContentReview).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<MarketingContentReview {...target} canRetry />);
    const signal = vi.mocked(loadMarketingContentReview).mock.calls[0][1];
    rerender(<MarketingContentReview targetType="item" targetId={campaignId} canRetry />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { second.resolve(state("pending", { targetType: "item" })); });
    expect(screen.getByText("À valider dans Telegram")).toBeInTheDocument();
    await act(async () => { first.resolve(state("approved")); });
    expect(screen.queryByText("Contenu approuvé")).not.toBeInTheDocument();
    expect(screen.getByText("À valider dans Telegram")).toBeInTheDocument();
    expect(loadMarketingContentReview).toHaveBeenLastCalledWith({ targetType: "item", targetId: campaignId }, expect.any(AbortSignal));
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });

  it("does not retain approval when the displayed content revision changes", async () => {
    const next = deferred<MarketingContentReviewState>();
    vi.mocked(loadMarketingContentReview).mockResolvedValueOnce(state("approved")).mockReturnValueOnce(next.promise);
    const { rerender } = render(<MarketingContentReview {...target} revisionKey="revision-one" canRetry />);
    await screen.findByText("Contenu approuvé");
    rerender(<MarketingContentReview {...target} revisionKey="revision-two" canRetry />);
    expect(screen.queryByText("Contenu approuvé")).not.toBeInTheDocument();
    await act(async () => { next.resolve(state("stale", { revision: 4 })); });
    expect(screen.getByText("Contenu modifié")).toBeInTheDocument();
    vi.mocked(retryMarketingContentReview).mockResolvedValue(state("queued", { revision: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "Relancer la validation Telegram" }));
    await screen.findByText("En file d’attente");
    expect(retryMarketingContentReview).toHaveBeenLastCalledWith({ ...target, expectedRevision: 4, expectedReviewId: reviewId }, expect.any(AbortSignal));
  });

  it("aborts on unmount and prevents an old retry result from replacing another target", async () => {
    const pendingRetry = deferred<MarketingContentReviewState>();
    vi.mocked(loadMarketingContentReview).mockResolvedValueOnce(state("failed")).mockResolvedValueOnce(state("rejected", { targetType: "item", targetId: itemId }));
    vi.mocked(retryMarketingContentReview).mockReturnValue(pendingRetry.promise);
    const { rerender, unmount } = render(<MarketingContentReview {...target} canRetry />);
    fireEvent.click(await screen.findByRole("button", { name: "Relancer la validation Telegram" }));
    const retrySignal = vi.mocked(retryMarketingContentReview).mock.calls[0][1];
    rerender(<MarketingContentReview targetType="item" targetId={itemId} canRetry />);
    expect(retrySignal?.aborted).toBe(true);
    await screen.findByText("Contenu refusé");
    await act(async () => { pendingRetry.resolve(state("queued")); });
    expect(screen.queryByText("En file d’attente")).not.toBeInTheDocument();
    expect(screen.getByText("Contenu refusé")).toBeInTheDocument();
    const read = deferred<MarketingContentReviewState>();
    vi.mocked(loadMarketingContentReview).mockReturnValue(read.promise);
    fireEvent.click(screen.getByRole("button", { name: "Actualiser le statut Telegram" }));
    const signal = vi.mocked(loadMarketingContentReview).mock.lastCall?.[1];
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { read.resolve(state()); });
  });

  it("does not read unconfirmed data or retry without mutation permission", async () => {
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state("failed"));
    const { rerender } = render(<MarketingContentReview {...target} enabled={false} />);
    expect(loadMarketingContentReview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Actualiser le statut Telegram" })).toBeDisabled();
    rerender(<MarketingContentReview {...target} />);
    const retry = await screen.findByRole("button", { name: "Relancer la validation Telegram" });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });

  it("rejects a response for another target even if the client contract is bypassed", async () => {
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state("approved", { targetId: itemId }));
    render(<MarketingContentReview {...target} canRetry />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Contenu approuvé")).not.toBeInTheDocument();
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });
});

describe("content review in the existing campaign and calendar dialogs", () => {
  const campaign: MarketingCampaign = {
    id: campaignId, name: "Campagne Lausanne", objective: "Présenter TOK aux restaurateurs", status: "draft", audienceId: "", audienceName: "Lausanne",
    channels: ["instagram"], startsAt: "2026-11-01T09:00:00Z", endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0,
    requiresApproval: true, content: "Découvrez TOK", approvedAt: null, updatedAt: "2026-10-21T10:00:00Z",
  };
  const item = normalizeCalendarItem({ id: itemId, campaign_id: campaignId, campaign_name: campaign.name,
    title: "Publication Lausanne", channel: "instagram", scheduled_at: "2026-11-15T09:00:00Z", status: "draft", approval_status: "pending",
    updated_at: "2026-10-21T10:00:00Z", content: "Découvrez TOK à Lausanne." });
  const snapshot: MarketingSnapshot = { ...createFallbackMarketingSnapshot(), source: "backend", campaigns: [campaign], calendar: [item] };
  const filters: MarketingUrlState = { view: "campaigns", query: "", status: "all", channel: "all", page: 1,
    from: "2026-11-01", to: "2026-11-30", campaignId, itemId };

  it("reads the campaign review in its gallery dialog without approving or scheduling it", async () => {
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state("pending"));
    const onApprove = vi.fn();
    render(<MarketingCampaignsView snapshot={snapshot} filters={filters} canMutateBackend savePending={false} pendingAction={null}
      onFiltersChange={vi.fn()} onSave={vi.fn()} onApprove={onApprove} onRecommendChannels={vi.fn()}
      onLoadCampaignItems={vi.fn().mockResolvedValue({ items: [item], nextCursor: null })} />);
    const dialog = screen.getByRole("dialog", { name: campaign.name });
    expect(await within(dialog).findByText("À valider dans Telegram")).toBeInTheDocument();
    expect(loadMarketingContentReview).toHaveBeenCalledWith(target, expect.any(AbortSignal));
    expect(onApprove).not.toHaveBeenCalled();
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });

  it.each([true, false])("reads and retries the canonical calendar target (grouped=%s) without changing its schedule", async (grouped) => {
    const canonicalTarget = grouped ? target : { targetType: "item" as const, targetId: itemId };
    const selected = grouped ? item : { ...item, campaignId: null, campaignName: "Publication autonome" };
    vi.mocked(loadMarketingContentReview).mockResolvedValue(state("failed", canonicalTarget));
    vi.mocked(retryMarketingContentReview).mockResolvedValue(state("queued", canonicalTarget));
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(<MarketingCalendarView snapshot={{ ...snapshot, calendar: [selected] }} filters={{ ...filters, view: "calendar", campaignId: grouped ? campaignId : "" }} canMutateBackend pendingAction={null}
      onFiltersChange={vi.fn()} onApprove={onApprove} onCancel={onCancel} onCompleteManual={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: item.title });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Relancer la validation Telegram" }));
    await within(dialog).findByText("En file d’attente");
    expect(loadMarketingContentReview).toHaveBeenCalledWith(canonicalTarget, expect.any(AbortSignal));
    expect(retryMarketingContentReview).toHaveBeenCalledWith({ ...canonicalTarget, expectedRevision: 3, expectedReviewId: reviewId }, expect.any(AbortSignal));
    if (grouped) {
      expect(within(dialog).getByText(/incluse dans le dossier Telegram de sa campagne/)).toBeInTheDocument();
      expect(loadMarketingContentReview).not.toHaveBeenCalledWith({ targetType: "item", targetId: itemId }, expect.anything());
    }
    expect(onApprove).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("refreshes campaign validation when a gallery item changes without a campaign timestamp change", async () => {
    const next = deferred<MarketingContentReviewState>();
    vi.mocked(loadMarketingContentReview).mockResolvedValueOnce(state("approved")).mockReturnValueOnce(next.promise);
    const props = { snapshot, filters, canMutateBackend: true, savePending: false, pendingAction: null,
      onFiltersChange: vi.fn(), onSave: vi.fn(), onApprove: vi.fn(), onRecommendChannels: vi.fn(),
      onLoadCampaignItems: vi.fn().mockResolvedValue({ items: [item], nextCursor: null }) };
    const { rerender } = render(<MarketingCampaignsView {...props} />);
    await screen.findByText("Contenu approuvé");
    rerender(<MarketingCampaignsView {...props} snapshot={{ ...snapshot, calendar: [{ ...item,
      updatedAt: "2026-10-21T10:00:00.000001Z", content: "Texte modifié après validation" }] }} />);
    expect(screen.queryByText("Contenu approuvé")).not.toBeInTheDocument();
    await act(async () => { next.resolve(state("stale", { revision: 4 })); });
    expect(screen.getByText("Contenu modifié")).toBeInTheDocument();
    expect(loadMarketingContentReview).toHaveBeenCalledTimes(2);
    expect(retryMarketingContentReview).not.toHaveBeenCalled();
  });
});
