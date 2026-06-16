#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const exists = (path) => existsSync(resolve(root, path));

const checks = [];

function addCheck(name, pass, details) {
  checks.push({ name, pass: Boolean(pass), details });
}

function fileContains(path, fragments) {
  if (!exists(path)) return false;
  const source = read(path);
  return fragments.every((fragment) => source.includes(fragment));
}

const createCheckoutPath = "supabase/functions/create-checkout/index.ts";
const stripeWebhookPath = "supabase/functions/stripe-webhook/index.ts";
const stripeClientPath = "supabase/functions/_shared/stripe-client.ts";
const orderCheckoutPath = "supabase/functions/_shared/order-checkout.ts";
const paymentAnomaliesPath = "supabase/migrations/20260531165000_payment_integrity_anomaly_rpc.sql";
const scaleMigrationPath = "supabase/migrations/20260607053000_scale_readiness_indexes_and_guards.sql";
const stripeWebhookVerificationSource = [
  exists(stripeWebhookPath) ? read(stripeWebhookPath) : "",
  exists(stripeClientPath) ? read(stripeClientPath) : "",
].join("\n");

addCheck(
  "Stripe Checkout sessions carry reconciliation metadata",
  fileContains(createCheckoutPath, [
    "metadata: sessionMetadata",
    "client_reference_id: actor.userId || undefined",
    "authoritative_total",
    "checkout_group_id",
  ]),
  "Required to reconcile paid sessions against TOK orders during traffic spikes.",
);

addCheck(
  "Stripe webhook verifies signatures before side effects",
  [
    "constructEventAsync",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SIGNING_SECRET",
  ].every((fragment) => stripeWebhookVerificationSource.includes(fragment)),
  "Unsigned or replayed webhook payloads must never mutate production data.",
);

addCheck(
  "Stripe webhook records event IDs before processing",
  fileContains(stripeWebhookPath, [
    "stripe_webhook_events",
    "duplicate_event_skipped",
    "claimStripeWebhookEvent",
    "23505",
    "stripe_webhook_event_claim_failed",
  ]),
  "Idempotency must be present before order, campaign, subscription, or reservation side effects.",
);

addCheck(
  "Order checkout finalization is idempotent",
  fileContains(orderCheckoutPath, [
    "findOrdersForSession",
    "recordOrderChargeIfMissing",
    "checkout_session_state",
    "payment_status",
  ]),
  "Repeated Stripe retries must not create duplicate charges or corrupt order state.",
);

addCheck(
  "Payment integrity anomaly RPC exists",
  fileContains(paymentAnomaliesPath, [
    "get_payment_integrity_anomalies",
    "stale_pending_order",
    "captured_order_without_charge",
    "succeeded_order_charge_without_order",
  ]),
  "Admins need a single health signal for paid-but-unfulfilled or captured-without-charge anomalies.",
);

addCheck(
  "Scale readiness indexes and guards migration exists",
  fileContains(scaleMigrationPath, [
    "idx_orders_restaurant_status_created_at",
    "idx_orders_pending_payment_watchdog",
    "idx_payment_transactions_stripe_session_charge_succeeded",
    "idx_reservations_restaurant_status_created_at",
    "ux_payment_transactions_succeeded_charge_session_kind",
  ]),
  "Hot paths need explicit indexes/guards before 10k daily visitors or order spikes.",
);

const failed = checks.filter((check) => !check.pass);

console.log("\nTOK scale readiness checks\n");
for (const check of checks) {
  console.log(`${check.pass ? "✓" : "✗"} ${check.name}`);
  if (!check.pass) console.log(`  ${check.details}`);
}

console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);

if (failed.length > 0) {
  console.error("\nScale readiness failed. Fix the failed checks before production launch.");
  process.exit(1);
}
