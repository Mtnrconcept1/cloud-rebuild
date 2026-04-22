import type { CommissionBaseTotals, CommissionSource } from "@/lib/comptaCommissionSources";

type MoneyLike = {
  amount_ttc?: number | string | null;
};

export type InvoiceBuckets<T extends MoneyLike = MoneyLike> = {
  actionable: T[];
  history: T[];
};

const COMMISSION_RATE = 0.1;
const RESTAURANT_SHARE_RATE = 0.9;

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumInvoices(invoices: readonly MoneyLike[]) {
  return invoices.reduce((sum, invoice) => sum + toAmount(invoice.amount_ttc), 0);
}

function mapByRate(bases: CommissionBaseTotals, rate: number) {
  return Object.fromEntries(
    Object.entries(bases).map(([source, amount]) => [source, toAmount(amount) * rate]),
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
  const bySource = mapByRate(input.commissionBases, COMMISSION_RATE);
  const restaurantShareBySource = mapByRate(input.commissionBases, RESTAURANT_SHARE_RATE);
  const totalCommissions = Object.values(bySource).reduce((sum, amount) => sum + amount, 0);
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
