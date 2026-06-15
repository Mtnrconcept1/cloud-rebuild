import type { CommissionBaseTotals, CommissionSource } from "@/lib/comptaCommissionSources";

type MoneyLike = {
  amount_ttc?: number | string | null;
};

export type InvoiceBuckets<T extends MoneyLike = MoneyLike> = {
  actionable: T[];
  history: T[];
};

export const TOK_COMMISSION_RATE = 0.1;
export const RESTAURANT_SHARE_RATE = 1 - TOK_COMMISSION_RATE;
export const DEVELOPER_RESERVED_SHARE_RATE = 0.1;

export const DIRECT_TOK_PURCHASE_ITEM_KINDS = [
  "launch_pack",
  "restaurant_subscription",
  "credit_pack",
] as const;

type DirectTokPurchaseItemKind = (typeof DIRECT_TOK_PURCHASE_ITEM_KINDS)[number];
type DirectTokPurchaseLineItemLike = {
  item_kind?: string | null;
  invoice_id?: string | null;
  amount_ttc?: number | string | null;
};

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTokCommission(commissionBase: number | string | null | undefined) {
  return roundCurrency(toAmount(commissionBase) * TOK_COMMISSION_RATE);
}

export function calculateRestaurantShare(commissionBase: number | string | null | undefined) {
  return roundCurrency(toAmount(commissionBase) * RESTAURANT_SHARE_RATE);
}

export function calculateDeveloperReservedShare(totalRevenue: number | string | null | undefined) {
  return roundCurrency(toAmount(totalRevenue) * DEVELOPER_RESERVED_SHARE_RATE);
}

function normalizeRevenueItemKind(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isDirectTokPurchaseItemKind(value: string | null | undefined): value is DirectTokPurchaseItemKind {
  return DIRECT_TOK_PURCHASE_ITEM_KINDS.includes(normalizeRevenueItemKind(value) as DirectTokPurchaseItemKind);
}

export function sumDirectTokPurchaseRevenue(
  lineItems: readonly DirectTokPurchaseLineItemLike[],
  paidInvoiceIds?: ReadonlySet<string>,
) {
  return roundCurrency(lineItems.reduce((sum, lineItem) => {
    if (!isDirectTokPurchaseItemKind(lineItem.item_kind)) return sum;
    if (paidInvoiceIds && (!lineItem.invoice_id || !paidInvoiceIds.has(lineItem.invoice_id))) return sum;

    return sum + toAmount(lineItem.amount_ttc);
  }, 0));
}

function sumInvoices(invoices: readonly MoneyLike[]) {
  return invoices.reduce((sum, invoice) => sum + toAmount(invoice.amount_ttc), 0);
}

function mapByRate(bases: CommissionBaseTotals, rate: number) {
  return Object.fromEntries(
    Object.entries(bases).map(([source, amount]) => [source, roundCurrency(toAmount(amount) * rate)]),
  ) as Record<CommissionSource, number>;
}

export function buildTokAccountingSummary(input: {
  commissionBases: CommissionBaseTotals;
  payableInvoices?: InvoiceBuckets;
  reservationFeeInvoices: InvoiceBuckets;
  payoutInvoices: InvoiceBuckets;
  payableAccruedAmount?: number;
  reservationFeeAccruedAmount?: number;
}) {
  const payableInvoices = input.payableInvoices ?? input.reservationFeeInvoices;
  const bySource = mapByRate(input.commissionBases, TOK_COMMISSION_RATE);
  const restaurantShareBySource = mapByRate(input.commissionBases, RESTAURANT_SHARE_RATE);
  const totalCommissions = roundCurrency(Object.values(bySource).reduce((sum, amount) => sum + amount, 0));
  const payableOutstanding = sumInvoices(payableInvoices.actionable);
  const payableCollected = sumInvoices(payableInvoices.history);
  const payablePendingInvoice = toAmount(input.payableAccruedAmount ?? input.reservationFeeAccruedAmount);
  const payoutsOutstanding = sumInvoices(input.payoutInvoices.actionable);
  const payoutsPaid = sumInvoices(input.payoutInvoices.history);

  return {
    inflow: {
      bySource,
      totalCommissions,
      payableOutstanding,
      payablePendingInvoice,
      payableCollected,
      reservationFeesOutstanding: payableOutstanding,
      reservationFeesPendingInvoice: payablePendingInvoice,
      reservationFeesCollected: payableCollected,
      totalOutstanding: payableOutstanding + payablePendingInvoice,
      totalCollected: payableCollected,
    },
    outflow: {
      bySource: restaurantShareBySource,
      payoutsOutstanding,
      payoutsPaid,
      totalOutstanding: payoutsOutstanding,
      totalPaid: payoutsPaid,
    },
    netOutstanding: payableOutstanding + payablePendingInvoice - payoutsOutstanding,
  };
}

export function buildTokRevenueSummary(input: {
  commissionAmount: number | string | null | undefined;
  reservationFeeAmount: number | string | null | undefined;
  campaignAmount: number | string | null | undefined;
  tokOneSubscriptionAmount: number | string | null | undefined;
  restaurantPurchaseAmount?: number | string | null | undefined;
  otherRevenueAmount?: number | string | null | undefined;
}) {
  const totalRevenue = roundCurrency(toAmount(input.commissionAmount)
    + toAmount(input.reservationFeeAmount)
    + toAmount(input.campaignAmount)
    + toAmount(input.tokOneSubscriptionAmount)
    + toAmount(input.restaurantPurchaseAmount)
    + toAmount(input.otherRevenueAmount));

  return {
    totalRevenue,
    developerReservedShare: calculateDeveloperReservedShare(totalRevenue),
  };
}

export function buildRestaurantAccountingSummary(input: {
  commissionBases: CommissionBaseTotals;
  payableInvoices?: InvoiceBuckets;
  reservationFeeInvoices: InvoiceBuckets;
  payoutInvoices: InvoiceBuckets;
  payableAccruedAmount?: number;
  reservationFeeAccruedAmount?: number;
}) {
  const payableInvoices = input.payableInvoices ?? input.reservationFeeInvoices;
  const bySource = mapByRate(input.commissionBases, RESTAURANT_SHARE_RATE);
  const receivableFromTok = sumInvoices(input.payoutInvoices.actionable);
  const receivedFromTok = sumInvoices(input.payoutInvoices.history);
  const payableToTok = sumInvoices(payableInvoices.actionable);
  const alreadyPaidToTok = sumInvoices(payableInvoices.history);
  const payablePendingInvoice = toAmount(input.payableAccruedAmount ?? input.reservationFeeAccruedAmount);

  return {
    inflow: {
      bySource,
      receivableFromTok,
      receivedFromTok,
      totalOutstanding: receivableFromTok,
      totalReceived: receivedFromTok,
    },
    outflow: {
      payableToTok,
      payablePendingInvoice,
      alreadyPaidToTok,
      reservationFeesPendingInvoice: payablePendingInvoice,
      totalOutstanding: payableToTok + payablePendingInvoice,
      totalPaid: alreadyPaidToTok,
    },
    netOutstanding: receivableFromTok - payableToTok - payablePendingInvoice,
  };
}
