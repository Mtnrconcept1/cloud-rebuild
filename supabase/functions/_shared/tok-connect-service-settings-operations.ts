type Value = Record<string, unknown>;
const record = (value: unknown): value is Value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const time = { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" };
export const TOK_SERVICE_SETTINGS_FIELDS = {
  service: { type: "string", enum: ["lunch", "dinner"] },
  start_time: time, end_time: time, last_reservation_time: time,
  order_start_time: time, order_end_time: time,
  max_covers: { type: "integer", minimum: 1, maximum: 10000 },
  max_tables_per_slot: { type: "integer", minimum: 1, maximum: 1000 },
  slot_interval_minutes: { type: "integer", minimum: 5, maximum: 180 },
  min_party_size: { type: "integer", minimum: 1, maximum: 50 },
  max_party_size: { type: "integer", minimum: 1, maximum: 50 },
  confirmation_deadline_minutes: { type: "integer", minimum: 1, maximum: 240 },
  deposit_amount_chf: { type: "number", minimum: 0, maximum: 10000 },
  service_closed: { type: "boolean" }, orders_closed: { type: "boolean" },
  online_booking_enabled: { type: "boolean" }, online_ordering_enabled: { type: "boolean" },
  restaurant_confirmation_required: { type: "boolean" }, table_only_booking: { type: "boolean" },
  service_note: { type: "string", maxLength: 1000 },
  slot_capacity_windows: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", properties: { start_time: time, end_time: time, max_tables: { type: "integer", minimum: 1, maximum: 1000 } }, required: ["start_time", "end_time", "max_tables"], additionalProperties: false } },
};
export const TOK_NEW_SERVICE_REQUIRED_FIELDS = ["service", "start_time", "end_time", "last_reservation_time", "order_start_time", "order_end_time", "max_covers", "max_tables_per_slot", "slot_interval_minutes", "min_party_size", "max_party_size", "online_booking_enabled", "online_ordering_enabled", "service_closed", "orders_closed", "restaurant_confirmation_required", "slot_capacity_windows"];

/** Canonical persisted contract used by DashboardService, ReservationWidget and create-reservation.
 * Unlike restaurant_hours, this document directly controls real booking slots.
 * Preserve legacy weekday keys, unknown fields, and the other service verbatim.
 */
export function prepareTokServiceSettings(openingHours: unknown, args: Value, create: boolean): Value {
  if (openingHours != null && !record(openingHours)) throw new Error("tok_connect_service_legacy_format_requires_native_review");
  const opening = record(openingHours) ? openingHours : {};
  const existingServices = record(opening.service_settings) ? opening.service_settings : opening;
  const service = String(args.service);
  const existing = record(existingServices[service]) ? existingServices[service] as Value : null;
  if (create && existing) throw new Error("tok_connect_service_already_configured_use_update");
  if (!create && !existing) throw new Error("tok_connect_service_not_configured_use_create");
  const patch = Object.fromEntries(Object.keys(TOK_SERVICE_SETTINGS_FIELDS).filter((key) => key !== "service" && Object.hasOwn(args, key)).map((key) => [key, args[key]]));
  if (!Object.keys(patch).length) throw new Error("tok_connect_service_patch_required");
  const next: Value = { ...(create ? { confirmation_deadline_minutes: 15, deposit_amount_chf: 0, table_only_booking: false, service_note: "" } : existing), ...patch };
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const key of ["start_time", "end_time", "last_reservation_time", "order_start_time", "order_end_time"]) if (!hhmm.test(String(next[key]))) throw new Error("tok_connect_service_time_invalid");
  if (String(next.start_time) >= String(next.end_time) || String(next.order_start_time) >= String(next.order_end_time) || String(next.last_reservation_time) < String(next.start_time) || String(next.last_reservation_time) > String(next.end_time)) throw new Error("tok_connect_service_time_range_invalid");
  if (Number(next.min_party_size) > Number(next.max_party_size)) throw new Error("tok_connect_service_party_range_invalid");
  if (!Array.isArray(next.slot_capacity_windows) || !next.slot_capacity_windows.length || next.slot_capacity_windows.length > 24) throw new Error("tok_connect_service_windows_required");
  const windows = next.slot_capacity_windows as unknown[];
  let previousEnd: string | null = null;
  for (const entry of windows) {
    if (!record(entry) || Object.keys(entry).some((key) => !["start_time", "end_time", "max_tables"].includes(key)) || !hhmm.test(String(entry.start_time)) || !hhmm.test(String(entry.end_time)) || !Number.isInteger(entry.max_tables) || Number(entry.max_tables) < 1 || Number(entry.max_tables) > 1000) throw new Error("tok_connect_service_window_invalid");
    if (String(entry.start_time) > String(entry.end_time) || String(entry.start_time) < String(next.start_time) || String(entry.end_time) > String(next.last_reservation_time) || (previousEnd && String(entry.start_time) < previousEnd)) throw new Error("tok_connect_service_windows_outside_or_overlapping");
    previousEnd = String(entry.end_time);
  }
  // Legacy lunch/dinner root keys are supported by native readers. Copy only the
  // service members into the canonical envelope, retaining every unrelated key.
  const services: Value = record(opening.service_settings) ? { ...opening.service_settings } : Object.fromEntries(["lunch", "dinner"].filter((key) => record(opening[key])).map((key) => [key, opening[key]]));
  return { ...opening, service_settings: { ...services, [service]: next } };
}
