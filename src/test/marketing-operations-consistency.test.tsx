import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import * as marketingClient from "@/marketing/marketingClient";
import type { MarketingSnapshot } from "@/marketing/types";
import { useMarketingOperations } from "@/marketing/useMarketingOperations";

vi.mock("@/marketing/marketingClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingClient")>(),
  loadMarketingSnapshot: vi.fn(),
  approveMarketingCampaign: vi.fn(),
  approveMarketingItem: vi.fn(),
  cancelMarketingItem: vi.fn(),
}));

const campaignId = "71000000-0000-4000-8000-000000000001";
const itemId = "71000000-0000-4000-8000-000000000002";
const scheduledAt = "2026-11-10T10:00:00.000Z";
const approvedAt = "2026-10-19T13:00:00.000Z";
const defaultKey = ["admin-marketing-operations-snapshot", "default", "default"];
const month = { from: "2026-11-01", to: "2026-11-30" };
const monthKey = ["admin-marketing-operations-snapshot", month.from, month.to];
const clients: QueryClient[] = [];
let server: MarketingSnapshot;

function mount(range?: { from: string; to: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  client.setQueryData(defaultKey, structuredClone(server));
  client.setQueryData(monthKey, structuredClone(server));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper, ...renderHook(({ range }) => useMarketingOperations(range), { wrapper, initialProps: { range } }) };
}

beforeEach(() => {
  server = {
    ...createFallbackMarketingSnapshot(),
    source: "backend",
    campaigns: [{ id: campaignId, name: "Mailing Genève", objective: "Présenter TOK", status: "draft", audienceId: "", audienceName: "Genève",
      channels: ["email"], startsAt: scheduledAt, endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0,
      requiresApproval: true, content: "Texte validé", approvedAt: null, updatedAt: "2026-10-18T10:00:00Z" }],
    calendar: [{ id: itemId, campaignId, campaignName: "Mailing Genève", title: "E-mail 1", channel: "email", status: "draft", scheduledAt,
      timezone: "Europe/Zurich", audienceName: "Genève", audienceSize: 10, approvalStatus: "pending", content: "Texte validé", visualUrl: null,
      format: null, manualOutcome: null, manualNote: null, publishedAt: null, updatedAt: "2026-10-18T10:00:00Z" }],
  };
  vi.mocked(marketingClient.loadMarketingSnapshot).mockImplementation(async () => structuredClone(server));
  vi.mocked(marketingClient.approveMarketingCampaign).mockImplementation(async () => {
    server.campaigns[0] = { ...server.campaigns[0], approvedAt, updatedAt: approvedAt };
    return { id: campaignId, status: "draft", approved_at: approvedAt, updated_at: approvedAt };
  });
  vi.mocked(marketingClient.approveMarketingItem).mockImplementation(async () => {
    server.calendar[0] = { ...server.calendar[0], status: "scheduled", approvalStatus: "approved", updatedAt: approvedAt };
    return { id: itemId, status: "scheduled", approval_status: "approved", scheduled_at: scheduledAt, updated_at: approvedAt };
  });
});

afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.clearAllMocks(); });

describe("marketing approval consistency across views", () => {
  it("keeps the confirmed campaign approval when switching to a previously cached calendar and back", async () => {
    const { result, rerender, client } = mount();
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    await act(async () => { expect(await result.current.approveCampaign(campaignId, "Textes et visuels relus")).toBe(true); });
    expect(client.getQueryData<MarketingSnapshot>(monthKey)?.campaigns[0].approvedAt).toBe(approvedAt);
    rerender({ range: month });
    await waitFor(() => expect(result.current.snapshot.campaigns[0].approvedAt).toBe(approvedAt));
    rerender({ range: undefined });
    await waitFor(() => expect(result.current.snapshot.campaigns[0].approvedAt).toBe(approvedAt));
    expect(result.current.snapshot.calendar[0].approvalStatus).toBe("pending");
    expect(marketingClient.approveMarketingItem).not.toHaveBeenCalled();
  });

  it("updates every cached period and the overview after approving an email", async () => {
    const { result, client, unmount, wrapper } = mount(month);
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    await act(async () => { await result.current.approveItem(itemId, scheduledAt); });
    expect(client.getQueryData<MarketingSnapshot>(defaultKey)?.calendar[0]).toMatchObject({ status: "scheduled", approvalStatus: "approved" });
    expect(marketingClient.loadMarketingSnapshot).toHaveBeenCalled();
    unmount();
    const next = renderHook(() => useMarketingOperations(), { wrapper });
    await waitFor(() => expect(next.result.current.snapshot.calendar[0].status).toBe("scheduled"));
  });

  it("prevents duplicate approval requests before React has rerendered", async () => {
    let confirm!: (value: Record<string, unknown>) => void;
    vi.mocked(marketingClient.approveMarketingItem).mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; }));
    const { result } = mount(month);
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    let first!: ReturnType<typeof result.current.approveItem>;
    let second!: ReturnType<typeof result.current.approveItem>;
    act(() => { first = result.current.approveItem(itemId, scheduledAt); second = result.current.approveItem(itemId, scheduledAt); });
    await waitFor(() => expect(marketingClient.approveMarketingItem).toHaveBeenCalledTimes(1));
    await act(async () => {
      server.calendar[0] = { ...server.calendar[0], status: "scheduled", approvalStatus: "approved" };
      confirm({ id: itemId, status: "scheduled", approval_status: "approved", scheduled_at: scheduledAt });
      await Promise.all([first, second]);
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it("keeps a rejected approval pending and reports the error", async () => {
    vi.mocked(marketingClient.approveMarketingItem).mockRejectedValueOnce(new Error("Approuvez d’abord la campagne."));
    const { result, client } = mount();
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    await act(async () => { expect(await result.current.approveItem(itemId, scheduledAt)).toBeFalsy(); });
    expect(result.current.notice).toMatchObject({ tone: "error", message: "Approuvez d’abord la campagne." });
    expect(client.getQueryData<MarketingSnapshot>(monthKey)?.calendar[0].approvalStatus).toBe("pending");
  });

  it("ignores an old month response that started during approval and became inactive", async () => {
    let confirm!: (value: Record<string, unknown>) => void;
    let finishOldRead!: (value: MarketingSnapshot) => void;
    vi.mocked(marketingClient.approveMarketingItem).mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; }));
    const { result, client } = mount();
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    const oldSnapshot = structuredClone(server);
    let approval!: ReturnType<typeof result.current.approveItem>;
    act(() => { approval = result.current.approveItem(itemId, scheduledAt); });
    await waitFor(() => expect(marketingClient.approveMarketingItem).toHaveBeenCalledTimes(1));
    const staleRead = client.fetchQuery({ queryKey: monthKey,
      queryFn: () => new Promise<MarketingSnapshot>((resolve) => { finishOldRead = resolve; }),
    }).catch(() => undefined);
    await act(async () => {
      server.calendar[0] = { ...server.calendar[0], status: "scheduled", approvalStatus: "approved" };
      confirm({ id: itemId, status: "scheduled", approval_status: "approved", scheduled_at: scheduledAt });
      await approval;
      finishOldRead(oldSnapshot);
      await staleRead;
    });
    expect(client.getQueryData<MarketingSnapshot>(monthKey)?.calendar[0]).toMatchObject({ status: "scheduled", approvalStatus: "approved" });
    expect(client.getQueryState(monthKey)?.isInvalidated).toBe(true);
  });

  it("refreshes cached views after an external edit and invalidates the review context", async () => {
    const { result, client, rerender } = mount(month);
    const contextKey = ["admin-marketing-review-context", campaignId, itemId];
    client.setQueryData(contextKey, { campaign: server.campaigns[0], item: server.calendar[0] });
    await waitFor(() => expect(result.current.canMutateBackend).toBe(true));
    server.calendar[0] = { ...server.calendar[0], status: "scheduled", approvalStatus: "approved" };
    await act(async () => { await result.current.refresh(); });
    expect(client.getQueryState(defaultKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(contextKey)?.isInvalidated).toBe(true);
    rerender({ range: undefined });
    await waitFor(() => expect(result.current.snapshot.calendar[0].status).toBe("scheduled"));
  });
});
