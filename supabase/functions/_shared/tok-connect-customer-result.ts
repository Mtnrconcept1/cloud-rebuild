type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Preserve the native result. Extra fields only drive the existing widget. */
export function projectTokCustomerResult(name: string, args: JsonRecord, payload: JsonRecord): JsonRecord {
  if (payload.ok !== true) return payload;
  const data = record(payload.data) ? payload.data : {};
  if (name === "tok_book_table" && data.requires_card_guarantee === true
    && typeof data.checkout_url === "string" && /^https:\/\/checkout\.stripe\.com\//.test(data.checkout_url)) {
    return { ...payload, booking_guarantee: { checkout_url: data.checkout_url,
      fee_amount_cents: data.fee_amount_cents, context: { restaurant_id: args.restaurant_id,
        date: args.date, time: args.time, party_size: args.party_size } } };
  }
  if (name === "tok_book_table" && typeof data.reservation_id === "string" && typeof data.status === "string") {
    return { ...payload, booking_result: {
      reservation_id: data.reservation_id, status: data.status,
      restaurant_id: data.restaurant_id || args.restaurant_id,
      restaurant_name: data.restaurant_name,
      date: data.date || args.date, time: data.time || args.time,
      party_size: data.party_size ?? args.party_size, timezone: "Europe/Zurich",
    } };
  }
  if (["tok_list_customer_special_offers", "tok_quote_customer_cart", "tok_checkout_customer_cart", "tok_customer_payment_status", "tok_cancel_cart_payment_attempt"].includes(name)) {
    return { ...payload, commerce_result: {
      ...payload,
      context: ["tok_quote_customer_cart", "tok_checkout_customer_cart"].includes(name)
        ? { restaurant_id: args.restaurant_id, journey: args.journey,
          delivery_address: args.delivery_address,
          date: args.date, time: args.time, party_size: args.party_size,
          items: args.items, payment_method: args.payment_method }
        : { payment_attempt_id: args.payment_attempt_id },
    } };
  }
  return payload;
}
