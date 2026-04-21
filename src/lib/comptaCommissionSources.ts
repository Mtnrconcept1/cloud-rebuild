export type CommissionSource =
  | "orders"
  | "zero_attente"
  | "chefs_table"
  | "flash_sales"
  | "anti_gaspi";

export const COMMISSION_SOURCE_ORDER: readonly CommissionSource[] = [
  "orders",
  "zero_attente",
  "chefs_table",
  "flash_sales",
  "anti_gaspi",
];

export const COMMISSION_SOURCE_LABELS: Record<CommissionSource, string> = {
  orders: "Commandes",
  zero_attente: "Zero Attente",
  chefs_table: "Chef's Table",
  flash_sales: "Ventes flash",
  anti_gaspi: "Anti-gaspi",
};

type OrderLike = {
  payment_status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ReservationLike = {
  feature?: string | null;
  metadata?: Record<string, unknown> | null;
  total_amount?: number | string | null;
  status?: string | null;
};

export type CommissionBaseTotals = Record<CommissionSource, number>;

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function isPaidStatus(status: unknown) {
  const normalizedStatus = normalize(status);
  return normalizedStatus === "paid" || normalizedStatus === "captured";
}

function isReservationEligible(status: unknown, totalAmount: unknown) {
  const normalizedStatus = normalize(status);
  if (normalizedStatus === "pending" || normalizedStatus === "cancelled" || normalizedStatus === "no-show") {
    return false;
  }

  const amount = Number(totalAmount);
  return Number.isFinite(amount) && amount > 0;
}

export function createEmptyCommissionBaseTotals(): CommissionBaseTotals {
  return {
    orders: 0,
    zero_attente: 0,
    chefs_table: 0,
    flash_sales: 0,
    anti_gaspi: 0,
  };
}

export function classifyOrderCommissionSource(order: OrderLike): CommissionSource | null {
  if (!isPaidStatus(order.payment_status)) {
    return null;
  }

  const metadata = getRecord(order.metadata);
  const feature = normalize(metadata.feature);
  const type = normalize(metadata.type);
  const hasFlashSale = Boolean(metadata.has_flash_sale || metadata.is_flash_sale || metadata.flash_sale_id);
  const hasAntiGaspi = Boolean(metadata.has_anti_gaspi || metadata.anti_gaspi_id);
  const hasChefsTable = Boolean(metadata.is_chefs_table || metadata.chefs_table_id);

  if (feature === "ventes-flash" || feature === "flash-sale" || hasFlashSale) {
    return "flash_sales";
  }

  if (feature === "anti-gaspi" || feature === "zero-gaspi" || hasAntiGaspi) {
    return "anti_gaspi";
  }

  if (feature === "chefs-table" || feature === "table-chef" || hasChefsTable) {
    return "chefs_table";
  }

  if (feature === "zero-attente") {
    return "zero_attente";
  }

  if (type === "delivery" || type === "takeaway" || type === "pickup" || type === "" || type === "dine-in") {
    return "orders";
  }

  return "orders";
}

export function classifyReservationCommissionSource(reservation: ReservationLike): CommissionSource | null {
  if (!isReservationEligible(reservation.status, reservation.total_amount)) {
    return null;
  }

  const metadata = getRecord(reservation.metadata);
  const feature = normalize(reservation.feature || metadata.feature);

  if (feature === "zero-attente") {
    return "zero_attente";
  }

  if (feature === "chefs-table" || feature === "table-chef") {
    return "chefs_table";
  }

  if (feature === "ventes-flash" || feature === "flash-sale") {
    return "flash_sales";
  }

  if (feature === "anti-gaspi" || feature === "zero-gaspi") {
    return "anti_gaspi";
  }

  return null;
}
