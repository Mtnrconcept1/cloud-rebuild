import test from "node:test";
import assert from "node:assert/strict";
import { classifyPayment, runAudit, safeAccountLabel } from "./stripe-financial-reconciliation.mjs";

const pi = { id: "pi_example", amount_received: 500, currency: "chf", status: "succeeded", livemode: true };
test("unrecorded successful payment is flagged", () => {
  assert.equal(classifyPayment(pi, [], []), "missing_internal_record");
});
test("payment attempt without transaction is flagged", () => {
  assert.equal(classifyPayment(pi, [], [{ stripe_payment_intent_id: pi.id }]), "missing_successful_transaction");
});
test("amount or currency divergence is flagged", () => {
  assert.equal(classifyPayment(pi, [{ stripe_payment_intent_id: pi.id, amount: 6, currency: "CHF", status: "succeeded" }], []), "amount_or_currency_mismatch");
});
test("valid successful transaction is matched", () => {
  assert.equal(classifyPayment(pi, [{ stripe_payment_intent_id: pi.id, amount: 5, currency: "CHF", status: "succeeded" }], []), "matched");
});
test("account label does not expose free-form user input", () => {
  assert.equal(safeAccountLabel("a/b c"), "a_b_c");
});
test("fails closed when approved account configuration is absent", async () => {
  await assert.rejects(runAudit({}), /STRIPE_AUDIT_ACCOUNTS/);
});
test("rejects a runtime Stripe account mismatch", async () => {
  const fakeFetch = async (url) => {
    if (String(url).includes("/rest/v1/")) return { ok: true, json: async () => [] };
    if (String(url).endsWith("/v1/account")) return { ok: true, json: async () => ({ id: "acct_DIFFERENT" }) };
    throw new Error("unexpected fetch");
  };
  await assert.rejects(
    runAudit({
      STRIPE_AUDIT_ACCOUNTS: JSON.stringify([{ accountId: "acct_Approved123", secretKey: "sk_live_opaque" }]),
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-private-key",
    }, fakeFetch),
    /STRIPE_ACCOUNT_ID_MISMATCH/,
  );
});
test("detects successful Stripe payment missing from TOK database", async () => {
  const fakeFetch = async (url) => {
    if (String(url).includes("/rest/v1/")) return { ok: true, json: async () => [] };
    if (String(url).endsWith("/v1/account")) return { ok: true, json: async () => ({ id: "acct_Approved123" }) };
    if (String(url).includes("/v1/payment_intents")) {
      return { ok: true, json: async () => ({ data: [pi], has_more: false }) };
    }
    throw new Error("unexpected fetch");
  };
  const result = await runAudit({
    STRIPE_AUDIT_ACCOUNTS: JSON.stringify([{ accountId: "acct_Approved123", secretKey: "sk_live_opaque" }]),
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-private-key",
  }, fakeFetch);
  assert.equal(result.anomalies[0].reason, "missing_internal_record");
});
