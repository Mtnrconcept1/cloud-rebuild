import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTokPaymentStatus } from "../../supabase/functions/_shared/tok-connect-payment-status";

const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_live_example";
const base = {
  persistedState: "session_bound",
  observedState: "session_bound",
  stripePaymentStatus: "unpaid",
  checkoutUrl,
  providerLookupIndeterminate: false,
} as const;

describe("TOK authenticated payment status and recovery", () => {
  it("never downgrades a persisted, webhook-finalized order when Stripe is unavailable", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      persistedState: "finalized",
      providerLookupIndeterminate: true,
    })).toEqual({
      state: "finalized",
      paymentReceived: true,
      finalized: true,
      indeterminate: false,
      retryable: false,
      checkoutUrl: null,
    });
  });

  it("prevents a second payment while Stripe says paid but TOK is still reconciling", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      observedState: "paid",
      stripePaymentStatus: "paid",
    })).toEqual({
      state: "paid",
      paymentReceived: true,
      finalized: false,
      indeterminate: false,
      retryable: false,
      checkoutUrl: null,
    });
  });

  it("never marks a paid order or exposes a Checkout link after ambiguous Stripe errors", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      providerLookupIndeterminate: true,
    })).toEqual({
      state: "indeterminate",
      paymentReceived: false,
      finalized: false,
      indeterminate: true,
      retryable: false,
      checkoutUrl: null,
    });
  });

  it("only exposes an unpaid, verified and still-open Checkout link", () => {
    expect(resolveTokPaymentStatus(base)).toMatchObject({
      state: "session_bound",
      paymentReceived: false,
      finalized: false,
      indeterminate: false,
      checkoutUrl,
    });
  });

  it("does not resurrect a finalized attempt even if Stripe returns stale open data", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      persistedState: "finalized",
    })).toMatchObject({
      state: "finalized",
      paymentReceived: true,
      checkoutUrl: null,
      retryable: false,
    });
  });

  it("retains a safe terminal cancelled state and does not reopen payment", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      persistedState: "cancelled",
      observedState: "cancelled",
      checkoutUrl: null,
    })).toMatchObject({
      state: "cancelled",
      paymentReceived: false,
      retryable: false,
      checkoutUrl: null,
    });
  });

  it("never reopens a cancelled database attempt after stale Stripe open data", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      persistedState: "cancelled",
      observedState: "session_bound",
      checkoutUrl,
    })).toEqual({
      state: "cancelled",
      paymentReceived: false,
      finalized: false,
      indeterminate: false,
      retryable: false,
      checkoutUrl: null,
    });
  });

  it("never reopens a failed or expired database attempt after a stale remote response", () => {
    for (const persistedState of ["failed", "expired"]) {
      expect(resolveTokPaymentStatus({
        ...base,
        persistedState,
        observedState: "session_bound",
        checkoutUrl,
      })).toMatchObject({
        state: persistedState,
        finalized: false,
        retryable: false,
        checkoutUrl: null,
      });
    }
  });

  it("does not infer a payment from an expired session", () => {
    expect(resolveTokPaymentStatus({
      ...base,
      observedState: "expired",
      checkoutUrl: null,
    })).toMatchObject({
      state: "expired",
      paymentReceived: false,
      finalized: false,
      checkoutUrl: null,
    });
  });

  it("keeps the MCP bridge bound to the authenticated backend and server finalization", () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
    const handler = read("supabase/functions/payment-attempt-status/index.ts");
    const bridge = read("supabase/functions/tok-connect-app-bridge/index.ts");
    expect(handler).toContain("findOwnedPaymentAttempt");
    expect(handler).toContain("ownerUserId: actor.userId");
    expect(handler).toContain("assertCheckoutSessionIntegrity");
    expect(handler).toContain("resolveTokPaymentStatus({");
    expect(handler).toContain("webhook_received: outcome.finalized");
    expect(handler).toContain("payment_received: outcome.paymentReceived");
    expect(bridge).toContain('postCustomerTokFunction(req, "payment-attempt-status"');
    expect(bridge).toContain('status.webhook_received === true && status.state === "finalized"');
    expect(bridge).toContain("reconciliation_pending: paymentReceived && !tokFinalized");
    expect(bridge).toContain("paymentReceived ? null : safeTokCommerceCheckoutUrl(status.url)");
  });
});
