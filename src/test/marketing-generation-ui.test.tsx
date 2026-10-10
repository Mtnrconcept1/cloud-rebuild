import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarketingSnapshot } from "@/marketing/types";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, MarketingBffError: class extends Error {}, marketingBffRequest: request }));
const snapshot = { integrations: [], calendar: [], campaigns: [], channels: [] } as unknown as MarketingSnapshot;
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-10T17:32:18Z")); request.mockReset(); request.mockResolvedValue({ runs: [], items: [], campaign: { id: "new", name: "Genève" }, summary: "Plan", assetCount: 0, estimatedCostChf: 0.01 }); });
afterEach(async () => { await act(async () => {}); cleanup(); vi.useRealTimers(); });
it("does not silently select internal notifications for acquisition", () => {
  render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
  expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
});
it("offers the complete Geneva example with Facebook and Instagram", async () => {
  render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Recruter des restaurateurs genevois/i }));
  fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
  await waitFor(() => expect(request.mock.calls.some(([, options]) => options.body.action === "generate")).toBe(true));
  const payload = request.mock.calls.find(([, options]) => options.body.action === "generate")?.[1].body;
  expect(payload.channels).toEqual(["facebook", "instagram"]);
  expect(payload.objective).toContain("5 CHF");
  expect(payload.objective).toContain("couvert");
  expect(Date.parse(payload.startsAt)).toBeGreaterThan(Date.now());
  expect(await screen.findByText(/hors images et publicité/i)).toBeInTheDocument();
});
it("rejects a morning date before calling the generator that evening", async () => {
  render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Recruter des restaurateurs genevois/i }));
  fireEvent.change(screen.getByLabelText("Début"), { target: { value: "2026-10-10T09:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
  expect(await screen.findByText(/au moins 10 minutes/i)).toBeInTheDocument();
  expect(request.mock.calls.every(([, options]) => options.body.action !== "generate")).toBe(true);
});
function calendarProps(scheduledAt: string, channel = "in_app") {
  return {
    snapshot: { ...snapshot, channels: [{ id: channel, availability: "available" }], campaigns: [{ id: "campaign", approvedAt: "2026-10-09T10:00:00Z" }], calendar: [{ id: "item", campaignId: "campaign", campaignName: "Genève", title: "Contrôle calendrier", channel, status: "draft", approvalStatus: "pending", audienceName: "Restaurateurs", audienceSize: 0, scheduledAt, content: "Message", timezone: "Europe/Zurich" }] } as unknown as MarketingSnapshot,
    filters: { from: "2026-10-01", to: "2026-10-31", query: "", page: 1, status: "all", channel: "all" } as MarketingUrlState,
    canMutateBackend: true, pendingAction: null, onFiltersChange: vi.fn(), onCancel: vi.fn(), onApprove: vi.fn(), onCompleteManual: vi.fn(),
  };
}
it("does not treat an uncomputed zero as a permanent eligibility block", () => {
  render(<MarketingCalendarView {...calendarProps("2026-10-11T10:00:00Z")} />);
  fireEvent.click(screen.getAllByRole("button", { name: /Contrôle calendrier/ }).at(-1)!);
  expect(screen.getByText(/Calcul à l’approbation/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Approuver et planifier/ })).toBeEnabled();
});
it("blocks a past approval date and does not claim organic reach is zero", () => {
  render(<MarketingCalendarView {...calendarProps("2026-10-10T09:00:00Z", "instagram")} />);
  fireEvent.click(screen.getAllByRole("button", { name: /Contrôle calendrier/ }).at(-1)!);
  expect(screen.getByText(/Portée non estimée/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Approuver et planifier/ })).toBeDisabled();
});
