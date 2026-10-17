/**
 * Keep the capacity slot and persisted order schedule identical for explicitly
 * scheduled pickup orders. The order-status trigger uses orders.scheduled_at;
 * leaving it NULL makes the trigger recheck orders.created_at instead.
 *
 * The caller must pass the server-validated capacity timestamp. Client-supplied
 * pickup_date/pickup_time are never converted into an authoritative timestamp
 * without matching that previously validated instant in Europe/Zurich.
 */
export function resolveVerifiedPickupScheduledAt(
  metadata: Record<string, unknown>,
  capacityRequestedAt: string,
): string | null {
  const dateValue = metadata.pickup_date;
  const timeValue = metadata.pickup_time;

  // Ordinary immediate takeaway remains unchanged.
  if (dateValue == null && timeValue == null) return null;

  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    || typeof timeValue !== "string"
    || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(timeValue)) {
    throw new Error("TOK_PICKUP_SLOT_INVALID");
  }

  const requested = new Date(capacityRequestedAt);
  if (Number.isNaN(requested.getTime())) throw new Error("TOK_PICKUP_CAPACITY_TIMESTAMP_INVALID");

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(requested);
  const part = (kind: string) => parts.find((entry) => entry.type === kind)?.value || "";
  const verifiedDate = `${part("year")}-${part("month")}-${part("day")}`;
  const verifiedTime = `${part("hour")}:${part("minute")}`;

  // Reject forged/mismatched scheduled_at or pickup_at metadata rather than
  // silently storing a different reservation slot from the one quoted.
  if (verifiedDate !== dateValue || verifiedTime !== timeValue.slice(0, 5)) {
    throw new Error("TOK_PICKUP_CAPACITY_SLOT_MISMATCH");
  }

  return requested.toISOString();
}
