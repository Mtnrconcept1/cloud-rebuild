import { describe, expect, it } from "vitest";
import { buildAdminLedgerExportEntries, summarizeAdminAccountingRevenue, type AccountingLedgerRow } from "@/lib/adminAccountingRevenue";
import { buildAccountingStatementSummary } from "@/lib/accountingExports";

function entry(entry_id: string, account_code: string, amount_cents: number, direction = "credit", extra = {}): AccountingLedgerRow {
  return { entry_id, account_code, amount_cents, direction, currency: "CHF", livemode: true,
    source_type: "stripe_invoice", source_id: "invoice", ...extra };
}

describe("posted admin accounting revenue", () => {
  it("reconciles a CHF 69 paid subscription with its gross developer adjustment", () => {
    const rows = [
      entry("revenue", "tok_subscription_revenue", 6383),
      entry("vat", "tax_payable", 517),
      entry("dev", "developer_revenue_share_expense", 638, "debit"),
      entry("adjustment", "developer_revenue_share_expense", 52, "debit"),
      entry("payable", "developer_payable", 690),
      entry("asset", "payment_asset", 6900, "debit"),
      entry("fee", "stripe_processing_fee_expense", 230, "debit"),
      entry("tax-settlement", "tax_payable", 517, "debit", { source_type: "tax_settlement", source_id: "vat-payment" }),
    ];
    expect(summarizeAdminAccountingRevenue([...rows, ...rows])).toMatchObject({
      totalRevenue: 63.83, collectedTtcAmount: 69, restaurantPurchaseAmount: 63.83,
      developerReservedShare: 6.9, stripeFeeAmount: 2.3,
    });
  });

  it("nets refunds and does not recalculate the earned share when it is paid out", () => {
    expect(summarizeAdminAccountingRevenue([
      entry("income", "tok_subscription_revenue", 6383),
      entry("refund", "tok_subscription_revenue", 2000, "debit"),
      entry("earned", "developer_revenue_share_expense", 690, "debit"),
      entry("dev-refund", "developer_revenue_share_expense", 200),
      entry("settlement", "developer_payable", 490, "debit"),
    ])).toMatchObject({ totalRevenue: 43.83, developerReservedShare: 4.9 });
  });

  it("counts all TOK revenue accounts once, including future categories", () => {
    const summary = summarizeAdminAccountingRevenue([
      entry("order", "tok_platform_commission_revenue", 1000),
      entry("reservation", "tok_reservation_revenue", 500),
      entry("campaign", "tok_campaign_revenue", 1000),
      entry("one", "tok_one_revenue", 1000),
      entry("credits", "tok_credit_pack_revenue", 1000),
      entry("module", "tok_module_revenue", 1000),
      entry("future", "tok_future_revenue", 500),
      entry("restaurant", "restaurant_payable", 9000),
      entry("test", "tok_subscription_revenue", 99999, "credit", { livemode: false }),
      entry("unknown", "tok_subscription_revenue", 99999, "credit", { livemode: null }),
      entry("eur", "tok_subscription_revenue", 99999, "credit", { currency: "EUR" }),
    ]);
    expect(summary.totalRevenue).toBe(60);
    expect(summary.otherRevenueAmount).toBe(5);
    expect(summary.developerReservedShare).toBe(0);
  });

  it("does not create revenue or developer entitlement for uncollected reservations", () => {
    expect(summarizeAdminAccountingRevenue([])).toMatchObject({
      totalRevenue: 0, reservationFeeAmount: 0, developerReservedShare: 0,
    });
  });

  it("uses the same HT income and exact developer expense in statement exports", () => {
    const rows = [
      entry("income", "tok_subscription_revenue", 6383),
      entry("refund", "tok_subscription_revenue", 1000, "debit"),
      entry("dev", "developer_revenue_share_expense", 690, "debit"),
      entry("dev-refund", "developer_revenue_share_expense", 100),
      entry("stripe", "stripe_processing_fee_expense", 230, "debit"),
      entry("vat", "tax_payable", 517),
      entry("pass-through", "restaurant_payable", 9000),
    ];
    const entries = buildAdminLedgerExportEntries(rows);
    const statement = buildAccountingStatementSummary(entries);
    expect(statement.incomeTotal).toBe(summarizeAdminAccountingRevenue(rows).totalRevenue);
    expect(statement.expenseTotal).toBe(8.2);
    expect(entries).toHaveLength(5);
  });
});
