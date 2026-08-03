import { describe, expect, it, vi } from "vitest";

import {
  appendPaymentAttemptToUrl,
  buildPaymentAttemptReference,
  clearPaymentAttemptId,
  createCheckoutWithRecovery,
  createPaymentAttemptOperationKey,
  derivePaymentAttemptUuid,
  getOrCreatePaymentAttemptId,
  markPaymentAttemptRedirected,
  normalizePaymentAttemptId,
  paymentAttemptReducer,
  readRedirectedPaymentAttemptId,
  readPaymentAttemptId,
  rememberPaymentAttemptId,
  shouldCancelPaymentAttemptAfterNavigation,
  type PaymentAttemptStorage,
} from "../lib/paymentAttempt";
import { buildCheckoutReturnUrl } from "../lib/checkoutReturnUrl";
import { parseStripeReturnSearch } from "../lib/stripeReturn";

const ATTEMPT_ID = "9c0af2aa-ced2-4e27-9b6b-561e4b9b0740";
const SECOND_ATTEMPT_ID = "7cb13b57-a546-49db-a1b3-8c1d24a16921";

class MemoryStorage implements PaymentAttemptStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("payment attempt lifecycle", () => {
  it("reuses one opaque id for the same business operation", () => {
    const storage = new MemoryStorage();
    const operationKey = createPaymentAttemptOperationKey({
      restaurantId: "restaurant-1",
      items: [{ id: "dish-1", quantity: 2 }],
    });

    const first = getOrCreatePaymentAttemptId("order", operationKey, {
      storage,
      candidateId: ATTEMPT_ID,
    });
    const retry = getOrCreatePaymentAttemptId("order", operationKey, {
      storage,
      candidateId: SECOND_ATTEMPT_ID,
    });

    expect(first).toBe(ATTEMPT_ID);
    expect(retry).toBe(first);
    expect(readPaymentAttemptId("order", storage)).toBe(first);
  });

  it("rotates the id when the payable operation changes", () => {
    const storage = new MemoryStorage();
    getOrCreatePaymentAttemptId("order", "cart-v1", {
      storage,
      candidateId: ATTEMPT_ID,
    });

    const changed = getOrCreatePaymentAttemptId("order", "cart-v2", {
      storage,
      candidateId: SECOND_ATTEMPT_ID,
    });

    expect(changed).toBe(SECOND_ATTEMPT_ID);
  });

  it("does not clear a newer attempt when an older tab finishes", () => {
    const storage = new MemoryStorage();
    rememberPaymentAttemptId("order", SECOND_ATTEMPT_ID, storage);

    expect(clearPaymentAttemptId("order", ATTEMPT_ID, storage)).toBe(false);
    expect(readPaymentAttemptId("order", storage)).toBe(SECOND_ATTEMPT_ID);
    expect(clearPaymentAttemptId("order", SECOND_ATTEMPT_ID, storage)).toBe(true);
    expect(readPaymentAttemptId("order", storage)).toBeNull();
  });

  it("marks a Stripe redirect and recognizes browser-back recovery without confusing refresh", () => {
    const storage = new MemoryStorage();
    getOrCreatePaymentAttemptId("order", "cart-v1", {
      storage,
      candidateId: ATTEMPT_ID,
    });

    expect(markPaymentAttemptRedirected("order", ATTEMPT_ID, storage)).toBe(true);
    expect(readRedirectedPaymentAttemptId("order", storage)).toBe(ATTEMPT_ID);
    expect(shouldCancelPaymentAttemptAfterNavigation("back_forward", false, "")).toBe(true);
    expect(shouldCancelPaymentAttemptAfterNavigation("reload", false, "")).toBe(false);
    expect(shouldCancelPaymentAttemptAfterNavigation("back_forward", true, "?status=success")).toBe(false);
  });

  it("keeps the recovery URL non-sensitive and validates the opaque UUID", () => {
    const returnUrl = appendPaymentAttemptToUrl(
      "https://www.thetok.ch/commande/confirmation?checkout_kind=order",
      ATTEMPT_ID,
    );
    const parsed = new URL(returnUrl);

    expect(parsed.searchParams.get("payment_attempt_id")).toBe(ATTEMPT_ID);
    expect(parsed.searchParams.has("session_id")).toBe(false);
    expect(normalizePaymentAttemptId("not-a-uuid")).toBeNull();

    const trustedReturnUrl = buildCheckoutReturnUrl("/commande/confirmation?checkout_kind=order", {
      origin: "https://www.thetok.ch",
      paymentAttemptId: ATTEMPT_ID,
    });
    expect(new URL(trustedReturnUrl).searchParams.get("payment_attempt_id")).toBe(ATTEMPT_ID);

    expect(parseStripeReturnSearch(
      `?status=success&payment_attempt_id=${ATTEMPT_ID}&session_id=cs_test_123`,
    )).toMatchObject({
      status: "success",
      paymentAttemptId: ATTEMPT_ID,
      sessionId: "cs_test_123",
      isStripeReturn: true,
    });
  });

  it("derives stable order ids and references from the attempt", () => {
    const first = derivePaymentAttemptUuid(ATTEMPT_ID, "restaurant-1:0");
    const retry = derivePaymentAttemptUuid(ATTEMPT_ID, "restaurant-1:0");
    const other = derivePaymentAttemptUuid(ATTEMPT_ID, "restaurant-1:1");

    expect(first).toBe(retry);
    expect(first).not.toBe(other);
    expect(normalizePaymentAttemptId(first)).toBe(first);
    expect(buildPaymentAttemptReference("CMD", ATTEMPT_ID)).toBe("CMD-9C0AF2AACED2");
  });

  it("moves an uncertain request through checking before redirect", () => {
    let state = paymentAttemptReducer("idle", { type: "submit" });
    state = paymentAttemptReducer(state, { type: "uncertain" });
    expect(state).toBe("checking");
    state = paymentAttemptReducer(state, { type: "redirect" });
    expect(state).toBe("redirecting");
    state = paymentAttemptReducer(state, { type: "settled" });
    expect(state).toBe("succeeded");
    expect(paymentAttemptReducer(state, { type: "cancel" })).toBe("succeeded");
  });

  it("recovers the existing Stripe session after a client timeout", async () => {
    const create = vi.fn(() => new Promise<never>(() => {}));
    const getStatus = vi.fn()
      .mockResolvedValueOnce({ state: "creating", retryable: true })
      .mockResolvedValueOnce({
        payment_attempt_id: ATTEMPT_ID,
        state: "checkout_open",
        sessionId: "cs_test_recovered",
        url: "https://checkout.stripe.com/c/pay/cs_test_recovered",
        reused: true,
      });

    const result = await createCheckoutWithRecovery({
      paymentAttemptId: ATTEMPT_ID,
      create,
      getStatus,
      timeoutMs: 1,
      pollAttempts: 2,
      pollDelayMs: 0,
      sleep: async () => {},
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(result.sessionId).toBe("cs_test_recovered");
    expect(result.url).toContain("cs_test_recovered");
  });

  it("polls a 409 in-progress attempt instead of creating another checkout", async () => {
    const inProgress = Object.assign(new Error("PAYMENT_ATTEMPT_ALREADY_IN_PROGRESS"), { status: 409 });
    const getStatus = vi.fn().mockResolvedValue({
      payment_attempt_id: ATTEMPT_ID,
      state: "checkout_open",
      session_id: "cs_test_same_attempt",
      url: "https://checkout.stripe.com/c/pay/cs_test_same_attempt",
      reused: true,
    });

    const result = await createCheckoutWithRecovery({
      paymentAttemptId: ATTEMPT_ID,
      create: async () => { throw inProgress; },
      getStatus,
      pollAttempts: 1,
    });

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(result.reused).toBe(true);
    expect(result.sessionId).toBe("cs_test_same_attempt");
  });

  it("surfaces a scope conflict instead of polling an attempt the server never created", async () => {
    const conflict = Object.assign(
      new Error("Un paiement d'abonnement est deja en cours. Reprenez la tentative existante."),
      {
        status: 409,
        body: {
          error: "Un paiement d'abonnement est deja en cours. Reprenez la tentative existante.",
          error_code: "PAYMENT_ATTEMPT_OPERATION_CONFLICT",
          existing_payment_attempt_id: SECOND_ATTEMPT_ID,
          resumable: true,
        },
      },
    );
    const getStatus = vi.fn();

    await expect(createCheckoutWithRecovery({
      paymentAttemptId: ATTEMPT_ID,
      create: async () => { throw conflict; },
      getStatus,
      pollAttempts: 5,
      pollDelayMs: 0,
      sleep: async () => {},
    })).rejects.toBe(conflict);

    expect(getStatus).not.toHaveBeenCalled();
  });

  it("still polls when the conflict names the attempt this client already owns", async () => {
    const inProgress = Object.assign(new Error("PAYMENT_ATTEMPT_ALREADY_IN_PROGRESS"), {
      status: 409,
      body: {
        error: "PAYMENT_ATTEMPT_ALREADY_IN_PROGRESS",
        error_code: "PAYMENT_ATTEMPT_ALREADY_IN_PROGRESS",
        existing_payment_attempt_id: ATTEMPT_ID,
        resumable: true,
      },
    });
    const getStatus = vi.fn().mockResolvedValue({
      payment_attempt_id: ATTEMPT_ID,
      state: "session_bound",
      session_id: "cs_test_same_attempt",
      url: "https://checkout.stripe.com/c/pay/cs_test_same_attempt",
    });

    const result = await createCheckoutWithRecovery({
      paymentAttemptId: ATTEMPT_ID,
      create: async () => { throw inProgress; },
      getStatus,
      pollAttempts: 1,
    });

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(result.sessionId).toBe("cs_test_same_attempt");
  });

  it("does not hide a definitive validation failure behind polling", async () => {
    const validationError = Object.assign(new Error("Montant invalide"), { status: 422 });
    const getStatus = vi.fn();

    await expect(createCheckoutWithRecovery({
      paymentAttemptId: ATTEMPT_ID,
      create: async () => { throw validationError; },
      getStatus,
      timeoutMs: 5,
    })).rejects.toBe(validationError);

    expect(getStatus).not.toHaveBeenCalled();
  });
});
