export type FinancialHealthRow = {
  id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  refund_status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type FinancialHealthSummary = {
  confirmedNotCaptured: number;
  refundPending: number;
  failedPayments: number;
  healthy: boolean;
  affectedIds: string[];
};

const SETTLED_PAYMENT_STATUSES = new Set(["captured", "paid"]);
const CONFIRMED_OPERATION_STATUSES = new Set([
  "confirmed",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "arrived",
  "completed",
]);

function normalize(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function readMetadataString(metadata: FinancialHealthRow["metadata"], key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  return normalize(String(metadata[key] || ""));
}

function normalizePaymentMethod(value: string) {
  return value.replace(/[\s-]+/g, "_");
}

function stableId(row: FinancialHealthRow, index: number) {
  return row.id || `row-${index + 1}`;
}

export function summarizeFinancialHealth(rows: FinancialHealthRow[]): FinancialHealthSummary {
  const affectedIds = new Set<string>();
  let confirmedNotCaptured = 0;
  let refundPending = 0;
  let failedPayments = 0;

  rows.forEach((row, index) => {
    const id = stableId(row, index);
    const status = normalize(row.status);
    const paymentStatus = normalize(row.payment_status);
    const refundStatus = normalize(row.refund_status);
    const paymentMethod = normalizePaymentMethod(readMetadataString(row.metadata, "payment_method"));
    const cashPaymentMethods = ["cash", normalizePaymentMethod(normalize("espèces")), "cash_on_delivery", "on_site", "onsite"];
    const isCashOrder = cashPaymentMethods.includes(paymentMethod);

    if (CONFIRMED_OPERATION_STATUSES.has(status) && !SETTLED_PAYMENT_STATUSES.has(paymentStatus) && !isCashOrder) {
      confirmedNotCaptured += 1;
      affectedIds.add(id);
    }

    if (refundStatus === "pending") {
      refundPending += 1;
      affectedIds.add(id);
    }

    if (paymentStatus === "failed") {
      failedPayments += 1;
      affectedIds.add(id);
    }
  });

  return {
    confirmedNotCaptured,
    refundPending,
    failedPayments,
    healthy: confirmedNotCaptured === 0 && refundPending === 0 && failedPayments === 0,
    affectedIds: Array.from(affectedIds),
  };
}
