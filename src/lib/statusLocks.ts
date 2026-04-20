type StatusLockEntity = {
  status?: unknown;
  total_amount?: unknown;
  feature?: unknown;
  payment_status?: unknown;
  metadata?: unknown;
};

export type ReservationStatusLockReason = "cancelled" | "paid_special" | null;
export type OrderStatusLockReason = "paid_special" | null;

const TRUE_LIKE_VALUES = new Set(["1", "true", "yes", "oui"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readBooleanish(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return TRUE_LIKE_VALUES.has(value.trim().toLowerCase());
  return false;
}

function readNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMetadata(value: unknown) {
  return isRecord(value) ? value : {};
}

export function isPaidSpecialReservationStatusLocked(entity: StatusLockEntity) {
  const feature = readString(entity.feature).toLowerCase();
  if (feature !== "zero-attente" && feature !== "chefs_table") {
    return false;
  }

  const metadata = getMetadata(entity.metadata);
  const status = readString(entity.status).toLowerCase();

  if (readBooleanish(metadata.paid)) {
    return true;
  }

  return readNumber(entity.total_amount) > 0 && status !== "pending" && status !== "pending_payment";
}

export function getReservationStatusLockReason(entity: StatusLockEntity): ReservationStatusLockReason {
  if (readString(entity.status).toLowerCase() === "cancelled") {
    return "cancelled";
  }

  if (isPaidSpecialReservationStatusLocked(entity)) {
    return "paid_special";
  }

  return null;
}

export function isReservationStatusLocked(entity: StatusLockEntity) {
  return getReservationStatusLockReason(entity) !== null;
}

export function isPaidSpecialOrderStatusLocked(entity: Pick<StatusLockEntity, "metadata" | "payment_status">) {
  const metadata = getMetadata(entity.metadata);
  const feature = readString(metadata.feature).toLowerCase();
  const hasAntiGaspi = readBooleanish(metadata.has_anti_gaspi)
    || readBooleanish(metadata.is_anti_waste)
    || feature === "anti-gaspi"
    || feature === "anti_waste"
    || feature === "zero-gaspi"
    || readString(metadata.anti_waste_offer_id) !== "";
  const hasFlashSale = readBooleanish(metadata.has_flash_sale)
    || readBooleanish(metadata.is_flash_sale)
    || feature === "ventes-flash"
    || feature === "ventes_flash"
    || feature === "flash_sale"
    || feature === "flash-sale"
    || readString(metadata.flash_sale_id) !== "";

  if (!hasAntiGaspi && !hasFlashSale) {
    return false;
  }

  const paymentStatus = readString(entity.payment_status || metadata.payment_status).toLowerCase();
  if (paymentStatus === "paid" || paymentStatus === "captured") {
    return true;
  }

  const paymentMethod = readString(metadata.payment_method).toLowerCase();
  const hasSecurePaymentEvidence = Boolean(
    readString(metadata.stripe_session_id)
      || readString(metadata.stripe_payment_intent)
      || readString(metadata.card_last4),
  );

  return paymentMethod !== "cash" && hasSecurePaymentEvidence;
}

export function getOrderStatusLockReason(entity: Pick<StatusLockEntity, "metadata" | "payment_status">): OrderStatusLockReason {
  return isPaidSpecialOrderStatusLocked(entity) ? "paid_special" : null;
}

export function getReservationStatusLockMessage(entity: StatusLockEntity) {
  const reason = getReservationStatusLockReason(entity);
  if (reason === "cancelled") {
    return "Statut verrouille apres annulation.";
  }

  if (reason === "paid_special") {
    return "Statut verrouille apres paiement pour cette reservation.";
  }

  return null;
}

export function getOrderStatusLockMessage(entity: Pick<StatusLockEntity, "metadata" | "payment_status">) {
  return getOrderStatusLockReason(entity)
    ? "Statut verrouille apres paiement pour cette commande speciale."
    : null;
}
