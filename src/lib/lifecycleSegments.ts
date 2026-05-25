export type LifecycleSegment =
  | "new_user"
  | "first_order_missing"
  | "churn_risk"
  | "loyal_customer"
  | "tok_one_candidate";

export type LifecycleSegmentInput = {
  createdAt?: string | null;
  ordersCount?: number | null;
  reservationsCount?: number | null;
  successfulOrdersCount?: number | null;
  lastOrderAt?: string | null;
  totalSpentChf?: number | null;
  tokOneActive?: boolean | null;
};

function daysSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

export function getLifecycleSegments(
  input: LifecycleSegmentInput,
  now = new Date(),
): LifecycleSegment[] {
  const segments: LifecycleSegment[] = [];
  const accountAgeDays = daysSince(input.createdAt, now);
  const ordersCount = Number(input.ordersCount || 0);
  const reservationsCount = Number(input.reservationsCount || 0);
  const successfulOrdersCount = Number(input.successfulOrdersCount || 0);
  const totalSpentChf = Number(input.totalSpentChf || 0);
  const daysSinceLastOrder = daysSince(input.lastOrderAt, now);

  if (accountAgeDays !== null && accountAgeDays <= 7) {
    segments.push("new_user");
  }

  if (ordersCount === 0 && reservationsCount === 0) {
    segments.push("first_order_missing");
  }

  if (daysSinceLastOrder !== null && daysSinceLastOrder >= 45 && (ordersCount > 0 || reservationsCount > 0)) {
    segments.push("churn_risk");
  }

  if (successfulOrdersCount >= 8 || totalSpentChf >= 350) {
    segments.push("loyal_customer");
  }

  if (!input.tokOneActive && (successfulOrdersCount >= 5 || totalSpentChf >= 250)) {
    segments.push("tok_one_candidate");
  }

  return segments;
}
