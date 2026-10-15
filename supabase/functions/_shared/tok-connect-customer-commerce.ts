/**
 * Customer-only MCP commerce input contract.
 *
 * Client data may choose a menu item, quantity and service slot, but never
 * supplies an authoritative price, discount, delivery fee or payment status.
 * TOK's existing pricing and checkout services remain authoritative.
 */
export type TokCustomerJourney = "takeaway" | "zero-attente";
export type TokCustomerCartItem = { menu_item_id: string; quantity: number };
export type TokCustomerCartInput = {
  restaurant_id: string;
  journey: TokCustomerJourney;
  items: TokCustomerCartItem[];
  date: string;
  time: string;
  party_size: number;
  payment_method: "card" | "twint";
  notes: string | null;
  expected_total_cents: number | null;
  payment_attempt_id: string | null;
  idempotency_key: string | null;
  confirmed_by_user: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_ATTEMPT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TokCustomerCommerceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "TokCustomerCommerceError";
  }
}

function invalid(message: string): never {
  throw new TokCustomerCommerceError(400, message);
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function zurichDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const find = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return find("year") + "-" + find("month") + "-" + find("day");
}

export function normalizeTokCustomerCart(
  value: unknown,
  options: { checkout?: boolean; now?: Date } = {},
): TokCustomerCartInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("tok_cart_invalid");
  const data = value as Record<string, unknown>;
  const restaurantId = typeof data.restaurant_id === "string" ? data.restaurant_id.trim() : "";
  if (!UUID.test(restaurantId)) invalid("tok_cart_restaurant_id_invalid");

  const journey = data.journey;
  if (journey !== "takeaway" && journey !== "zero-attente") invalid("tok_cart_journey_invalid");
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 24) {
    invalid("tok_cart_item_count_invalid");
  }
  const seen = new Set<string>();
  const items: TokCustomerCartItem[] = [];
  let quantityTotal = 0;
  for (const candidate of data.items as unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) invalid("tok_cart_item_invalid");
    const item = candidate as Record<string, unknown>;
    const id = typeof item.menu_item_id === "string" ? item.menu_item_id.trim() : "";
    const quantity = item.quantity;
    if (!UUID.test(id) || seen.has(id) || typeof quantity !== "number"
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      invalid("tok_cart_item_invalid");
    }
    seen.add(id);
    quantityTotal += quantity;
    items.push({ menu_item_id: id, quantity });
  }
  if (quantityTotal > 50) invalid("tok_cart_quantity_limit");

  const date = typeof data.date === "string" ? data.date.trim() : "";
  const time = typeof data.time === "string" ? data.time.trim() : "";
  if (!validCalendarDate(date) || !LOCAL_TIME.test(time)) invalid("tok_cart_slot_invalid");
  const today = zurichDate(options.now);
  const futureLimit = new Date(today + "T12:00:00Z");
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 31);
  if (date < today || date > futureLimit.toISOString().slice(0, 10)) {
    invalid("tok_cart_date_out_of_range");
  }

  const partySize = journey === "zero-attente" ? data.party_size : 1;
  if (typeof partySize !== "number" || !Number.isInteger(partySize)
    || partySize < 1 || partySize > 20) invalid("tok_cart_party_size_invalid");

  const paymentMethod = data.payment_method ?? "card";
  if (paymentMethod !== "card" && paymentMethod !== "twint") invalid("tok_cart_payment_method_invalid");

  const notes = data.notes == null ? null : data.notes;
  if (notes !== null && (typeof notes !== "string" || notes.length > 500)) {
    invalid("tok_cart_notes_invalid");
  }

  const checkout = options.checkout === true;
  let expectedTotalCents: number | null = null;
  let attemptId: string | null = null;
  let key: string | null = null;
  if (checkout) {
    if (data.confirmed_by_user !== true) {
      throw new TokCustomerCommerceError(409, "tok_cart_explicit_confirmation_required");
    }
    if (typeof data.expected_total_cents !== "number"
      || !Number.isSafeInteger(data.expected_total_cents)
      || data.expected_total_cents < 0 || data.expected_total_cents > 1_000_000) {
      invalid("tok_cart_authorized_total_invalid");
    }
    attemptId = typeof data.payment_attempt_id === "string"
      ? data.payment_attempt_id.toLowerCase() : "";
    if (!PAYMENT_ATTEMPT_UUID.test(attemptId)) invalid("tok_cart_payment_attempt_invalid");
    key = typeof data.idempotency_key === "string" ? data.idempotency_key : "";
    if (key !== "tok-cart:" + attemptId) invalid("tok_cart_idempotency_key_invalid");
    expectedTotalCents = data.expected_total_cents;
  }
  return {
    restaurant_id: restaurantId, journey, items, date, time,
    party_size: partySize as number,
    payment_method: paymentMethod,
    notes: notes as string | null,
    expected_total_cents: expectedTotalCents,
    payment_attempt_id: attemptId, idempotency_key: key,
    confirmed_by_user: checkout,
  };
}

export function assertTokCartAmountUnchanged(quotedCents: number, expectedCents: number) {
  if (quotedCents !== expectedCents) {
    throw new TokCustomerCommerceError(409, "tok_cart_price_changed_refresh_quote");
  }
}

export function safeTokCommerceCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}
