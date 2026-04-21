import { getServicePeriodFromMetadata, type ServicePeriod } from "@/lib/serviceSettings";

export type OrderPerformanceRow = {
  created_at: string;
  total_amount: number | string | null;
  status: string | null;
  metadata?: unknown;
};

export type ReservationPerformanceRow = {
  date: string;
  time?: string | null;
  status: string | null;
  party_size?: number | null;
  feature?: string | null;
  total_amount?: number | string | null;
  metadata?: unknown;
};

export type ReviewPerformanceRow = {
  created_at: string;
  rating: number | string | null;
};

export type PerformanceDailyRow = {
  kpi_date: string;
  orders_count: number;
  valid_orders_count: number;
  revenue: number;
  avg_ticket: number;
  reservations_count: number;
  cancel_rate: number;
  satisfaction_score: number;
  reviews_count: number;
};

export type PerformanceSummary = {
  dailyRows: PerformanceDailyRow[];
  totalOrders: number;
  validOrdersCount: number;
  invalidOrdersCount: number;
  totalRevenue: number;
  grossRevenue: number;
  avgTicket: number;
  totalReservations: number;
  cancelRate: number;
  avgSatisfaction: number;
  accountingAvgTicket: number;
  reservationServiceBreakdown: Record<ServicePeriod, { count: number; covers: number }>;
  discounts: {
    formula: number;
    promo: number;
    loyalty: number;
    flex: number;
    total: number;
  };
  hasActivity: boolean;
};

type DailyAccumulator = {
  ordersCount: number;
  validOrdersCount: number;
  invalidOrdersCount: number;
  revenue: number;
  reservationsCount: number;
  reviewScoreTotal: number;
  reviewsCount: number;
};

type BuildPerformanceSummaryInput = {
  orders: OrderPerformanceRow[];
  reservations: ReservationPerformanceRow[];
  reviews: ReviewPerformanceRow[];
  fromDay: string;
  toDay: string;
};

export const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed", "pending_payment"]);
export const INVALID_RESERVATION_STATUSES = new Set(["cancelled", "no_show"]);

function normalizeStatus(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function createDailyAccumulator(): DailyAccumulator {
  return {
    ordersCount: 0,
    validOrdersCount: 0,
    invalidOrdersCount: 0,
    revenue: 0,
    reservationsCount: 0,
    reviewScoreTotal: 0,
    reviewsCount: 0,
  };
}

export function listDateKeysInclusive(fromDay: string, toDay: string) {
  const keys: string[] = [];
  const cursor = new Date(`${fromDay}T00:00:00.000Z`);
  const end = new Date(`${toDay}T00:00:00.000Z`);

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

export function getPerformancePeriodBounds(periodDays: number, now: Date = new Date()) {
  const safePeriodDays = Math.max(1, Math.floor(Number.isFinite(periodDays) ? periodDays : 30));
  const endDate = new Date(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (safePeriodDays - 1));

  const fromDay = startDate.toISOString().slice(0, 10);
  const toDay = endDate.toISOString().slice(0, 10);
  const fromTimestamp = `${fromDay}T00:00:00.000Z`;
  const toTimestampExclusiveDate = new Date(`${toDay}T00:00:00.000Z`);
  toTimestampExclusiveDate.setUTCDate(toTimestampExclusiveDate.getUTCDate() + 1);

  return {
    fromDay,
    toDay,
    fromTimestamp,
    toTimestampExclusive: toTimestampExclusiveDate.toISOString(),
    periodDays: safePeriodDays,
  };
}

export function buildPerformanceSummary({
  orders,
  reservations,
  reviews,
  fromDay,
  toDay,
}: BuildPerformanceSummaryInput): PerformanceSummary {
  const dayKeys = listDateKeysInclusive(fromDay, toDay);
  const byDay = new Map(dayKeys.map((dayKey) => [dayKey, createDailyAccumulator()]));
  const reservationServiceBreakdown: Record<ServicePeriod, { count: number; covers: number }> = {
    lunch: { count: 0, covers: 0 },
    dinner: { count: 0, covers: 0 },
  };

  let formulaDiscount = 0;
  let promoDiscount = 0;
  let loyaltyDiscount = 0;
  let flexDiscount = 0;
  let totalRevenue = 0;
  let totalOrders = 0;
  let validOrdersCount = 0;
  let invalidOrdersCount = 0;
  let totalReservations = 0;
  let reviewScoreTotal = 0;
  let reviewsCount = 0;

  for (const order of orders) {
    const dayKey = dayKeyFromIso(order.created_at);
    if (!dayKey || compareDateKeys(dayKey, fromDay) < 0 || compareDateKeys(dayKey, toDay) > 0) continue;

    const bucket = byDay.get(dayKey) || createDailyAccumulator();
    bucket.ordersCount += 1;
    totalOrders += 1;

    const status = normalizeStatus(order.status);
    if (INVALID_ORDER_STATUSES.has(status)) {
      bucket.invalidOrdersCount += 1;
      invalidOrdersCount += 1;
      byDay.set(dayKey, bucket);
      continue;
    }

    const amount = toNumber(order.total_amount);
    bucket.validOrdersCount += 1;
    bucket.revenue += amount;
    totalRevenue += amount;
    validOrdersCount += 1;

    const metadata = isRecord(order.metadata) ? order.metadata : {};
    const formulaValue = toNumber(metadata.formula_discount_amount) || toNumber(metadata.formula_discount);
    formulaDiscount += formulaValue;
    const tokOneValue = toNumber(metadata.tok_one_total_saved)
      || (toNumber(metadata.tok_one_discount_amount) + toNumber(metadata.tok_one_delivery_saved));
    promoDiscount += (toNumber(metadata.promotion_discount_amount) || toNumber(metadata.promo_discount_amount)) + tokOneValue;
    loyaltyDiscount += toNumber(metadata.points_discount);
    flexDiscount += toNumber(metadata.flex_discount);

    byDay.set(dayKey, bucket);
  }

  for (const reservation of reservations) {
    const dayKey = reservation.date;
    if (!dayKey || compareDateKeys(dayKey, fromDay) < 0 || compareDateKeys(dayKey, toDay) > 0) continue;

    const status = normalizeStatus(reservation.status);
    if (INVALID_RESERVATION_STATUSES.has(status)) continue;

    const bucket = byDay.get(dayKey) || createDailyAccumulator();
    bucket.reservationsCount += 1;
    totalReservations += 1;

    // Include zero-attente paid reservation revenue
    const feature = String(reservation.feature || "").toLowerCase();
    if (feature === "zero-attente") {
      const amount = toNumber(reservation.total_amount);
      if (amount > 0) {
        bucket.revenue += amount;
        totalRevenue += amount;
        // Extract discounts from zero-attente metadata
        const metadata = isRecord(reservation.metadata) ? reservation.metadata : {};
        const formulaValue = toNumber(metadata.formula_discount_amount) || toNumber(metadata.formula_discount);
        formulaDiscount += formulaValue;
      }
    }

    const periodKey = getServicePeriodFromMetadata(reservation.metadata, reservation.time || null);
    reservationServiceBreakdown[periodKey].count += 1;
    reservationServiceBreakdown[periodKey].covers += Number(reservation.party_size || 0);

    byDay.set(dayKey, bucket);
  }

  for (const review of reviews) {
    const dayKey = dayKeyFromIso(review.created_at);
    if (!dayKey || compareDateKeys(dayKey, fromDay) < 0 || compareDateKeys(dayKey, toDay) > 0) continue;

    const rating = toNumber(review.rating);
    if (rating <= 0) continue;

    const bucket = byDay.get(dayKey) || createDailyAccumulator();
    bucket.reviewScoreTotal += rating;
    bucket.reviewsCount += 1;
    reviewScoreTotal += rating;
    reviewsCount += 1;

    byDay.set(dayKey, bucket);
  }

  const dailyRows = dayKeys.map((dayKey) => {
    const bucket = byDay.get(dayKey) || createDailyAccumulator();
    return {
      kpi_date: dayKey,
      orders_count: bucket.ordersCount,
      valid_orders_count: bucket.validOrdersCount,
      revenue: bucket.revenue,
      avg_ticket: bucket.validOrdersCount > 0 ? bucket.revenue / bucket.validOrdersCount : 0,
      reservations_count: bucket.reservationsCount,
      cancel_rate: bucket.ordersCount > 0 ? (bucket.invalidOrdersCount / bucket.ordersCount) * 100 : 0,
      satisfaction_score: bucket.reviewsCount > 0 ? bucket.reviewScoreTotal / bucket.reviewsCount : 0,
      reviews_count: bucket.reviewsCount,
    };
  });

  const totalDiscounts = formulaDiscount + promoDiscount + loyaltyDiscount + flexDiscount;
  const grossRevenue = totalRevenue + totalDiscounts;
  const hasActivity = dailyRows.some(
    (row) =>
      row.orders_count > 0 ||
      row.valid_orders_count > 0 ||
      row.revenue > 0 ||
      row.reservations_count > 0 ||
      row.reviews_count > 0,
  );

  return {
    dailyRows,
    totalOrders,
    validOrdersCount,
    invalidOrdersCount,
    totalRevenue,
    grossRevenue,
    avgTicket: validOrdersCount > 0 ? totalRevenue / validOrdersCount : 0,
    totalReservations,
    cancelRate: totalOrders > 0 ? (invalidOrdersCount / totalOrders) * 100 : 0,
    avgSatisfaction: reviewsCount > 0 ? reviewScoreTotal / reviewsCount : 0,
    accountingAvgTicket: validOrdersCount > 0 ? totalRevenue / validOrdersCount : 0,
    reservationServiceBreakdown,
    discounts: {
      formula: formulaDiscount,
      promo: promoDiscount,
      loyalty: loyaltyDiscount,
      flex: flexDiscount,
      total: totalDiscounts,
    },
    hasActivity,
  };
}
