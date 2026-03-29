type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export type RestaurantPaymentEventKind =
  | "order_charge"
  | "order_refund"
  | "campaign_payment"
  | "invoice_payment";

export type RestaurantPaymentDirection = "received" | "issued";

export type RestaurantPaymentEvent = {
  event_id: string;
  event_kind: RestaurantPaymentEventKind;
  direction: RestaurantPaymentDirection;
  occurred_at: string;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  title: string;
  subtitle: string | null;
  payment_method: string | null;
  order_id: string | null;
  campaign_id: string | null;
  invoice_id: string | null;
};

export type RestaurantPaymentDirectionFilter = "all" | RestaurantPaymentDirection;
export type RestaurantPaymentStatusFilter = "all" | "succeeded" | "pending" | "failed" | "cancelled";

export type RestaurantPaymentSummary = {
  receivedCharges: number;
  refunds: number;
  issuedPayments: number;
  netPlatform: number;
};

function toAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase();
}

export function getRestaurantPaymentStatusMeta(status: string | null | undefined): {
  label: string;
  variant: BadgeVariant;
} {
  switch (normalizeStatus(status)) {
    case "succeeded":
      return { label: "Reussi", variant: "default" };
    case "processing":
    case "pending":
      return { label: "En attente", variant: "secondary" };
    case "failed":
      return { label: "Echoue", variant: "destructive" };
    case "cancelled":
      return { label: "Annule", variant: "outline" };
    default:
      return { label: "Inconnu", variant: "outline" };
  }
}

export function getRestaurantPaymentDirectionMeta(direction: RestaurantPaymentDirection): {
  label: string;
  variant: BadgeVariant;
} {
  return direction === "received"
    ? { label: "Recu", variant: "secondary" }
    : { label: "Effectue", variant: "outline" };
}

export function matchesRestaurantPaymentStatusFilter(
  status: string | null | undefined,
  filter: RestaurantPaymentStatusFilter,
) {
  const normalized = normalizeStatus(status);

  if (filter === "all") return true;
  if (filter === "pending") return normalized === "pending" || normalized === "processing";
  return normalized === filter;
}

export function filterRestaurantPaymentEvents(
  events: RestaurantPaymentEvent[],
  directionFilter: RestaurantPaymentDirectionFilter,
  statusFilter: RestaurantPaymentStatusFilter,
) {
  return events.filter((event) => {
    const directionMatches = directionFilter === "all" || event.direction === directionFilter;
    const statusMatches = matchesRestaurantPaymentStatusFilter(event.status, statusFilter);
    return directionMatches && statusMatches;
  });
}

export function buildRestaurantPaymentSummary(events: RestaurantPaymentEvent[]): RestaurantPaymentSummary {
  return events.reduce<RestaurantPaymentSummary>((summary, event) => {
    if (normalizeStatus(event.status) !== "succeeded") {
      return summary;
    }

    const amount = toAmount(event.amount);

    if (event.event_kind === "order_charge") {
      summary.receivedCharges += amount;
      summary.netPlatform += amount;
      return summary;
    }

    if (event.event_kind === "order_refund") {
      summary.refunds += amount;
      summary.netPlatform -= amount;
      return summary;
    }

    summary.issuedPayments += amount;
    summary.netPlatform -= amount;
    return summary;
  }, {
    receivedCharges: 0,
    refunds: 0,
    issuedPayments: 0,
    netPlatform: 0,
  });
}

export function getRestaurantPaymentSignedAmount(event: RestaurantPaymentEvent) {
  const amount = toAmount(event.amount);

  if (event.event_kind === "order_charge") {
    return amount;
  }

  return -amount;
}

export function formatRestaurantPaymentMethod(paymentMethod: string | null | undefined) {
  if (typeof paymentMethod !== "string") return null;

  const normalized = paymentMethod.trim();
  if (!normalized) return null;
  if (normalized.includes("****")) return normalized;

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => {
      const lowerPart = part.toLowerCase();

      if (/^\d+$/.test(part)) return part;
      if (["visa", "amex", "cb", "iban", "bic", "sepa"].includes(lowerPart)) return lowerPart.toUpperCase();
      return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}
