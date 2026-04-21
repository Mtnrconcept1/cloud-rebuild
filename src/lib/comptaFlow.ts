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
  reservationFeeInvoices: InvoiceBuckets;
  payoutInvoices: InvoiceBuckets;
}) {
  const bySource = mapByRate(input.commissionBases, COMMISSION_RATE);
  const restaurantShareBySource = mapByRate(input.commissionBases, RESTAURANT_SHARE_RATE);
  const totalCommissions = Object.values(bySource).reduce((sum, amount) => sum + amount, 0);
  const reservationFeesOutstanding = sumInvoices(input.reservationFeeInvoices.actionable);
  const reservationFeesCollected = sumInvoices(input.reservationFeeInvoices.history);
  const payoutsOutstanding = sumInvoices(input.payoutInvoices.actionable);
  const payoutsPaid = sumInvoices(input.payoutInvoices.history);

  return {
    inflow: {
      bySource,
      totalCommissions,
      reservationFeesOutstanding,
      reservationFeesCollected,
      totalOutstanding: totalCommissions + reservationFeesOutstanding,
      totalCollected: reservationFeesCollected,
    },
    outflow: {
      bySource: restaurantShareBySource,
      payoutsOutstanding,
      payoutsPaid,
      totalOutstanding: payoutsOutstanding,
      totalPaid: payoutsPaid,
    },
    netOutstanding: totalCommissions + reservationFeesOutstanding - payoutsOutstanding,
  };
}

export function buildRestaurantAccountingSummary(input: {
  commissionBases: CommissionBaseTotals;
  reservationFeeInvoices: InvoiceBuckets;
  payoutInvoices: InvoiceBuckets;
}) {
  const bySource = mapByRate(input.commissionBases, RESTAURANT_SHARE_RATE);
  const receivableFromTok = sumInvoices(input.payoutInvoices.actionable);
  const receivedFromTok = sumInvoices(input.payoutInvoices.history);
  const payableToTok = sumInvoices(input.reservationFeeInvoices.actionable);
  const alreadyPaidToTok = sumInvoices(input.reservationFeeInvoices.history);

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
      alreadyPaidToTok,
      totalOutstanding: payableToTok,
      totalPaid: alreadyPaidToTok,
    },
    netOutstanding: receivableFromTok - payableToTok,
  };
}
