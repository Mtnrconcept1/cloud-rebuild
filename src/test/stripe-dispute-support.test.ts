import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripeDisputeSupportId, stripeDisputeSupportRow } from "../../supabase/functions/_shared/stripe-dispute-support";

const webhook = readFileSync(resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"), "utf8");

describe("Stripe disputes → TOK support", () => {
  it("derives a stable, distinct UUIDv8 per dispute without storing PII", async () => {
    const first = await stripeDisputeSupportId("dp_abcdef123");
    expect(first).toBe(await stripeDisputeSupportId("dp_abcdef123"));
    expect(first).not.toBe(await stripeDisputeSupportId("dp_abcdef124"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await expect(stripeDisputeSupportId("not-a-dispute")).rejects.toThrow("INVALID_STRIPE_DISPUTE_ID");
  });

  it("creates an urgent support case but never authorizes financial action", () => {
    const row = stripeDisputeSupportRow({
      id: "11111111-2222-8333-8444-555555555555",
      orderId: "order-1",
      userId: "customer-1",
      restaurantId: "restaurant-1",
      disputeId: "dp_abcdef123",
      paymentIntentId: "pi_abcdef123",
      stripeEventId: "evt_abcdef123",
      stripeStatus: "needs_response",
      stripeReason: "fraudulent",
      amountCents: 1000,
      currency: "chf",
    });
    expect(row).toMatchObject({
      category: "payment_issue",
      priority: "urgent",
      status: "waiting_admin",
      order_id: "order-1",
      restaurant_id: "restaurant-1",
      metadata: { financial_action_authorized: false, currency: "CHF" },
    });
  });

  it("only creates cases for live webhook events with a verified order link and ignores duplicate IDs", () => {
    expect(webhook).toContain("if (!input.event.livemode) return;");
    expect(webhook).toContain('.eq("stripe_payment_intent_id", input.paymentIntentId)');
    expect(webhook).toContain('.from("orders")');
    expect(webhook).toContain("stripeDisputeSupportId(input.dispute.id)");
    expect(webhook).toContain('onConflict: "id", ignoreDuplicates: true');
    expect(webhook).toContain("DISPUTE_SUPPORT_INSERT_FAILED");
    expect(webhook).toContain("await recordStripeDisputeSupport({");
    expect(webhook).toContain("record_marketplace_dispute_ledger");
  });
});
