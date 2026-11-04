import type Stripe from "npm:stripe@22.3.2";

type ConnectStatus = {
  accountId: string;
  api: "v1" | "v2";
  ready: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
};

function isLegacyAccountError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code ?? "")
    : "";
  return code === "v1_account_instead_of_v2_account"
    || code === "account_not_yet_compatible_with_v2";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function createRestaurantConnectAccount(
  stripe: Stripe,
  input: { restaurantId: string; restaurantName: string; ownerEmail: string; ownerId: string; websiteUrl?: string },
): Promise<string> {
  // A restaurant receives marketplace destination charges; it does not act
  // as merchant of record for these payments. Do not request card_payments.
  const account = await stripe.v2.core.accounts.create({
    contact_email: input.ownerEmail || undefined,
    display_name: input.restaurantName,
    dashboard: "express",
    identity: { country: "CH" },
    defaults: {
      currency: "chf",
      locales: ["fr"],
      profile: {
        doing_business_as: input.restaurantName,
        business_url: input.websiteUrl || undefined,
        product_description: "Restaurant partenaire de TOK",
      },
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    metadata: {
      restaurant_id: input.restaurantId,
      owner_id: input.ownerId,
      platform: "TOK",
    },
    include: ["configuration.recipient", "requirements"],
  }, {
    idempotencyKey: `stripe-connect-v2-recipient:${input.restaurantId}`,
  });
  if (!account.id) throw new Error("STRIPE_CONNECT_ACCOUNT_CREATE_MISSING_ID");
  return account.id;
}

export async function readRestaurantConnectAccount(
  stripe: Stripe,
  accountId: string,
): Promise<ConnectStatus> {
  try {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.recipient", "requirements", "defaults"],
    });

    if (!account.applied_configurations?.includes("recipient")) {
      throw new Error("STRIPE_CONNECT_RECIPIENT_CONFIGURATION_MISSING");
    }
    const recipient = account.configuration?.recipient;
    const transferStatus = recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    // The required capability for destination charges is stripe_transfers.
    // A recipient-only account has no card_payments capability.
    const canReceiveTransfer = !account.closed && transferStatus === "active";
    const requirements = account.requirements;
    // A missing includable value is not proof that KYC is complete.
    if (!Array.isArray(requirements?.entries)) {
      throw new Error("STRIPE_CONNECT_REQUIREMENTS_NOT_INCLUDED");
    }
    const due = requirements.entries
      .map((entry) => String(entry.reference ?? "verification_required"));
    return {
      accountId,
      api: "v2",
      ready: canReceiveTransfer && due.length === 0,
      detailsSubmitted: canReceiveTransfer && due.length === 0,
      chargesEnabled: canReceiveTransfer,
      payoutsEnabled: canReceiveTransfer,
      requirementsDue: due,
      disabledReason: canReceiveTransfer ? null : "stripe_transfers_not_active",
    };
  } catch (error) {
    // Never fall back to an older API for authorization errors, missing
    // capabilities, or provider outages. Only known v1 accounts are exempt.
    if (!isLegacyAccountError(error)) throw error;
  }

  const account = await stripe.accounts.retrieve(accountId);
  const due = stringList(account.requirements?.currently_due);
  const ready = Boolean(
    account.details_submitted && account.charges_enabled
      && account.payouts_enabled && due.length === 0,
  );
  return {
    accountId,
    api: "v1",
    ready,
    detailsSubmitted: Boolean(account.details_submitted),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    requirementsDue: due,
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export async function createRestaurantConnectOnboardingLink(
  stripe: Stripe,
  status: ConnectStatus,
  returnUrl: string,
): Promise<string> {
  if (status.api === "v1") {
    const link = await stripe.accountLinks.create({
      account: status.accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due", future_requirements: "include" },
    });
    return link.url;
  }
  const link = await stripe.v2.core.accountLinks.create({
    account: status.accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: returnUrl,
        return_url: returnUrl,
      },
    },
  });
  if (!link.url) throw new Error("STRIPE_CONNECT_ACCOUNT_LINK_MISSING_URL");
  return link.url;
}
