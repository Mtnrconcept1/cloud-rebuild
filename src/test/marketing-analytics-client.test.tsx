import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bffRequest } = vi.hoisted(() => ({ bffRequest: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({
  MARKETING_BFF_ENDPOINTS: { rpc: "/api/marketing/rpc" },
  MarketingBffError: class extends Error {},
  marketingBffRequest: bffRequest,
}));

import { resolveMarketingAnalyticsPeriod } from "@/marketing/analyticsPeriod";
import { loadMarketingAutopilotDashboard, normalizeMarketingAutopilotDashboard } from "@/marketing/autopilotClient";
import { useMarketingAutopilot } from "@/marketing/useMarketingAutopilot";

const dashboardWith = (analytics: Record<string, unknown>) => ({ generated_at: "2026-10-21T12:00:00Z", analytics });
const normalize = (analytics: Record<string, unknown>) => normalizeMarketingAutopilotDashboard(dashboardWith(analytics)).analytics;

describe("Analytics : périodes et preuves", () => {
  beforeEach(() => bffRequest.mockReset());
  afterEach(() => cleanup());

  it("résout trente dates suisses, même lorsque le jour UTC diffère", () => {
    expect(resolveMarketingAnalyticsPeriod({}, new Date("2026-10-20T22:30:00Z"))).toEqual({
      from: "2026-09-22", to: "2026-10-21", fromIso: "2026-09-21T22:00:00.000Z", toIso: "2026-10-21T22:00:00.000Z", error: null,
    });
    expect(resolveMarketingAnalyticsPeriod({ to: "2026-10-21" }).from).toBe("2026-09-22");
  });

  it("inclut toute la date de fin suisse et respecte les deux changements d'heure", async () => {
    expect(resolveMarketingAnalyticsPeriod({ from: "2026-03-29", to: "2026-03-29" })).toMatchObject({
      fromIso: "2026-03-28T23:00:00.000Z", toIso: "2026-03-29T22:00:00.000Z", error: null,
    });
    const period = resolveMarketingAnalyticsPeriod({ from: "2026-10-25", to: "2026-10-25" });
    expect(period).toMatchObject({ fromIso: "2026-10-24T22:00:00.000Z", toIso: "2026-10-25T23:00:00.000Z", error: null });
    bffRequest.mockResolvedValue(dashboardWith({ metrics: [] }));
    await loadMarketingAutopilotDashboard({ from: "2026-10-25", to: "2026-10-25" });
    expect(bffRequest).toHaveBeenCalledWith("/api/marketing/rpc", {
      body: { operation: "admin_get_marketing_autopilot_dashboard", args: { p_from: period.fromIso, p_to: period.toIso } },
    });
  });

  it("refuse les dates invalides, inversées ou trop larges avant toute requête", async () => {
    for (const range of [
      { from: "2026-02-30", to: "2026-03-02" },
      { from: "2026-10-22", to: "2026-10-21" },
      { from: "2025-01-01", to: "2026-02-01" },
      { from: "bad", to: "2026-10-21" },
    ]) {
      expect(resolveMarketingAnalyticsPeriod(range).error).toBeTruthy();
      await expect(loadMarketingAutopilotDashboard(range)).rejects.toThrow();
    }
    expect(bffRequest).not.toHaveBeenCalled();
  });

  it("privilégie les métriques explicites et calcule leur couverture réelle après déduplication", () => {
    const result = normalize({
      completeness: "complete", sent: 900, spend_minor: 10000, revenue_minor: 20000, currency: "CHF",
      metrics: [
        { key: "items_created", value: 3, unit: "count", group: "activity", source: "marketing_calendar_items" },
        { key: "sent", value: 0, group: "delivery" },
        { key: "spend", value: null, unit: "CHF", group: "attribution" },
        { key: "items_created", value: 800 },
      ],
    });
    expect(result.metrics.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: "items_created", value: 3 }, { key: "sent", value: 0 }, { key: "spend", value: null },
    ]);
    expect(result.metrics[0].group).toBe("activity");
    expect(result.metrics[0].unit).toBeNull();
    expect(result.completeness).toBe(2 / 3);
    expect(normalize({ metrics: [], spend_minor: 3000, currency: "CHF" }).metrics).toEqual([]);
  });

  it("préserve les zéros mais rejette les booléens, tableaux et chaînes vides", () => {
    const result = normalize({ completeness: "complete", metrics: [
      { key: "sent", value: false }, { key: "delivered", value: [] },
      { key: "clicks", value: "   " }, { key: "business_conversions", value: "0" },
      { key: "leads", value: "Infinity" },
    ] });
    expect(result.metrics.map((metric) => metric.value)).toEqual([null, null, null, 0, null]);
    expect(result.completeness).toBe(1 / 5);
  });

  it("n'invente ni devise ni observation et conserve une observation ancienne explicite", () => {
    const legacy = normalize({ sent: 3, revenue_minor: 12345, completeness: "partial" });
    expect(legacy.metrics.find((metric) => metric.key === "revenue")).toMatchObject({ value: null, unit: null, unavailableReason: "currency_data_unavailable" });
    expect(legacy.metrics.find((metric) => metric.key === "sent")).toMatchObject({ value: 3, observedAt: null, freshness: "unknown" });
    const canonical = normalize({ metrics: [
      { key: "sent", value: 4, observed_at: "invalid", freshness: "fresh" },
      { key: "delivered", value: 2, observed_at: "2026-10-01T10:00:00Z", freshness: "stale" },
      { key: "spend", value: 0, unit: "EUR", observed_at: "2026-10-21T11:00:00Z", freshness: "fresh" },
      { key: "roas", value: 2.5, unit: "ratio" },
    ] });
    expect(canonical.metrics[0]).toMatchObject({ observedAt: null, freshness: "unknown" });
    expect(canonical.metrics[1]).toMatchObject({ observedAt: "2026-10-01T10:00:00Z", freshness: "stale" });
    expect(canonical.metrics[2]).toMatchObject({ value: 0, unit: "EUR", freshness: "fresh" });
    expect(canonical.metrics[3]).toMatchObject({ value: 2.5, unit: "x" });
  });

  it("distingue une série absente d'une série vide et rejette les faits quotidiens mal formés", () => {
    const point = { date: "2026-10-21", sent: 1, delivered: 0, clicks: 0, conversions: 0 };
    expect(normalize({}).dailyResults).toBeUndefined();
    expect(normalize({ daily_results: [] }).dailyResults).toEqual([]);
    expect(normalize({ from: "2026-10-20T22:00:00Z", to: "2026-10-21T22:00:00Z", daily_results: [point] })).toMatchObject({
      periodFrom: "2026-10-20T22:00:00Z", periodTo: "2026-10-21T22:00:00Z", dailyResults: [point],
    });
    for (const daily_results of [null, [point, point], [{ ...point, sent: false }], [{ ...point, sent: -1 }], [{ ...point, date: "2026-02-30" }]]) {
      expect(() => normalize({ daily_results })).toThrow(/quotidienne/);
    }
  });

  it("isole le cache par période sans montrer les résultats de la période précédente", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    let completeSecond: (value: unknown) => void = () => undefined;
    bffRequest.mockResolvedValueOnce(dashboardWith({ metrics: [{ key: "sent", value: 7 }] }))
      .mockImplementationOnce(() => new Promise((resolve) => { completeSecond = resolve; }));
    const { result, rerender } = renderHook((range) => useMarketingAutopilot(range), {
      wrapper, initialProps: { from: "2026-10-01", to: "2026-10-01" },
    });
    await waitFor(() => expect(result.current.dashboard.analytics.metrics[0]?.value).toBe(7));
    rerender({ from: "2026-10-02", to: "2026-10-02" });
    await waitFor(() => expect(bffRequest).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(true);
    expect(result.current.dashboard.analytics.metrics).toEqual([]);
    await act(async () => completeSecond(dashboardWith({ metrics: [{ key: "sent", value: 2 }] })));
    await waitFor(() => expect(result.current.dashboard.analytics.metrics[0]?.value).toBe(2));
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });

  it("désactive la lecture d'une période invalide et retire les valeurs mises en cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    bffRequest.mockResolvedValue(dashboardWith({ metrics: [{ key: "sent", value: 5 }] }));
    const { result, rerender } = renderHook((range) => useMarketingAutopilot(range), {
      wrapper, initialProps: { from: "2026-10-22", to: "2026-10-21" },
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(bffRequest).not.toHaveBeenCalled();
    rerender({ from: "2026-10-21", to: "2026-10-21" });
    await waitFor(() => expect(result.current.dashboard.analytics.metrics[0]?.value).toBe(5));
    rerender({ from: "2026-10-22", to: "2026-10-21" });
    expect(result.current.dashboard.source).toBe("fallback");
    expect(result.current.dashboard.analytics.metrics).toEqual([]);
    expect(bffRequest).toHaveBeenCalledTimes(1);
  });
});
