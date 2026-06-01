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

export type PerformanceTodaySnapshot = {
  dayKey: string;
  totalOrders: number;
  validOrdersCount: number;
  invalidOrdersCount: number;
  totalRevenue: number;
  avgTicket: number;
  totalReservations: number;
  cancelRate: number;
  avgSatisfaction: number;
  reviewsCount: number;
};

export type PerformanceAlert = {
  id: string;
  tone: "warning" | "positive" | "neutral";
  title: string;
  description: string;
};

export type PerformanceInsight = {
  id: string;
  label: string;
  value: string;
  description: string;
};

export type PerformanceServiceSnapshot = Record<ServicePeriod, {
  count: number;
  covers: number;
  revenue: number;
}>;

export type PerformanceServiceSummary = {
  lunch: PerformanceServiceSnapshot["lunch"];
  dinner: PerformanceServiceSnapshot["dinner"];
  strongestService: ServicePeriod | null;
  weakestService: ServicePeriod | null;
};

export type PerformanceActivityItem = {
  key: string;
  kind: "order" | "reservation";
  title: string;
  subtitle: string;
  occurredAt: string;
  statusLabel: string;
  amount: number;
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

function getOrderAmount(metadata: unknown, amount: number) {
  const source = isRecord(metadata) ? metadata : {};
  const verifiedTotal = toNumber(source.verified_total);
  return verifiedTotal > 0 ? verifiedTotal : amount;
}

function formatCompactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReservationDateTime(dayKey: string, timeValue?: string | null) {
  const composed = `${dayKey}T${String(timeValue || "12:00")}:00`;
  const date = new Date(composed);
  if (Number.isNaN(date.getTime())) return `${dayKey} ${String(timeValue || "").trim()}`.trim();
  return formatCompactDateTime(date.toISOString());
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

export function getTodayPerformanceSnapshot(summary: PerformanceSummary, dayKey: string): PerformanceTodaySnapshot {
  const row = summary.dailyRows.find((entry) => entry.kpi_date === dayKey);

  return {
    dayKey,
    totalOrders: row?.orders_count || 0,
    validOrdersCount: row?.valid_orders_count || 0,
    invalidOrdersCount: (row?.orders_count || 0) - (row?.valid_orders_count || 0),
    totalRevenue: row?.revenue || 0,
    avgTicket: row?.avg_ticket || 0,
    totalReservations: row?.reservations_count || 0,
    cancelRate: row?.cancel_rate || 0,
    avgSatisfaction: row?.satisfaction_score || 0,
    reviewsCount: row?.reviews_count || 0,
  };
}

export function buildTodayServiceSummary(
  reservations: ReservationPerformanceRow[],
  dayKey: string,
): PerformanceServiceSummary {
  return buildReservationServiceSummaryForRange(reservations, dayKey, dayKey);
}

export function buildPeriodServiceSummary(
  reservations: ReservationPerformanceRow[],
  fromDay: string,
  toDay: string,
): PerformanceServiceSummary {
  return buildReservationServiceSummaryForRange(reservations, fromDay, toDay);
}

function buildReservationServiceSummaryForRange(
  reservations: ReservationPerformanceRow[],
  fromDay: string,
  toDay: string,
): PerformanceServiceSummary {
  const summary: PerformanceServiceSnapshot = {
    lunch: { count: 0, covers: 0, revenue: 0 },
    dinner: { count: 0, covers: 0, revenue: 0 },
  };

  for (const reservation of reservations) {
    if (compareDateKeys(reservation.date, fromDay) < 0 || compareDateKeys(reservation.date, toDay) > 0) continue;
    if (INVALID_RESERVATION_STATUSES.has(normalizeStatus(reservation.status))) continue;

    const periodKey = getServicePeriodFromMetadata(reservation.metadata, reservation.time || null);
    summary[periodKey].count += 1;
    summary[periodKey].covers += Number(reservation.party_size || 0);
    summary[periodKey].revenue += toNumber(reservation.total_amount);
  }

  const ranking = (Object.entries(summary) as Array<[ServicePeriod, PerformanceServiceSnapshot["lunch"]]>)
    .sort((left, right) => right[1].count - left[1].count);

  return {
    lunch: summary.lunch,
    dinner: summary.dinner,
    strongestService: ranking.find(([, value]) => value.count > 0)?.[0] || null,
    weakestService: ranking.filter(([, value]) => value.count > 0).slice(-1)[0]?.[0] || null,
  };
}

export function buildPerformanceAlerts(input: {
  summary: PerformanceSummary;
  today: PerformanceTodaySnapshot;
  todayServices: PerformanceServiceSummary;
}): PerformanceAlert[] {
  const { summary, today, todayServices } = input;
  const previousRows = summary.dailyRows.filter((row) => row.kpi_date !== today.dayKey);
  const rowsWithOrders = previousRows.filter((row) => row.valid_orders_count > 0);
  const averageOrders = rowsWithOrders.length > 0
    ? rowsWithOrders.reduce((sum, row) => sum + row.valid_orders_count, 0) / rowsWithOrders.length
    : 0;

  const alerts: PerformanceAlert[] = [];

  if (today.invalidOrdersCount > 0 && today.cancelRate >= 20) {
    alerts.push({
      id: "cancel-rate",
      tone: "warning",
      title: "Annulations elevees aujourd'hui",
      description: `${today.invalidOrdersCount} commande(s) perdues, soit ${today.cancelRate.toFixed(1)}% des commandes du jour.`,
    });
  }

  if (today.avgSatisfaction > 0 && today.avgSatisfaction < 4) {
    alerts.push({
      id: "satisfaction",
      tone: "warning",
      title: "Satisfaction a surveiller",
      description: `La note du jour est a ${today.avgSatisfaction.toFixed(1)}/5. Verifiez rapidement les retours clients.`,
    });
  }

  if (averageOrders > 0 && today.validOrdersCount > 0 && today.validOrdersCount < averageOrders * 0.7) {
    alerts.push({
      id: "order-drop",
      tone: "warning",
      title: "Rythme de commandes en baisse",
      description: `${today.validOrdersCount} commande(s) valides aujourd'hui contre ${averageOrders.toFixed(1)} en moyenne sur la periode.`,
    });
  }

  if (today.totalReservations === 0) {
    alerts.push({
      id: "no-reservation",
      tone: "neutral",
      title: "Aucune réservation enregistrée aujourd'hui",
      description: "Surveillez vos disponibilités et vos campagnes pour remplir le service restant.",
    });
  } else if (todayServices.strongestService && todayServices.weakestService && todayServices.strongestService !== todayServices.weakestService) {
    const weak = todayServices[todayServices.weakestService];
    alerts.push({
      id: "service-gap",
      tone: "neutral",
      title: "Un service reste plus faible",
      description: `${todayServices.weakestService === "lunch" ? "Le midi" : "Le soir"} ne compte que ${weak.count} réservation(s) aujourd'hui.`,
    });
  }

  if (!alerts.length && (today.totalOrders > 0 || today.totalReservations > 0)) {
    alerts.push({
      id: "healthy-day",
      tone: "positive",
      title: "Rien d'anormal aujourd'hui",
      description: "Les principaux indicateurs du jour restent dans une zone saine.",
    });
  }

  return alerts.slice(0, 3);
}

export function buildPerformanceInsights(summary: PerformanceSummary): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];
  const totalCovers = summary.reservationServiceBreakdown.lunch.covers + summary.reservationServiceBreakdown.dinner.covers;

  if (totalCovers > 0) {
    const dinnerShare = (summary.reservationServiceBreakdown.dinner.covers / totalCovers) * 100;
    const focusService = dinnerShare >= 50 ? "soir" : "midi";
    insights.push({
      id: "service-share",
      label: "Service dominant",
      value: focusService,
      description: `Le ${focusService} concentre ${Math.max(dinnerShare, 100 - dinnerShare).toFixed(0)}% des couverts sur la periode.`,
    });
  }

  if (summary.discounts.total > 0) {
    const entries = [
      { key: "formules", value: summary.discounts.formula },
      { key: "promotions", value: summary.discounts.promo },
      { key: "fidelite", value: summary.discounts.loyalty },
      { key: "flex", value: summary.discounts.flex },
    ].sort((left, right) => right.value - left.value);
    const top = entries[0];
    insights.push({
      id: "discount-driver",
      label: "Remise dominante",
      value: top.key,
      description: `${top.key.charAt(0).toUpperCase()}${top.key.slice(1)} représentent ${((top.value / summary.discounts.total) * 100).toFixed(0)}% des remises.`,
    });
  }

  if (summary.dailyRows.length >= 6) {
    const midpoint = Math.floor(summary.dailyRows.length / 2);
    const firstHalf = summary.dailyRows.slice(0, midpoint);
    const secondHalf = summary.dailyRows.slice(midpoint);
    const avgFirst = firstHalf.reduce((sum, row) => sum + row.avg_ticket, 0) / Math.max(1, firstHalf.length);
    const avgSecond = secondHalf.reduce((sum, row) => sum + row.avg_ticket, 0) / Math.max(1, secondHalf.length);

    if (avgFirst > 0 && avgSecond > 0) {
      const delta = ((avgSecond - avgFirst) / avgFirst) * 100;
      insights.push({
        id: "ticket-trend",
        label: "Ticket moyen",
        value: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`,
        description: `Le panier moyen est ${delta >= 0 ? "plus haut" : "plus bas"} sur la seconde moitie de periode.`,
      });
    }
  }

  if (summary.avgSatisfaction > 0) {
    insights.push({
      id: "satisfaction-level",
      label: "Satisfaction",
      value: `${summary.avgSatisfaction.toFixed(1)}/5`,
      description: summary.avgSatisfaction >= 4.5
        ? "Les avis restent très positifs sur la periode."
        : "Là satisfaction merite un suivi plus fin sur la periode.",
    });
  }

  return insights.slice(0, 3);
}

export function buildTodayActivity(input: {
  orders: OrderPerformanceRow[];
  reservations: ReservationPerformanceRow[];
  dayKey: string;
}) {
  const recentOrders = input.orders
    .filter((order) => dayKeyFromIso(order.created_at) === input.dayKey)
    .sort((left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)))
    .slice(0, 4)
    .map((order, index) => {
      const amount = getOrderAmount(order.metadata, toNumber(order.total_amount));
      const status = normalizeStatus(order.status) || "inconnu";
      return {
        key: `order-${index}-${order.created_at}`,
        kind: "order" as const,
        title: `Commande ${amount > 0 ? `${amount.toFixed(2)} CHF` : "en cours"}`,
        subtitle: formatCompactDateTime(order.created_at),
        occurredAt: order.created_at,
        statusLabel: status,
        amount,
      } satisfies PerformanceActivityItem;
    });

  const recentReservations = input.reservations
    .filter((reservation) => reservation.date === input.dayKey)
    .filter((reservation) => !INVALID_RESERVATION_STATUSES.has(normalizeStatus(reservation.status)))
    .sort((left, right) => String(right.time || "").localeCompare(String(left.time || "")))
    .slice(0, 4)
    .map((reservation, index) => {
      const partySize = Number(reservation.party_size || 0);
      const status = normalizeStatus(reservation.status) || "inconnu";
      return {
        key: `reservation-${index}-${reservation.date}-${reservation.time}`,
        kind: "reservation" as const,
        title: `${partySize || 0} couvert(s)`,
        subtitle: formatReservationDateTime(reservation.date, reservation.time),
        occurredAt: `${reservation.date}T${String(reservation.time || "00:00")}:00`,
        statusLabel: status,
        amount: toNumber(reservation.total_amount),
      } satisfies PerformanceActivityItem;
    });

  return {
    recentOrders,
    recentReservations,
  };
}
