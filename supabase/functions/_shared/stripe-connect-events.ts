import type Stripe from "npm:stripe@22.3.2";
import { readRestaurantConnectAccount } from "./stripe-connect-account.ts";

/**
 * Stripe Accounts v2 delivers *thin* events, not v1 snapshot Events. Their
 * signed payload contains related_object rather than data.object or livemode.
 */
export function isStripeConnectV2AccountEvent(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const type = value.type;
  return typeof type === "string" && /^v2\.core\.account(?:\.|\[)/.test(type);
}

export function readStripeConnectV2EventAccountId(value: unknown): string {
  if (!isStripeConnectV2AccountEvent(value)) {
    throw new Error("STRIPE_CONNECT_UNEXPECTED_EVENT_TYPE");
  }
  const related = (value as { related_object?: { id?: unknown; type?: unknown } }).related_object;
  if (related?.type !== "v2.core.account" || typeof related.id !== "string"
    || !/^acct_[A-Za-z0-9]+$/.test(related.id)) {
    throw new Error("STRIPE_CONNECT_INVALID_RELATED_ACCOUNT");
  }
  return related.id;
}

type DatabaseLike = { from: (table: string) => any };

/**
 * Refresh the authoritative Stripe account state. Never trust a capability
 * embedded in a webhook body, a restaurant ID provided by metadata, or the
 * order in which notifications arrive.
 */
export async function syncStripeConnectV2AccountEvent(input: {
  stripe: Stripe;
  adminClient: DatabaseLike;
  accountId: string;
  now?: string;
}): Promise<"updated" | "unmatched"> {
  const { data: linked, error: linkError } = await input.adminClient
    .from("restaurants")
    .select("id, stripe_connect_onboarding_completed_at")
    .eq("stripe_account_id", input.accountId)
    .limit(2);
  if (linkError) throw new Error(`STRIPE_CONNECT_RESTAURANT_LOOKUP_FAILED:${linkError.message}`);
  if (!linked?.length) return "unmatched";
  if (linked.length !== 1) throw new Error("STRIPE_CONNECT_ACCOUNT_LINK_NOT_UNIQUE");

  const status = await readRestaurantConnectAccount(input.stripe, input.accountId);
  if (status.api !== "v2") throw new Error("STRIPE_CONNECT_EVENT_TARGET_NOT_V2");
  const now = input.now || new Date().toISOString();
  const { data: updated, error: updateError } = await input.adminClient
    .from("restaurants")
    .update({
      stripe_connect_details_submitted: status.detailsSubmitted,
      stripe_connect_charges_enabled: status.chargesEnabled,
      stripe_connect_payouts_enabled: status.payoutsEnabled,
      stripe_connect_requirements_due: status.requirementsDue,
      stripe_connect_disabled_reason: status.disabledReason,
      stripe_connect_onboarding_completed_at: status.ready
        ? String(linked[0].stripe_connect_onboarding_completed_at || now)
        : null,
      stripe_connect_last_synced_at: now,
    })
    .eq("id", linked[0].id)
    .eq("stripe_account_id", input.accountId)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(`STRIPE_CONNECT_SYNC_FAILED:${updateError.message}`);
  if (!updated) throw new Error("STRIPE_CONNECT_LINK_CHANGED_DURING_SYNC");
  return "updated";
}
