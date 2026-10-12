import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ functions: { invoke: mocks.invoke } }),
}));

import {
  createReservationWithValidation,
  finalizeReservationGuaranteeSession,
  getReservationGuaranteeQuote,
} from "@/lib/reservationMutations";

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("reservation card guarantee", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("does not require a card for six guests and zero annual cancellations", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true, required: false, cancellation_count: 0, reason: "none", fee_amount_cents: 0,
    }, error: null });
    await expect(getReservationGuaranteeQuote(6)).resolves.toEqual({
      required: false, cancellationCount: 0, reason: "none", feeAmountCents: 0,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("create-reservation", {
      body: { action: "quote", party_size: 6 },
    });
  });

  it("requires a card at seven guests and records 10 CHF per person", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true, required: true, cancellation_count: 0,
      reason: "large_party", fee_amount_cents: 7000,
    }, error: null });
    await expect(getReservationGuaranteeQuote(7)).resolves.toMatchObject({
      required: true, reason: "large_party", feeAmountCents: 7000,
    });
  });

  it("requires a card at the fourth booking after three cancellations that year", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true, required: true, cancellation_count: 3,
      reason: "repeated_cancellations", fee_amount_cents: 2000,
    }, error: null });
    await expect(getReservationGuaranteeQuote(2)).resolves.toMatchObject({
      required: true, cancellationCount: 3, feeAmountCents: 2000,
    });
  });

  it("does not treat Stripe card setup as an already confirmed reservation", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true, requires_card_guarantee: true,
      checkout_url: "https://checkout.stripe.com/c/pay/cs_live_test",
      fee_amount_cents: 8000,
    }, error: null });
    const result = await createReservationWithValidation({
      restaurantId: "99999999-0000-4000-8000-000000000001",
      date: "2026-12-12",
      time: "19:00",
      partySize: 8,
      feature: "classique",
      metadata: {},
      guaranteeAccepted: true,
    });
    expect(result).toEqual({
      ok: true,
      requiresCardGuarantee: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_test",
      feeAmountCents: 8000,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("create-reservation", expect.objectContaining({
      body: expect.objectContaining({ guarantee_accepted: true }),
    }));
  });

  it("confirms only after a server-side Stripe SetupIntent check", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: {
      ok: true, reservation_id: "99999999-0000-4000-8000-000000000100",
    }, error: null });
    await expect(finalizeReservationGuaranteeSession("cs_live_sample1")).resolves.toMatchObject({
      ok: true, reservationId: "99999999-0000-4000-8000-000000000100",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("create-reservation", {
      body: { action: "finalize", checkout_session_id: "cs_live_sample1" },
    });
  });

  it("fails closed when the guarantee quote is unavailable", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("connection error"));
    await expect(getReservationGuaranteeQuote(7)).rejects.toThrow("connection error");
    await expect(getReservationGuaranteeQuote(0)).rejects.toThrow("Nombre de convives invalide");
  });
});

describe("server-side reservation card guarantee invariants", () => {
  const sql = source("supabase/migrations/20261012130000_reservation_card_guarantees.sql");
  const create = source("supabase/functions/create-reservation/index.ts");
  const finalize = source("supabase/functions/_shared/reservation-card-guarantee.ts");
  const webhook = source("supabase/functions/stripe-webhook/index.ts");
  const dialog = source("src/components/ReservationDialog.tsx");

  it("uses the Switzerland calendar year, excluding restaurant cancellations", () => {
    expect(sql).toContain("p_party_size > 6 OR v_count >= 3");
    expect(sql).toContain("now() AT TIME ZONE 'Europe/Zurich'");
    expect(sql).toContain("r.cancelled_by = 'customer'");
    expect(sql).toContain("r.cancelled_at >= v_start");
    expect(sql).toContain("r.cancelled_at < v_end");
  });

  it("guards every free table booking server-side against unsigned cards", () => {
    expect(sql).toContain("BEFORE INSERT ON public.reservations");
    expect(sql).toContain("RAISE EXCEPTION 'card_guarantee_required'");
    expect(sql).toContain("current_setting('tok.reservation_card_setup_id', true)");
    expect(sql).toContain("s.stripe_setup_intent_id IS NOT NULL");
    expect(sql).toContain("s.stripe_payment_method_id IS NOT NULL");
  });

  it("never charges or exposes raw card data at reservation time", () => {
    expect(create).toContain('mode: "setup"');
    expect(create).toContain('payment_method_types: ["card"]');
    expect(create).toContain("guarantee_accepted");
    expect(create).not.toContain("paymentIntents.create");
    expect(finalize).toContain('setupIntent.status !== "succeeded"');
    expect(finalize).toContain('paymentMethod.type !== "card"');
  });

  it("creates at most one fee for customer cancellation and never for old reservations", () => {
    expect(sql).toContain("reservation_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("NEW.cancelled_by IS DISTINCT FROM 'customer'");
    expect(sql).toContain("s.reservation_id = NEW.id AND s.status = 'confirmed'");
    expect(sql).toContain("ON CONFLICT (reservation_id) DO NOTHING");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.reservation_cancellation_fees");
  });

  it("performs idempotent webhook and return-url finalization", () => {
    expect(webhook).toContain('checkoutKind === "reservation-card-guarantee"');
    expect(webhook).toContain("finalizeReservationCardGuarantee");
    expect(sql).toContain("WHERE id = p_setup_id FOR UPDATE");
    expect(sql).toContain("newly_confirmed := false");
  });

  it("requires explicit consent and shows the CHF total before continuing", () => {
    expect(dialog).toContain("guaranteeQuote.required && guaranteeAccepted");
    expect(dialog).toContain("10 CHF par convive");
    expect(dialog).toContain("card");
    expect(dialog).toContain("isGuaranteeQuoteLoading");
  });
});
