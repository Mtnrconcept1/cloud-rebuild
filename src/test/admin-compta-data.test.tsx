import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const database = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  reads: [] as Array<{ table: string; from: number; to: number }>,
  failure: "",
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      let rows = database.rows[table] || [];
      const result = () => ({ data: rows, error: database.failure === table ? new Error("Read failed") : null });
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return chain; },
        gte: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) >= value); return chain; },
        lte: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) <= value); return chain; },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return chain; },
        gt: () => chain,
        not: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        range: async (from: number, to: number) => {
          database.reads.push({ table, from, to });
          return { ...result(), data: rows.slice(from, to + 1) };
        },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  }),
}));

import { fetchAdminAccountingExportEntries, useAdminComptaData } from "@/pages/admin/adminComptaShared";
import { buildAccountingStatementSummary } from "@/lib/accountingExports";

function setup(restaurant = "all", month = "2026-10") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useAdminComptaData(restaurant, month), { wrapper: Wrapper });
}

beforeEach(() => {
  database.rows = {};
  database.reads = [];
  database.failure = "";
});
afterEach(cleanup);

function ledger(entry_id: string, account_code: string, amount_cents: number, direction = "credit", extra = {}) {
  return { entry_id, account_code, amount_cents, direction, livemode: true, currency: "CHF",
    source_type: "stripe_invoice", source_id: "invoice",
    effective_at: "2026-10-14T05:20:00Z", restaurant_id: "gazelle", ...extra };
}

describe("admin accounting data", () => {
  it("shows the collected subscription despite its August line date, with three uncollected flat fees", async () => {
    database.rows.financial_ledger = [
      ledger("revenue", "tok_subscription_revenue", 6383), ledger("vat", "tax_payable", 517),
      ledger("dev", "developer_revenue_share_expense", 690, "debit"),
    ];
    database.rows.restaurant_invoices = [{ id: "subscription", invoice_type: "subscription", status: "paid",
      amount_ttc: 69, period_start: "2026-10-14", period_end: "2026-11-13", restaurant_id: "gazelle" }];
    database.rows.restaurant_invoice_line_items = [{ invoice_id: "subscription", item_kind: "restaurant_subscription",
      amount_ttc: 69, occurred_at: "2026-08-01T21:25:00Z", restaurant_id: "gazelle" }];
    database.rows.ad_campaigns = [{ id: "credit-campaign", restaurant_id: "gazelle",
      created_at: "2026-10-15T18:03:00Z", payment_status: "paid", payment_method: "credits",
      paid_amount: 5.4, total_budget: 5.4, title: "Campagne financée par l'abonnement" }];
    database.rows.reservation_flat_fee_charges = [1, 2, 3].map((id) => ({ id: String(id), restaurant_id: "gazelle",
      reservation_id: `r${id}`, honored_at_snapshot: "2026-10-15T18:03:00Z", fee_cents: 500, invoice_id: null }));
    database.rows.reservation_fee_charges = [{ id: "legacy", fee_cents: 99900, honored_at_snapshot: "2026-10-15T18:03:00Z" }];
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeFalsy();
    expect(result.current.totalRevenue).toBe(63.83);
    expect(result.current.postedRevenue.collectedTtcAmount).toBe(69);
    expect(result.current.developerReservedShare).toBe(6.9);
    expect(result.current.summary.inflow.payableCollected).toBe(69);
    expect(result.current.payableAccruals.reservationFeeAmount).toBe(15);
    expect(result.current.payableAccruals.totalAmount).toBe(15);
    expect(result.current.postedRevenue.campaignAmount).toBe(0);
    expect(result.current.creditFundedCampaignsTotal).toBe(5.4);
    expect(result.current.reservationFeeRevenueAmount).toBe(0);
  });

  it("filters by payment accounting month, restaurant, currency and live mode", async () => {
    database.rows.financial_ledger = [
      ledger("wanted", "tok_subscription_revenue", 6383),
      ledger("other", "tok_subscription_revenue", 10000, "credit", { restaurant_id: "other" }),
      ledger("test", "tok_subscription_revenue", 10000, "credit", { livemode: false }),
      ledger("currency", "tok_subscription_revenue", 10000, "credit", { currency: "EUR" }),
      ledger("previous", "tok_subscription_revenue", 10000, "credit", { effective_at: "2026-09-30T23:00:00Z" }),
    ];
    const { result } = setup("gazelle");
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalRevenue).toBe(63.83);
  });

  it("reads beyond 1000 rows and excludes already invoiced fees from accruals", async () => {
    database.rows.financial_ledger = Array.from({ length: 1001 }, (_, id) => ledger(String(id), "tok_subscription_revenue", 100));
    database.rows.reservation_flat_fee_charges = Array.from({ length: 1001 }, (_, id) => ({
      id: String(id), reservation_id: `r${id}`, fee_cents: 500,
      honored_at_snapshot: "2026-10-15T18:03:00Z", invoice_id: id === 0 ? "already-billed" : null,
    }));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalRevenue).toBe(1001);
    expect(result.current.payableAccruals.reservationFeeAmount).toBe(5000);
    for (const table of ["financial_ledger", "reservation_flat_fee_charges"]) {
      expect(database.reads).toContainEqual({ table, from: 1000, to: 1999 });
    }
  });

  it("surfaces ledger errors instead of silently displaying a successful zero balance", async () => {
    database.failure = "financial_ledger";
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it("exports paid subscription income once and keeps uncollected fees as receivables", async () => {
    database.rows.financial_ledger = [ledger("income", "tok_subscription_revenue", 6383),
      ledger("dev", "developer_revenue_share_expense", 690, "debit")];
    database.rows.restaurant_invoices = [{ id: "subscription", invoice_type: "subscription", status: "paid",
      amount_ttc: 69, period_start: "2026-10-14", period_end: "2026-11-13", restaurant_id: "gazelle" }];
    database.rows.reservation_flat_fee_charges = [{ id: "fee", reservation_id: "r1", invoice_id: null,
      fee_cents: 500, honored_at_snapshot: "2026-10-15T18:03:00Z" }];
    const entries = await fetchAdminAccountingExportEntries({ selectedRestaurant: "all",
      period: { preset: "current_month", label: "Octobre", startDate: "2026-10-01", endDate: "2026-10-31" } });
    expect(buildAccountingStatementSummary(entries)).toMatchObject({ incomeTotal: 63.83,
      expenseTotal: 6.9, openReceivableTotal: 5 });
  });
});
