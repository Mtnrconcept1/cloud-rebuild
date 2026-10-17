import { TokDiscoveryError, type TokDiscoveryDetail } from "./tok-connect-discovery.ts";

// Preparation is read-only. Creation still goes through the authenticated native
// reservation service, which rechecks capacity, guarantee and ownership.
export const TOK_CUSTOMER_RESERVATION_INPUT_SCHEMA = {
  type: "object",
  required: ["restaurant_id", "date", "party_size"],
  properties: {
    restaurant_id: { type: "string", format: "uuid" },
    date: { type: "string", format: "date", description: "Date locale du restaurant, YYYY-MM-DD." },
    time: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", description: "Heure locale HH:mm. Omettre si le client ne l'a pas précisée ; proposer alors les créneaux." },
    party_size: { type: "integer", minimum: 1, maximum: 20 },
    timezone: { type: "string", enum: ["Europe/Zurich"], default: "Europe/Zurich" },
  },
  additionalProperties: false,
};

export function validateTokReservationIntent(args: Record<string, unknown>) {
  const restaurantId = String(args.restaurant_id || "");
  const date = String(args.date || "");
  const time = args.time == null ? null : String(args.time);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)) {
    throw new TokDiscoveryError(400, "invalid_restaurant_id");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) throw new TokDiscoveryError(400, "invalid_date");
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new TokDiscoveryError(400, "invalid_time");
  if (!Number.isInteger(args.party_size) || Number(args.party_size) < 1 || Number(args.party_size) > 20) {
    throw new TokDiscoveryError(400, "invalid_party_size");
  }
  if (args.timezone != null && args.timezone !== "Europe/Zurich") throw new TokDiscoveryError(400, "unsupported_restaurant_timezone");
  return { restaurant_id: restaurantId, date, time, party_size: Number(args.party_size), timezone: "Europe/Zurich" };
}

export function buildTokReservationPreparation(detail: TokDiscoveryDetail, args: Record<string, unknown>) {
  const intent = validateTokReservationIntent(args);
  if (detail.id !== intent.restaurant_id) throw new TokDiscoveryError(400, "restaurant_mismatch");
  const available = detail.supports_reservation === true && detail.availability.date === intent.date
    && intent.time !== null && detail.availability.slots.some((slot) => slot.time === intent.time && slot.available);
  return {
    detail,
    date: intent.date,
    party_size: intent.party_size,
    booking_intent: {
      ...intent,
      available,
      ready_to_book: available,
      mutation_executed: false,
      next_action: !intent.time ? "ask_time_or_offer_slots" : available ? "quote_guarantee_then_book_on_explicit_user_request" : "offer_available_slots",
      availability_is_advisory: true,
    },
  };
}
