import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  isStripeConnectV2AccountEvent,
  isStripeConnectV2AccountPersonEvent,
  readStripeConnectV2EventAccountId,
  syncStripeConnectV2AccountEvent,
} from "../../supabase/functions/_shared/stripe-connect-events";

const webhook = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const client = readFileSync("supabase/functions/_shared/stripe-client.ts", "utf8");

function stripe(status = "active") {
  const retrieve = vi.fn(async () => ({
    applied_configurations: ["recipient"],
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { status } } },
      },
    },
    requirements: { entries: [] },
  }));
  return { v2: { core: { accounts: { retrieve } } }, retrieve };
}

function database(linked: Record<string, unknown>[] = [{
  id: "rest_1", stripe_connect_onboarding_completed_at: "2026-10-01T12:00:00.000Z",
}]) {
  const update = vi.fn();
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ limit: async () => ({ data: linked, error: null }) }) }),
    update: (data: Record<string, unknown>) => {
      update(data);
      return { eq: () => ({ eq: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: "rest_1" }, error: null }) }),
      }) }) };
    },
  }));
  return { from, update };
}

describe("Stripe Connect v2 thin webhook verification and reconciliation", () => {
  it("accepts only Accounts v2 notifications with a real linked account ID", () => {
    const event = {
      id: "evt_123", type: "v2.core.account[configuration.recipient].capability_status_updated",
      related_object: { type: "v2.core.account", id: "acct_123" },
    };
    expect(isStripeConnectV2AccountEvent(event)).toBe(true);
    expect(readStripeConnectV2EventAccountId(event)).toBe("acct_123");
    expect(isStripeConnectV2AccountEvent({ type: "checkout.session.completed" })).toBe(false);
    expect(isStripeConnectV2AccountEvent({ type: "v2.core.account_person.updated" })).toBe(false);
    expect(isStripeConnectV2AccountPersonEvent({ type: "v2.core.account_person.updated" })).toBe(true);
    expect(isStripeConnectV2AccountPersonEvent({ type: "v2.core.account_person.created" })).toBe(true);
    expect(isStripeConnectV2AccountPersonEvent({ type: "v2.core.account.created" })).toBe(false);
    expect(isStripeConnectV2AccountPersonEvent({ type: "charge.succeeded" })).toBe(false);
    expect(() => readStripeConnectV2EventAccountId({
      ...event, related_object: { type: "v2.core.account_person", id: "person_1" },
    })).toThrow("STRIPE_CONNECT_INVALID_RELATED_ACCOUNT");
  });

  it("syncs the latest verified recipient capability without rewriting its initial completion date", async () => {
    const service = stripe();
    const db = database();
    expect(await syncStripeConnectV2AccountEvent({
      stripe: service as never, adminClient: db,
      accountId: "acct_123", now: "2026-11-04T16:00:00.000Z",
    })).toBe("updated");
    expect(service.retrieve).toHaveBeenCalledWith("acct_123", {
      include: ["configuration.recipient", "requirements", "defaults"],
    });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: true,
      stripe_connect_onboarding_completed_at: "2026-10-01T12:00:00.000Z",
    }));
  });

  it("fails closed if payout capability becomes restricted", async () => {
    const service = stripe("pending");
    const db = database();
    await syncStripeConnectV2AccountEvent({
      stripe: service as never, adminClient: db, accountId: "acct_123",
    });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      stripe_connect_charges_enabled: false,
      stripe_connect_payouts_enabled: false,
      stripe_connect_onboarding_completed_at: null,
    }));
  });

  it("ignores unlinked accounts without touching Stripe or the database", async () => {
    const service = stripe();
    const db = database([]);
    expect(await syncStripeConnectV2AccountEvent({
      stripe: service as never, adminClient: db, accountId: "acct_other",
    })).toBe("unmatched");
    expect(service.retrieve).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects multiple restaurants referencing the same connected account", async () => {
    const db = database([{ id: "rest_1" }, { id: "rest_2" }]);
    await expect(syncStripeConnectV2AccountEvent({
      stripe: stripe() as never, adminClient: db, accountId: "acct_123",
    })).rejects.toThrow("STRIPE_CONNECT_ACCOUNT_LINK_NOT_UNIQUE");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("checks signature and uses existing atomic webhook lease before syncing", () => {
    expect(webhook).toContain("stripe.webhooks.constructEventAsync(");
    expect(webhook).toContain('webhookSecret.expectedMode !== "live"');
    expect(webhook).toContain("isStripeConnectV2AccountEvent(candidateEvent)");
    expect(webhook).toContain("isStripeConnectV2AccountPersonEvent(candidateEvent)");
    expect(webhook).toContain("isStripeConnectV2AccountPersonEvent(event)");
    expect(webhook).toContain('let outcome: "updated" | "unmatched" | "account_person_ignored"');
    expect(webhook).toContain("const eventLockToken = eventClaim.lockToken;");
    expect(webhook).toContain("syncStripeConnectV2AccountEvent({");
    expect(webhook).toContain("markStripeWebhookEventSucceeded({");
    expect(webhook).toContain("markStripeWebhookEventFailed({");
    expect(client).toContain('"STRIPE_CONNECT_WEBHOOK_SECRET"');
    expect(client).toContain('STRIPE_CONNECT_API_VERSION = "2026-09-30.endive"');
    expect(client).toContain('STRIPE_API_VERSION = "2026-06-24.dahlia"');
  });
});
