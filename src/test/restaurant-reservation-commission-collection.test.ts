import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schema = read("supabase/migrations/20261014010000_recurring_restaurant_reservation_commissions.sql");
const worker = read("supabase/functions/stripe-worker/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const auth = read("src/pages/Auth.tsx");
const contract = read("src/lib/restaurantPartnerContract.ts");

describe("restaurant commission consent, collection and accounting", () => {
  it("collects explicit separate consent before creating a signed onboarding dossier", () => {
    expect(auth).toContain('id="commission-mandate-consent"');
    expect(auth).toContain("commissionConsentDraft");
    expect(auth).toContain("commission_auto_debit_consent_version");
    expect(auth).toContain("commission_auto_debit_consent_accepted_at");
    expect(auth).toContain('submittedRole === "restaurateur" && !commissionConsentDraft');
    expect(contract).toContain("TOK-CH-RP-2026-10-v8");
    expect(contract).toContain("débits hors session");
  });

  it("defaults to disabled and requires a newer, signed consent receipt", () => {
    expect(schema).toContain("reservation_commission_auto_debit_enabled");
    expect(schema).toContain("commission_auto_debit_consent_version");
    expect(schema).toContain("commission_auto_debit_consent_accepted_at");
    expect(schema).toContain("COALESCE(");
    expect(schema).toContain("false");
    expect(schema).not.toMatch(/UPDATE public\.finance_runtime_config[\s\S]*reservation_commission_auto_debit_enabled/);
    expect(schema).toContain("sub.status='active'");
    expect(schema).toContain("pm.stripe_mode=sub.stripe_mode");
  });

  it("never authorizes a future booking or charges no-shows", () => {
    expect(schema).toContain("AFTER UPDATE OF status ON public.reservations");
    expect(schema).toContain("public.is_flat_arrival_billing_candidate");
    expect(schema).toContain("public.restaurant_subscription_genuine_client");
    expect(schema).toContain("NEW.honored_at IS NULL");
    expect(schema).toContain("NEW.metadata ? 'auto_arrived_at'");
    expect(schema).toContain("review_required");
    expect(schema).toContain("confirm_auto_arrived_reservation_commission");
    expect(worker).not.toContain("capture_method: \"manual\"");
  });

  it("stores exactly one CHF 5 charge and one invoice with VAT", () => {
    expect(schema).toContain("flat_fee_charge_id uuid NOT NULL UNIQUE");
    expect(schema).toContain("reservation_id uuid NOT NULL UNIQUE");
    expect(schema).toContain("CHECK (amount_cents = 500)");
    expect(schema).toContain("v_vat_cents := round(500::numeric * v_vat_bps/(10000+v_vat_bps))");
    expect(schema).toContain("'reservation_fee','reservation_flat_fee_charges'");
    expect(schema).toContain("UPDATE public.reservation_flat_fee_charges SET invoice_id=");
    expect(schema).toContain("ON CONFLICT (reservation_id) DO NOTHING");
  });

  it("uses a bounded leased service-only worker and Stripe's idempotency key", () => {
    expect(schema).toContain("FOR UPDATE OF collection SKIP LOCKED");
    expect(schema).toContain("attempt_count<3");
    expect(schema).toContain("stripe_idempotency_expired_review");
    expect(schema).toContain("GRANT EXECUTE ON FUNCTION public.claim_restaurant_commission_collections(integer) TO service_role");
    expect(worker).toContain('paymentIntents.create({');
    expect(worker).toContain('tok_purpose: "reservation_commission"');
    expect(worker).toContain("tok-reservation-commission:");
    expect(worker).toContain("off_session: true");
    expect(worker).toContain("confirm: true");
    expect(worker).toContain("subscription.status !== \"active\"");
    expect(worker).not.toContain("stripe.transfers.create");
  });

  it("only marks an invoice settled on a verified successful Stripe charge", () => {
    expect(schema).toContain("p_stripe_status='succeeded'");
    expect(schema).toContain("SET status='paid',paid_at=COALESCE(paid_at,now())");
    expect(schema).toContain("commission_payment_conflict");
    expect(schema).toContain("stripe_commission_mode_mismatch");
    expect(webhook).toContain("RESERVATION_COMMISSION_PAYMENT_RECONCILE_FAILED");
    expect(webhook).toContain("RESERVATION_COMMISSION_FAILURE_RECONCILE_FAILED");
    expect(webhook).toContain("RESERVATION_COMMISSION_REFUND_RECONCILE_FAILED");
    expect(webhook).toContain("RESERVATION_COMMISSION_DISPUTE_RECONCILE_FAILED");
  });

  it("keeps accountant audit history and reverses recognized receipts without deleting entries", () => {
    expect(schema).toContain("reverse_restaurant_commission_payment");
    expect(schema).toContain("reversal_of=v_entry.entry_id");
    expect(schema).toContain("NOT EXISTS(SELECT 1 FROM public.financial_ledger existing");
    expect(schema).toContain("ALTER TABLE public.reservation_commission_collections ENABLE ROW LEVEL SECURITY");
    expect(schema).toContain("REVOKE ALL ON public.reservation_commission_collections FROM PUBLIC, anon, authenticated");
    expect(schema).toContain("GRANT SELECT ON public.reservation_commission_collections TO authenticated");
  });
});
