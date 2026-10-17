import { describe, expect, it } from "vitest";
import { projectTokCustomerResult } from "../../supabase/functions/_shared/tok-connect-customer-result.ts";

describe("TOK customer tool result projection", () => {
  it("renders the exact native status and party size, without inventing confirmation", () => {
    const payload = { ok: true, data: { reservation_id: "booking", status: "pending" } };
    const projected = projectTokCustomerResult("tok_book_table", { restaurant_id: "restaurant", party_size: 7, date: "2026-10-18", time: "19:00" }, payload);
    expect(projected.booking_result).toMatchObject({ reservation_id: "booking", status: "pending", party_size: 7, time: "19:00" });
    expect(projected.data).toBe(payload.data);
    expect(projectTokCustomerResult("tok_book_table", {}, { ok: true, data: { reservation_id: "booking" } })).not.toHaveProperty("booking_result");
  });
  it("never converts a business error or a card guarantee into a booking", () => {
    for (const payload of [{ ok: false, data: { reservation_id: "booking", status: "pending" } }, { ok: true, data: { requires_card_guarantee: true, checkout_url: "https://checkout.stripe.com/c/pay/test" } }]) {
      expect(projectTokCustomerResult("tok_book_table", {}, payload)).not.toHaveProperty("booking_result");
    }
  });
  it("opens a pending bank guarantee summary without claiming an existing booking", () => {
    const result = projectTokCustomerResult("tok_book_table", { restaurant_id: "restaurant", party_size: 7 }, { ok: true, data: { requires_card_guarantee: true, checkout_url: "https://checkout.stripe.com/c/pay/test", fee_amount_cents: 7000 } });
    expect(result.booking_guarantee).toMatchObject({ fee_amount_cents: 7000, context: { party_size: 7 } });
    expect(result).not.toHaveProperty("booking_result");
    expect(projectTokCustomerResult("tok_book_table", {}, { ok: true, data: { requires_card_guarantee: true, checkout_url: "javascript:alert(1)" } })).not.toHaveProperty("booking_guarantee");
  });
  it("passes authoritative commerce results to the widget without claiming payment", () => {
    const payload = { ok: true, action: "checkout", payment_status: "pending", total_cents: 2800, payment_attempt_id: "attempt" };
    const projected = projectTokCustomerResult("tok_checkout_customer_cart", { restaurant_id: "restaurant", items: [{ menu_item_id: "item", quantity: 1 }] }, payload);
    expect(projected.commerce_result).toMatchObject({ total_cents: 2800, payment_status: "pending", context: { restaurant_id: "restaurant" } });
    expect(projected.commerce_result).not.toHaveProperty("paid");
  });
  it("does not inject guessed cart data into an independently checked payment", () => {
    const projected = projectTokCustomerResult("tok_customer_payment_status", { payment_attempt_id: "attempt" }, { ok: true, state: "indeterminate", paid: false });
    expect(projected.commerce_result).toMatchObject({ state: "indeterminate", paid: false, context: { payment_attempt_id: "attempt" } });
  });
});
