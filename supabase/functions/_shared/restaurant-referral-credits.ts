import type { authenticateRequest } from "./auth.ts";
import { findExistingCredit } from "./restaurant-referral-balance.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "./stripe-client.ts";

type AdminClient = Awaited<ReturnType<typeof authenticateRequest>>["adminClient"];

type ReferralRow = {
  id: string;
  status: string;
  eligible_at: string;
  first_paid_invoice_id: string | null;
  processing_started_at: string | null;
  credit_cents: number | null;
  credit_stripe_customer_id: string | null;
};

type ReferralClaim = {
  ready?: boolean;
  id?: string;
  customer_id?: string;
  credit_cents?: number;
};

type ReferralResult = {
  checked: number;
  credited: number;
  skipped: number;
  failed: number;
  failure_codes: string[];
};

function failureCode(error: unknown) {
  return (error instanceof Error ? error.message : "unknown_error")
    .split(":", 1)[0]
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 90);
}

export async function reconcileRestaurantReferralCredits(
  adminClient: AdminClient,
  maxCandidates = 20,
): Promise<ReferralResult> {
  const result: ReferralResult = {
    checked: 0,
    credited: 0,
    skipped: 0,
    failed: 0,
    failure_codes: [],
  };
  const { data, error } = await adminClient
    .from("restaurant_referrals")
    .select("id, status, eligible_at, first_paid_invoice_id, processing_started_at, credit_cents, credit_stripe_customer_id")
    .in("status", ["qualifying", "processing"])
    .lte("eligible_at", new Date().toISOString())
    .order("eligible_at", { ascending: true })
    .limit(Math.min(Math.max(maxCandidates, 1), 100));

  if (error) throw new Error("restaurant_referral_lookup_failed:" + error.message);
  const rows = (data || []) as ReferralRow[];
  const stripe = rows.length > 0
    ? getStripeRuntimeForCheckoutKindAndMode("restaurant-subscription", "live").stripe
    : null;

  for (const row of rows) {
    result.checked += 1;
    try {
      let customerId = row.credit_stripe_customer_id;
      let amountCents = row.credit_cents;

      if (row.status === "qualifying") {
        const { data: claimData, error: claimError } = await adminClient.rpc(
          "claim_restaurant_referral_credit",
          { p_referral_id: row.id },
        );
        if (claimError) throw new Error("restaurant_referral_claim_failed:" + claimError.message);
        const claim = (claimData || {}) as ReferralClaim;
        if (!claim.ready || claim.id !== row.id) {
          result.skipped += 1;
          continue;
        }
        customerId = claim.customer_id || null;
        amountCents = claim.credit_cents || null;
      } else if (!row.processing_started_at
        || new Date(row.processing_started_at).getTime() > Date.now() - 15 * 60 * 1000) {
        // Previous attempt is still within its processing lease.
        result.skipped += 1;
        continue;
      }

      if (!customerId || !Number.isInteger(amountCents) || !amountCents || amountCents <= 0) {
        throw new Error("invalid_referral_credit_claim");
      }

      if (!stripe) throw new Error("restaurant_referral_stripe_unavailable");
      // On a retry, inspect Stripe first. A lost response is not a new credit.
      let transaction = await findExistingCredit(
        (options) => stripe.customers.listBalanceTransactions(customerId, options),
        row.id,
        amountCents,
      );
      if (!transaction) {
        // Recheck reversals after claiming: a refund may arrive between claim
        // and the external Stripe call, especially on stale processing retries.
        if (!row.first_paid_invoice_id) throw new Error("missing_original_referral_invoice");
        const { data: reversals, error: reversalError } = await adminClient
          .from("restaurant_subscription_payment_events")
          .select("stripe_event_id")
          .eq("event_type", "payment_reversed")
          .eq("stripe_invoice_id", row.first_paid_invoice_id)
          .limit(1);
        if (reversalError) throw new Error("referral_reversal_lookup_failed");
        if (reversals?.length) {
          await adminClient.from("restaurant_referrals").update({
            status: "rejected", rejected_reason: "first_payment_reversed", updated_at: new Date().toISOString(),
          }).eq("id", row.id).eq("status", "processing");
          result.skipped += 1;
          continue;
        }
        transaction = await stripe.customers.createBalanceTransaction(
          customerId,
          {
            amount: -amountCents,
            currency: "chf",
            description: "TOK - un mois d'abonnement offert (parrainage)",
            metadata: { tok_restaurant_referral_id: row.id },
          },
          { idempotencyKey: "tok-restaurant-referral-" + row.id },
        );
      }
      if (transaction.amount !== -amountCents || transaction.currency !== "chf") {
        throw new Error("stripe_referral_credit_amount_mismatch");
      }

      const { data: updated, error: updateError } = await adminClient
        .from("restaurant_referrals")
        .update({
          status: "credited",
          stripe_balance_transaction_id: transaction.id,
          credited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "processing")
        .eq("credit_stripe_customer_id", customerId)
        .eq("credit_cents", amountCents)
        .select("id")
        .maybeSingle();
      if (updateError || !updated) {
        throw new Error("restaurant_referral_credit_record_failed:" + (updateError?.message || "not_updated"));
      }
      result.credited += 1;
    } catch (error) {
      result.failed += 1;
      const code = failureCode(error);
      if (!result.failure_codes.includes(code)) result.failure_codes.push(code);
      // Do not reset "processing": retries must first reconcile Stripe history.
      // Do not log customer IDs or referral owners.
    }
  }
  return result;
}
