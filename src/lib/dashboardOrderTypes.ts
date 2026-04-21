export type DashboardOrderType = "classic" | "anti_gaspi" | "flash_sales";

type DashboardOrderLike = {
  metadata?: Record<string, unknown> | null;
};

type DashboardOrderTypeMeta = {
  label: string;
  badgeLabel: string | null;
  badgeClassName: string;
  cardClassName: string;
  summaryCardClassName: string;
  summaryTextClassName: string;
};

type DashboardOrderTypeSummaryEntry = {
  count: number;
  revenue: number;
};

export type DashboardOrderTypeSummary = Record<DashboardOrderType, DashboardOrderTypeSummaryEntry>;

export const DASHBOARD_ORDER_TYPE_ORDER: readonly DashboardOrderType[] = [
  "classic",
  "anti_gaspi",
  "flash_sales",
];

const DASHBOARD_ORDER_TYPE_META: Record<DashboardOrderType, DashboardOrderTypeMeta> = {
  classic: {
    label: "Classiques",
    badgeLabel: null,
    badgeClassName: "",
    cardClassName: "",
    summaryCardClassName: "border-border/60 bg-muted/20",
    summaryTextClassName: "text-muted-foreground",
  },
  anti_gaspi: {
    label: "Anti-gaspi",
    badgeLabel: "Anti-gaspi",
    badgeClassName: "border-emerald-200 bg-emerald-100 text-emerald-800",
    cardClassName: "border-emerald-200 bg-emerald-50/40",
    summaryCardClassName: "border-emerald-200 bg-emerald-50/80",
    summaryTextClassName: "text-emerald-700",
  },
  flash_sales: {
    label: "Ventes flash",
    badgeLabel: "Vente flash",
    badgeClassName: "border-amber-200 bg-amber-100 text-amber-800",
    cardClassName: "border-amber-200 bg-amber-50/40",
    summaryCardClassName: "border-amber-200 bg-amber-50/90",
    summaryTextClassName: "text-amber-700",
  },
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function toAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createEmptyDashboardOrderTypeSummary(): DashboardOrderTypeSummary {
  return {
    classic: { count: 0, revenue: 0 },
    anti_gaspi: { count: 0, revenue: 0 },
    flash_sales: { count: 0, revenue: 0 },
  };
}

export function classifyDashboardOrderType(order: DashboardOrderLike): DashboardOrderType {
  const metadata = getRecord(order.metadata);
  const feature = normalize(metadata.feature);

  const hasAntiGaspi = Boolean(
    metadata.has_anti_gaspi
      || metadata.is_anti_waste
      || metadata.anti_gaspi_id
      || metadata.anti_waste_offer_id,
  );
  const hasFlashSale = Boolean(
    metadata.has_flash_sale
      || metadata.is_flash_sale
      || metadata.flash_sale_id,
  );

  if (
    hasAntiGaspi
    || feature === "anti-gaspi"
    || feature === "anti-waste"
    || feature === "zero-gaspi"
  ) {
    return "anti_gaspi";
  }

  if (
    hasFlashSale
    || feature === "ventes-flash"
    || feature === "ventes-flash"
    || feature === "flash-sale"
  ) {
    return "flash_sales";
  }

  return "classic";
}

export function getDashboardOrderTypeMeta(type: DashboardOrderType) {
  return DASHBOARD_ORDER_TYPE_META[type];
}

export function summarizeDashboardOrdersByType<T extends DashboardOrderLike>(
  orders: readonly T[],
  getAmount: (order: T) => unknown,
) {
  return orders.reduce<DashboardOrderTypeSummary>((summary, order) => {
    const type = classifyDashboardOrderType(order);
    summary[type] = {
      count: summary[type].count + 1,
      revenue: summary[type].revenue + toAmount(getAmount(order)),
    };
    return summary;
  }, createEmptyDashboardOrderTypeSummary());
}
