import { describe, expect, it, vi } from "vitest";
import {
  createRestaurantConnectAccount,
  readRestaurantConnectAccount,
  createRestaurantConnectOnboardingLink,
} from "../../supabase/functions/_shared/stripe-connect-account";

type Client = Parameters<typeof readRestaurantConnectAccount>[0];
const asClient = (mock: unknown): Client => mock as Client;

function recipientAccount(status: string, requirements: unknown[] = []) {
  return {
    id: "acct_recipient",
    applied_configurations: ["recipient"],
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { status } } },
      },
    },
    requirements: { entries: requirements },
  };
}

describe("Stripe Connect recipient onboarding v2", () => {
  it("creates recipient-only accounts without requesting direct card charges", async () => {
    const create = vi.fn(async () => ({ id: "acct_recipient" }));
    const stripe = asClient({ v2: { core: { accounts: { create } } } });
    const id = await createRestaurantConnectAccount(stripe, {
      restaurantId: "restaurant-123", restaurantName: "La Gazelle",
      ownerEmail: "owner@example.test", ownerId: "user-123",
    });
    expect(id).toBe("acct_recipient");
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
    expect(params.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested).toBe(true);
    expect(params.configuration.merchant).toBeUndefined();
    expect(params.dashboard).toBe("express");
    expect(params.defaults.responsibilities).toEqual({
      fees_collector: "application", losses_collector: "application",
    });
    expect(params.metadata.platform_fee_percent).toBeUndefined();
    expect(options.idempotencyKey).toBe("stripe-connect-v2-recipient:restaurant-123");
  });

  it("accepts a verified recipient for marketplace transfers only", async () => {
    const stripe = asClient({
      v2: { core: { accounts: { retrieve: async () => recipientAccount("active") } } },
    });
    const result = await readRestaurantConnectAccount(stripe, "acct_recipient");
    expect(result).toMatchObject({
      api: "v2", ready: true, detailsSubmitted: true,
      chargesEnabled: true, payoutsEnabled: true, requirementsDue: [],
    });
  });

  it("keeps payments blocked while transfer capability or requirements are pending", async () => {
    for (const account of [
      recipientAccount("pending"),
      recipientAccount("active", [{ id: "requirement-1", status: "pending" }]),
    ]) {
      const stripe = asClient({
        v2: { core: { accounts: { retrieve: async () => account } } },
      });
      expect((await readRestaurantConnectAccount(stripe, "acct_recipient")).ready).toBe(false);
    }
  });

  it("fails closed for absent KYC requirements and closed recipient accounts", async () => {
    const incomplete = asClient({
      v2: { core: { accounts: { retrieve: async () => ({
        ...recipientAccount("active"), requirements: null,
      }) } } },
    });
    await expect(readRestaurantConnectAccount(incomplete, "acct_recipient"))
      .rejects.toThrow("STRIPE_CONNECT_REQUIREMENTS_NOT_INCLUDED");

    const closed = asClient({
      v2: { core: { accounts: { retrieve: async () => ({
        ...recipientAccount("active"), closed: true,
      }) } } },
    });
    expect((await readRestaurantConnectAccount(closed, "acct_recipient")).ready).toBe(false);
  });

  it("does not downgrade to legacy checks when a v2 account lacks recipient capability", async () => {
    const legacy = vi.fn();
    const stripe = asClient({
      v2: { core: { accounts: { retrieve: async () => ({
        applied_configurations: ["customer"], configuration: null,
      }) } } },
      accounts: { retrieve: legacy },
    });
    await expect(readRestaurantConnectAccount(stripe, "acct_unsafe"))
      .rejects.toThrow("STRIPE_CONNECT_RECIPIENT_CONFIGURATION_MISSING");
    expect(legacy).not.toHaveBeenCalled();
  });

  it("does not fall back on Stripe outages or permission errors", async () => {
    const legacy = vi.fn();
    const stripe = asClient({
      v2: { core: { accounts: { retrieve: async () => { throw new Error("Stripe unavailable"); } } } },
      accounts: { retrieve: legacy },
    });
    await expect(readRestaurantConnectAccount(stripe, "acct_unknown"))
      .rejects.toThrow("Stripe unavailable");
    expect(legacy).not.toHaveBeenCalled();
  });

  it("supports previously created v1 accounts explicitly identified by Stripe", async () => {
    const stripe = asClient({
      v2: { core: { accounts: { retrieve: async () => {
        throw Object.assign(new Error("v1 account"), { code: "v1_account_instead_of_v2_account" });
      } } } },
      accounts: { retrieve: async () => ({
        details_submitted: true, charges_enabled: true, payouts_enabled: true,
        requirements: { currently_due: [] },
      }) },
    });
    expect(await readRestaurantConnectAccount(stripe, "acct_legacy")).toMatchObject({
      api: "v1", ready: true, accountId: "acct_legacy",
    });
  });

  it("creates a Stripe-hosted v2 onboarding link without a custom KYC form", async () => {
    const create = vi.fn(async () => ({ url: "https://connect.stripe.com/link" }));
    const stripe = asClient({ v2: { core: { accountLinks: { create } } } });
    const url = await createRestaurantConnectOnboardingLink(
      stripe,
      { accountId: "acct_recipient", api: "v2", ready: false,
        detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false,
        requirementsDue: [], disabledReason: "stripe_transfers_not_active" },
      "https://www.thetok.ch/dashboard/restaurant",
    );
    expect(url).toBe("https://connect.stripe.com/link");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_recipient",
        use_case: expect.objectContaining({ type: "account_onboarding" }),
      }),
    );
  });
});
