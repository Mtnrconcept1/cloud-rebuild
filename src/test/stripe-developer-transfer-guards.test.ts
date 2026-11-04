import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertDeveloperConnectAccountReady,
  assertDeveloperTransferRetrySafe,
} from "../../supabase/functions/_shared/developer-transfer-guards";

const accountId = "acct_Developer123";
const ready = {
  id: accountId,
  deleted: false,
  details_submitted: true,
  charges_enabled: false, // Recipient-only accounts must not need card charges.
  payouts_enabled: true,
  requirements: { currently_due: [], disabled_reason: null },
  capabilities: { transfers: "active" },
};

const now = Date.UTC(2026, 10, 4, 18, 0);
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
const expected = {
  destinationAccountId: accountId,
  stripeMode: "test" as const,
  amountCents: 50,
  currency: "CHF",
  idempotencyKey: "tok-developer-statement:statement-1:test",
};
const record = {
  created_at: hoursAgo(1),
  attempt_count: 1,
  stripe_mode: expected.stripeMode,
  destination_account_id: expected.destinationAccountId,
  amount_cents: expected.amountCents,
  currency: expected.currency,
  idempotency_key: expected.idempotencyKey,
  stripe_transfer_id: null,
};

describe("Developer Connect transfer safety", () => {
  it("accepts a verified recipient without requesting card_payments", () => {
    expect(() => assertDeveloperConnectAccountReady(ready, accountId)).not.toThrow();
  });

  it.each([
    ["deleted", { deleted: true }],
    ["missing KYC completion", { details_submitted: false }],
    ["payouts disabled", { payouts_enabled: false }],
    ["missing requirements", { requirements: undefined }],
    ["requirements outstanding", { requirements: { currently_due: ["person.id"], disabled_reason: null } }],
    ["requirements not array", { requirements: { currently_due: null, disabled_reason: null } }],
    ["disabled by Stripe", { requirements: { currently_due: [], disabled_reason: "requirements.past_due" } }],
    ["transfers pending", { capabilities: { transfers: "pending" } }],
    ["transfers restricted", { capabilities: { transfers: "restricted" } }],
    ["missing transfer capability", { capabilities: {} }],
    ["missing capabilities object", { capabilities: null }],
    ["mismatched recipient", { id: "acct_Other456" }],
  ])("fails closed for %s", (_label, patch) => {
    expect(() => assertDeveloperConnectAccountReady({ ...ready, ...patch }, accountId))
      .toThrow();
  });

  it("rejects absent account and malformed destination", () => {
    expect(() => assertDeveloperConnectAccountReady(null, accountId)).toThrow();
    expect(() => assertDeveloperConnectAccountReady(ready, "not_an_account")).toThrow();
  });

  it("accepts a first claim and a retry within Stripe's idempotency window", () => {
    expect(() => assertDeveloperTransferRetrySafe(record, expected, now)).not.toThrow();
    expect(() => assertDeveloperTransferRetrySafe({
      ...record,
      attempt_count: 2,
      created_at: hoursAgo(22),
    }, expected, now)).not.toThrow();
  });

  it("blocks a retry after the safety window, including exactly 23 hours", () => {
    for (const hours of [23, 24, 72]) {
      expect(() => assertDeveloperTransferRetrySafe({
        ...record,
        attempt_count: 2,
        created_at: hoursAgo(hours),
      }, expected, now)).toThrow("DEVELOPER_TRANSFER_REQUIRES_MANUAL_RECONCILIATION");
    }
  });

  it("never resubmits a transfer already identified by Stripe", () => {
    expect(() => assertDeveloperTransferRetrySafe({
      ...record,
      stripe_transfer_id: "tr_AlreadyTransferred123",
    }, expected, now)).toThrow("DEVELOPER_TRANSFER_REQUIRES_MANUAL_RECONCILIATION");
  });

  it.each([
    ["missing record", null],
    ["missing timestamp", { ...record, created_at: null }],
    ["unparseable timestamp", { ...record, created_at: "invalid" }],
    ["missing attempts", { ...record, attempt_count: null }],
    ["destination changed", { ...record, destination_account_id: "acct_Other456" }],
    ["wrong environment", { ...record, stripe_mode: "live" }],
    ["changed amount", { ...record, amount_cents: 51 }],
    ["changed currency", { ...record, currency: "USD" }],
    ["different idempotency key", { ...record, idempotency_key: "other" }],
  ])("never pays an untrusted claim snapshot: %s", (_label, snapshot) => {
    expect(() => assertDeveloperTransferRetrySafe(snapshot, expected, now))
      .toThrow("DEVELOPER_TRANSFER_SNAPSHOT_MISMATCH");
  });

  it("keeps the transfer guard on the server before payment submission", () => {
    const source = readFileSync("supabase/functions/settle-developer-statement/index.ts", "utf8");
    const guard = source.indexOf("assertDeveloperTransferRetrySafe(transferRecord,");
    const transfer = source.indexOf("stripe.transfers.create(");
    expect(guard).toBeGreaterThan(0);
    expect(transfer).toBeGreaterThan(guard);
    expect(source).toContain('if (claim.stripe_mode !== stripeMode)');
    expect(source).toContain('assertDeveloperConnectAccountReady(account, destinationAccountId)');
    expect(source).toContain("INVALID_DEVELOPER_TRANSFER_STRIPE_MODE");
    expect(source).toContain("assertProductionFlowAllowed");
  });
});
