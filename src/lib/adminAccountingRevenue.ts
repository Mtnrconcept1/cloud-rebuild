import { roundCurrency } from "@/lib/comptaFlow";
import type { AccountingExportEntry } from "@/lib/accountingExports";

export type AccountingLedgerRow = {
  entry_id: string;
  account_code: string;
  direction: string;
  amount_cents: number;
  currency: string;
  livemode: boolean | null;
  effective_at?: string;
  source_type?: string;
  source_id?: string;
  restaurants?: { name: string | null } | null;
};

function liveEntries(rows: readonly AccountingLedgerRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.livemode !== true || row.currency !== "CHF" || seen.has(row.entry_id)) return false;
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0) return false;
    if (row.direction !== "credit" && row.direction !== "debit") return false;
    seen.add(row.entry_id);
    return true;
  });
}

/** Use posted amounts, including reversals, instead of reconstructing money
 * from reservations, invoice lines or consumed campaign credits. */
export function summarizeAdminAccountingRevenue(rows: readonly AccountingLedgerRow[]) {
  const centsByAccount = new Map<string, number>();
  const entries = liveEntries(rows);
  const revenueSources = new Set(entries.filter((row) => /^tok_.+_revenue$/.test(row.account_code))
    .map((row) => `${row.source_type}:${row.source_id}`));
  let collectedVatCents = 0;
  for (const row of entries) {
    const sign = row.direction === "credit" ? 1 : -1;
    centsByAccount.set(row.account_code, (centsByAccount.get(row.account_code) || 0) + sign * row.amount_cents);
    if (row.account_code === "tax_payable" && revenueSources.has(`${row.source_type}:${row.source_id}`)) {
      collectedVatCents += sign * row.amount_cents;
    }
  }
  const amount = (account: string) => (centsByAccount.get(account) || 0) / 100;
  const totalRevenue = roundCurrency([...centsByAccount].reduce(
    (sum, [account, cents]) => /^tok_.+_revenue$/.test(account) ? sum + cents / 100 : sum, 0,
  ));
  const commissionAmount = amount("tok_platform_commission_revenue");
  const reservationFeeAmount = amount("tok_reservation_revenue");
  const campaignAmount = amount("tok_campaign_revenue");
  const tokOneSubscriptionAmount = amount("tok_one_revenue");
  const restaurantPurchaseAmount = roundCurrency(amount("tok_subscription_revenue")
    + amount("tok_credit_pack_revenue") + amount("tok_module_revenue"));
  return {
    totalRevenue,
    // Includes VAT attributed to TOK, excludes restaurant pass-throughs.
    collectedTtcAmount: roundCurrency(totalRevenue + collectedVatCents / 100),
    commissionAmount,
    reservationFeeAmount,
    campaignAmount,
    tokOneSubscriptionAmount,
    restaurantPurchaseAmount,
    otherRevenueAmount: roundCurrency(totalRevenue - commissionAmount - reservationFeeAmount
      - campaignAmount - tokOneSubscriptionAmount - restaurantPurchaseAmount),
    // Expense is the earned allocation, even after a transfer clears payable.
    // Subscription contracts use gross TTC, so 10% of HT would be incorrect.
    developerReservedShare: roundCurrency(-amount("developer_revenue_share_expense")),
    stripeFeeAmount: roundCurrency(-amount("stripe_processing_fee_expense")),
  };
}

/** The admin income statement uses the same posted basis as the overview.
 * Pass-throughs, invoice balances and VAT are not TOK income or expenses. */
export function buildAdminLedgerExportEntries(rows: readonly AccountingLedgerRow[]): AccountingExportEntry[] {
  return liveEntries(rows).flatMap((row) => {
    const isIncome = /^tok_.+_revenue$/.test(row.account_code);
    const isExpense = row.account_code.endsWith("_expense");
    if (!isIncome && !isExpense) return [];
    const sign = (isIncome ? row.direction === "credit" : row.direction === "debit") ? 1 : -1;
    return [{
      date: (row.effective_at || "").slice(0, 10),
      direction: row.direction === "credit" ? "inflow" as const : "outflow" as const,
      category: isIncome ? "Revenu TOK HT" : "Charge TOK",
      label: row.account_code,
      restaurantName: row.restaurants?.name || "Plateforme TOK",
      reference: row.source_id || row.entry_id,
      amount: sign * row.amount_cents / 100,
      status: "paid",
      source: "financial_ledger",
      statementClass: isIncome ? "income" as const : "expense" as const,
    }];
  });
}
