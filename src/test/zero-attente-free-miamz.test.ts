import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCompletedNoCostZeroAttenteSession } from "../../supabase/functions/_shared/zero-cost-checkout";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const completed = {
  mode: "payment",
  status: "complete",
  payment_status: "no_payment_required",
  amount_total: 0,
  metadata: {
    checkout_kind: "zero-attente",
    finance_routing_mode: "no_cost",
    authoritative_total_cents: "0",
    payment_attempt_version: "2",
  },
};

describe("Zéro Attente fully covered by MIAMZ", () => {
  it("accepts only completed, server-priced no-payment-required sessions", () => {
    expect(isCompletedNoCostZeroAttenteSession(completed)).toBe(true);
    expect(isCompletedNoCostZeroAttenteSession(null)).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, status: "open" })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, amount_total: 1 })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, payment_status: "unpaid" })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, metadata: { ...completed.metadata, checkout_kind: "order" } })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, metadata: { ...completed.metadata, finance_routing_mode: "legacy_manual" } })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, metadata: { ...completed.metadata, authoritative_total_cents: "1" } })).toBe(false);
    expect(isCompletedNoCostZeroAttenteSession({ ...completed, metadata: { ...completed.metadata, payment_attempt_version: "1" } })).toBe(false);
  });

  it("preserves Stripe Connect safeguards for every positive payment", () => {
    const finance = read("supabase/functions/_shared/marketplace-finance.ts");
    expect(finance).toContain('checkoutKind === "zero-attente" && distribution.grossCents === 0');
    expect(finance).toContain("MARKETPLACE_CONNECT_ROUTING_NOT_READY");
    expect(finance.indexOf("distribution.grossCents === 0")).toBeLessThan(finance.indexOf("MARKETPLACE_CONNECT_ROUTING_NOT_READY"));
  });

  it("debits loyalty points and confirms the capacity hold in one transaction", () => {
    const sql = read("supabase/migrations/20261012090000_finalize_zero_attente_no_cost_hold.sql");
    const finalizer = read("supabase/functions/_shared/zero-attente.ts");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("public.apply_reservation_loyalty_points(");
    expect(sql).toContain("status = 'confirmed'");
    expect(sql.indexOf("public.apply_reservation_loyalty_points(")).toBeLessThan(sql.indexOf("status = 'confirmed'"));
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(finalizer).toContain("finalize_zero_attente_no_cost_hold");
    expect(finalizer).toContain("if (!noCostCheckout)");
  });

  it("never tries to create a PaymentIntent or a fake money movement at CHF 0", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const recovery = read("supabase/functions/create-zero-attente-reservation/index.ts");
    const status = read("supabase/functions/payment-attempt-status/index.ts");
    expect(checkout).toContain('sessionParams.payment_method_collection = "if_required"');
    expect(checkout).toContain('!(effectiveKind === "zero-attente" && finalCheckoutTotalCents === 0)');
    expect(checkout).toContain("Math.round(pointsDiscountTotal * 100)");
    expect(webhook).toContain("isCompletedNoCostZeroAttenteSession(session)");
    expect(recovery).toContain("isCompletedNoCostZeroAttenteSession(session)");
    expect(status).toContain("isCompletedNoCostZeroAttenteSession(session)");
  });
});
