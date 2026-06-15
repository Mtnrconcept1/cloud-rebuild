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
  zero_attente: "Zéro Attente",
  chefs_table: "La Table du Chef",
  flash_sales: "Ventes flash",
  anti_gaspi: "Anti-gaspi",
};

type OrderLike = {
  payment_status?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  total_amount?: number | string | null;
  refunded_amount_chf?: number | string | null;
};

type ReservationLike = {
  feature?: string | null;
  metadata?: Record<string, unknown> | null;
  total_amount?: number | string | null;
  refunded_amount_chf?: number | string | null;
  status?: string | null;
};

export type CommissionBaseTotals = Record<CommissionSource, number>;

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function toAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPaidStatus(status: unknown) {
  const normalizedStatus = normalize(status);
  return normalizedStatus === "paid" || normalizedStatus === "captured";
}

function isNonBillableOrderStatus(status: unknown) {
  const normalizedStatus = normalize(status);
  return normalizedStatus === "cancelled"
    || normalizedStatus === "canceled"
    || normalizedStatus === "payment-failed"
    || normalizedStatus === "refused"
    || normalizedStatus === "pending"
    || normalizedStatus === "pending-payment";
}

function isConfirmedCashOrder(order: OrderLike) {
  const metadata = getRecord(order.metadata);
  const paymentMethod = normalize(metadata.payment_method);
  const cashPaymentMethods = ["cash", normalize("espèces"), "cash-on-delivery", "on-site", "onsite"];

  return cashPaymentMethods.includes(paymentMethod)
    && Boolean(normalize(order.status))
    && !isNonBillableOrderStatus(order.status);
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

export function getPointsDiscountAmount(metadata: Record<string, unknown> | null | undefined) {
  const record = getRecord(metadata);
  return toAmount(record.points_discount_amount ?? record.points_discount);
}

export function getTokCoveredMiamzAmount(order: OrderLike) {
  if (!classifyOrderCommissionSource(order)) {
    return 0;
  }

  const pointsDiscount = getPointsDiscountAmount(order.metadata);
  if (pointsDiscount <= 0) {
    return 0;
  }

  const grossAmount = toAmount(order.total_amount) + pointsDiscount;
  const netAmount = getNetAmountAfterRefund(grossAmount, order.refunded_amount_chf);

  return Math.min(pointsDiscount, netAmount);
}

export function getNetAmountAfterRefund(
  grossAmount: number | string | null | undefined,
  refundedAmount: number | string | null | undefined,
) {
  return Math.max(0, toAmount(grossAmount) - toAmount(refundedAmount));
}

export function classifyOrderCommissionSource(order: OrderLike): CommissionSource | null {
  if (isNonBillableOrderStatus(order.status)) {
    return null;
  }

  if (!isPaidStatus(order.payment_status) && !isConfirmedCashOrder(order)) {
    return null;
  }

  const metadata = getRecord(order.metadata);
  const feature = normalize(metadata.feature);
  const type = normalize(metadata.type);
  const hasFlashSale = Boolean(metadata.has_flash_sale || metadata.is_flash_sale || metadata.flash_sale_id);
  const hasAntiGaspi = Boolean(
    metadata.has_anti_gaspi
    || metadata.is_anti_waste
    || metadata.anti_gaspi_id
    || metadata.anti_waste_offer_id,
  );
  const hasChefsTable = Boolean(metadata.is_chefs_table || metadata.chefs_table_id);

  if (feature === "ventes-flash" || feature === "flash-sale" || hasFlashSale) {
    return "flash_sales";
  }

  if (feature === "anti-gaspi" || feature === "anti-waste" || feature === "zero-gaspi" || hasAntiGaspi) {
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

export function getNetOrderCommissionBase(order: OrderLike) {
  if (!classifyOrderCommissionSource(order)) {
    return 0;
  }

  const grossAmount = toAmount(order.total_amount) + getPointsDiscountAmount(order.metadata);
  return getNetAmountAfterRefund(grossAmount, order.refunded_amount_chf);
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

  if (feature === "anti-gaspi" || feature === "anti-waste" || feature === "zero-gaspi") {
    return "anti_gaspi";
  }

  return null;
}

export function getNetReservationCommissionBase(reservation: ReservationLike) {
  if (!classifyReservationCommissionSource(reservation)) {
    return 0;
  }

  return getNetAmountAfterRefund(reservation.total_amount, reservation.refunded_amount_chf);
}
