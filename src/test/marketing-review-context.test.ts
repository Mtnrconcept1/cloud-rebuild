import { afterEach, describe, expect, it, vi } from "vitest";
import { approveMarketingCampaign, approveMarketingItem, compareMarketingRevisions, loadMarketingReviewContext } from "@/marketing/marketingClient";
import { getMarketingCampaignDisplayStatus } from "@/marketing/campaignStatus";
import type { MarketingCampaignStatus } from "@/marketing/types";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingBffClient")>(), marketingBffRequest: request,
}));
const campaignId = "72000000-0000-4000-8000-000000000001";
const itemId = "72000000-0000-4000-8000-000000000002";
const otherId = "72000000-0000-4000-8000-000000000003";
const date = "2026-10-19T14:00:00Z";
afterEach(() => { vi.resetAllMocks(); });

describe("marketing revision ordering", () => {
  it("preserves PostgreSQL microseconds when ordering confirmed publications", () => {
    expect(compareMarketingRevisions("2026-10-19T14:00:00.123456Z", "2026-10-19T14:00:00.123455Z")).toBeGreaterThan(0);
    expect(compareMarketingRevisions("2026-10-19T14:00:00.123454Z", "2026-10-19T14:00:00.123455Z")).toBeLessThan(0);
    expect(compareMarketingRevisions("2026-10-19T14:00:01.000001Z", "2026-10-19T14:00:00.999999Z")).toBeGreaterThan(0);
  });

  it("normalizes equivalent time zones and treats invalid revisions as unknown", () => {
    expect(compareMarketingRevisions("2026-10-19T16:00:00.123+02:00", "2026-10-19T14:00:00.123000Z")).toBe(0);
    expect(compareMarketingRevisions(null, "2026-10-19T14:00:00Z")).toBeNull();
    expect(compareMarketingRevisions("invalid", "2026-10-19T14:00:00Z")).toBeNull();
  });
});

describe("marketing review links", () => {
  it("resolves the exact campaign and publication beyond the initial pages without a month filter", async () => {
    const campaignCursor = { updated_at: date, id: otherId };
    const itemCursor = { scheduled_at: date, id: otherId };
    request.mockResolvedValueOnce({ data: { items: [{ id: otherId }], next_cursor: campaignCursor } })
      .mockResolvedValueOnce({ data: { items: [{ id: campaignId, approved_at: date }], next_cursor: null } })
      .mockResolvedValueOnce({ data: { items: [{ id: otherId, campaign_id: campaignId }], next_cursor: itemCursor } })
      .mockResolvedValueOnce({ data: { items: [{ id: itemId, campaign_id: campaignId, scheduled_at: "2027-02-10T10:00:00Z", status: "scheduled", approval_status: "approved" }], next_cursor: null } });
    await expect(loadMarketingReviewContext({ campaignId, itemId })).resolves.toMatchObject({
      campaign: { id: campaignId, approvedAt: date }, item: { id: itemId, campaignId, status: "scheduled", approvalStatus: "approved" },
    });
    expect(request.mock.calls[1][1].body).toEqual({ operation: "admin_list_marketing_campaigns", args: {
      p_status: null, p_limit: 100, p_cursor_updated_at: date, p_cursor_id: otherId,
    } });
    expect(request.mock.calls[3][1].body).toEqual({ operation: "admin_list_marketing_campaign_items", args: {
      p_campaign_id: campaignId, p_limit: 24, p_cursor_scheduled_at: date, p_cursor_id: otherId,
    } });
  });

  it("does not invent a missing campaign or fall back to another publication", async () => {
    request.mockResolvedValueOnce({ items: [], next_cursor: null });
    await expect(loadMarketingReviewContext({ campaignId, itemId })).resolves.toEqual({ campaign: null, item: null });
    request.mockResolvedValueOnce({ items: [{ id: campaignId }], next_cursor: null })
      .mockResolvedValueOnce({ items: [{ id: otherId, campaign_id: campaignId }], next_cursor: null });
    await expect(loadMarketingReviewContext({ campaignId, itemId })).resolves.toMatchObject({ campaign: { id: campaignId }, item: null });
  });

  it("rejects invalid, incomplete and mismatched review links", async () => {
    await expect(loadMarketingReviewContext({ campaignId: "invalid" })).rejects.toThrow("identifiant invalide");
    await expect(loadMarketingReviewContext({ itemId })).rejects.toThrow("incomplet");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({ items: [{ id: campaignId }], next_cursor: null })
      .mockResolvedValueOnce({ items: [{ id: itemId, campaign_id: otherId }], next_cursor: null });
    await expect(loadMarketingReviewContext({ campaignId, itemId })).rejects.toThrow("ne correspondent pas");
  });

  it("stops a repeated cursor and bounds the work for a missing campaign", async () => {
    request.mockResolvedValue({ items: [{ id: otherId }], next_cursor: { id: otherId, updated_at: date } });
    await expect(loadMarketingReviewContext({ campaignId })).rejects.toThrow("pagination des campagnes est interrompue");
    expect(request).toHaveBeenCalledTimes(2);
    request.mockReset().mockImplementation(async () => ({ items: [], next_cursor: { id: otherId, updated_at: `${request.mock.calls.length}` } }));
    await expect(loadMarketingReviewContext({ campaignId })).rejects.toThrow("atteint sa limite");
    expect(request).toHaveBeenCalledTimes(20);
  });
});

describe("confirmed approval responses", () => {
  it("accepts the real campaign approval without pretending its publications are scheduled", async () => {
    request.mockResolvedValueOnce({ data: { id: campaignId, status: "draft", approval_status: "approved", approved_at: date } });
    await expect(approveMarketingCampaign(campaignId, "Campagne relue")).resolves.toMatchObject({ status: "draft", approved_at: date });
  });

  it("accepts an email only when both approval and scheduling are confirmed", async () => {
    request.mockResolvedValueOnce({ data: { id: itemId, status: "scheduled", approval_status: "approved", scheduled_at: date } });
    await expect(approveMarketingItem(itemId, date)).resolves.toMatchObject({ status: "scheduled", approval_status: "approved" });
  });

  it.each([{}, { id: otherId, approval_status: "approved", approved_at: date },
    { id: campaignId, approval_status: "approved", approved_at: null }, { id: campaignId, approval_status: "approved", approved_at: "invalid" },
    { id: campaignId, approval_status: "pending", approved_at: date }])(
    "rejects an unconfirmed campaign response: %j", async (response) => {
      request.mockResolvedValueOnce({ data: response });
      await expect(approveMarketingCampaign(campaignId, "Campagne relue")).rejects.toThrow("n'a pas pu être confirmée");
    },
  );

  it.each([{}, { id: otherId, status: "scheduled", approval_status: "approved", scheduled_at: date },
    { id: itemId, status: "draft", approval_status: "pending", scheduled_at: date },
    { id: itemId, status: "scheduled", approval_status: "approved", scheduled_at: "invalid" }])(
    "rejects an unconfirmed publication response: %j", async (response) => {
      request.mockResolvedValueOnce({ data: response });
      await expect(approveMarketingItem(itemId, date)).rejects.toThrow("n'ont pas pu être confirmées");
    },
  );
});

describe("campaign display status", () => {
  it("shows an approved draft as approved without changing its stored lifecycle", () => {
    const campaign = { status: "draft" as const, approvedAt: date };
    expect(getMarketingCampaignDisplayStatus(campaign)).toBe("approved");
    expect(campaign.status).toBe("draft");
    expect(getMarketingCampaignDisplayStatus({ status: "draft", approvedAt: null })).toBe("draft");
  });

  it.each<MarketingCampaignStatus>(["scheduled", "active", "paused", "completed", "cancelled", "failed"])(
    "preserves the real delivery state %s after approval", (status) => {
      expect(getMarketingCampaignDisplayStatus({ status, approvedAt: date })).toBe(status);
    },
  );
});
