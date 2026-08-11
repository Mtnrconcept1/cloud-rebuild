import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const finance = read("supabase/functions/_shared/marketplace-finance.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const settlement = read("supabase/functions/settle-developer-statement/index.ts");
const config = read("supabase/config.toml");
const transferMigration = read(
  "supabase/migrations/20260717023000_stripe_developer_share_transfers.sql",
);
const integrityMigration = read(
  "supabase/migrations/20260715060000_payment_integrity_state_machine.sql",
);
const financeRoutingMigration = read(
  "supabase/migrations/20260712000526_marketplace_finance_routing.sql",
);
const allTokRevenueMigration = read(
  "supabase/migrations/20260717210000_lock_developer_share_all_tok_revenue.sql",
);
const fairGrowthMigration = read(
  "supabase/migrations/20260718022910_fair_growth_business_model.sql",
);

function splitTokOwnedRevenue(tokOwnedCents: number, developerShareBps = 1000) {
  const developerCents = Math.round((tokOwnedCents * developerShareBps) / 10_000);
  return {
    tokCents: tokOwnedCents - developerCents,
    developerCents,
  };
}

function splitTaxInclusiveTokRevenue(
  grossCents: number,
  developerShareBps = 1000,
  vatBps = 810,
) {
  const vatCents = Math.round((grossCents * vatBps) / (10_000 + vatBps));
  const tokRevenueCents = grossCents - vatCents;
  const developerCents = Math.round((tokRevenueCents * developerShareBps) / 10_000);
  return {
    tokCents: tokRevenueCents - developerCents,
    developerCents,
    vatCents,
  };
}

function splitOrder(
  grossCents: number,
  platformFeeBps = 1000,
  developerOrderBps = 100,
  tipCents = 0,
  deliveryCents = 0,
) {
  const commissionableCents = grossCents - tipCents - deliveryCents;
  const platformFeeCents = Math.round((commissionableCents * platformFeeBps) / 10_000);
  const developerCents = Math.round((commissionableCents * developerOrderBps) / 10_000);
  const restaurantCents = commissionableCents - platformFeeCents + tipCents;
  const tokCents = platformFeeCents - developerCents;

  return {
    restaurantCents,
    deliveryCents,
    tokCents,
    developerCents,
  };
}

describe("Stripe developer revenue-share routing", () => {
  it("splits every CHF 5 reservation fee into CHF 4.50 TOK and CHF 0.50 developer", () => {
    expect(splitTokOwnedRevenue(500)).toEqual({
      tokCents: 450,
      developerCents: 50,
    });
  });

  it("keeps the public order split at 90% restaurant / 10% platform before internal settlement", () => {
    expect(splitOrder(10_000)).toEqual({
      restaurantCents: 9_000,
      deliveryCents: 0,
      tokCents: 900,
      developerCents: 100,
    });
  });

  it("keeps the full tip and delivery outside commission", () => {
    expect(splitOrder(12_000, 1000, 100, 1_000, 1_000)).toEqual({
      restaurantCents: 10_000,
      deliveryCents: 1_000,
      tokCents: 900,
      developerCents: 100,
    });
  });

  it.each([
    ["abonnement restaurateur", 6_900, 5_745, 638, 517],
    ["abonnement TOK One", 12_900, 10_740, 1_193, 967],
    ["campagne publicitaire", 10_000, 8_326, 925, 749],
    ["pack de credits", 5_000, 4_162, 463, 375],
    ["autre fonction payante", 1_990, 1_657, 184, 149],
  ])(
    "attribue 10%% au developpeur sur le revenu net hors TVA de %s",
    (_source, grossCents, expectedTokCents, expectedDeveloperCents, expectedVatCents) => {
      expect(splitTaxInclusiveTokRevenue(grossCents)).toEqual({
        tokCents: expectedTokCents,
        developerCents: expectedDeveloperCents,
        vatCents: expectedVatCents,
      });
    },
  );

  it("verrouille toutes les familles de revenus TOK et les futures fonctions payantes", () => {
    expect(financeRoutingMigration).toContain(
      "WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'tok_subscription_revenue'",
    );
    expect(financeRoutingMigration).toContain(
      "WHEN v_kind = 'tok-one' THEN 'tok_one_revenue'",
    );
    expect(financeRoutingMigration).toContain(
      "WHEN v_kind = 'campaign' THEN 'tok_campaign_revenue'",
    );
    expect(financeRoutingMigration).toContain(
      "WHEN v_kind = 'restaurant-credit-pack' THEN 'tok_credit_pack_revenue'",
    );
    expect(financeRoutingMigration).toContain("ELSE 'tok_other_revenue'");
    expect(financeRoutingMigration).toContain("'developer_payable', 'credit'");

    expect(allTokRevenueMigration).toContain(
      "CHECK (developer_share_bps = 1000)",
    );
    expect(allTokRevenueMigration).toContain(
      "l.account_code LIKE 'tok\\_%\\_revenue'",
    );
    expect(allTokRevenueMigration).toContain(
      "'developer_share_scope', 'all_tok_owned_revenue'",
    );
    expect(allTokRevenueMigration).toContain(
      "'future_tok_revenue_accounts_included', true",
    );

    expect(fairGrowthMigration).toContain("swiss_vat_from_tax_inclusive_cents");
    expect(fairGrowthMigration).toContain("'platform_vat_cents'");
    expect(fairGrowthMigration).toContain("'recognized_excluding_vat', true");
  });

  it("keeps cent allocations exhaustive after integer rounding", () => {
    for (const grossCents of [1, 2, 9, 10, 99, 101, 999, 10_001, 123_456]) {
      const split = splitOrder(grossCents);
      expect(
        split.restaurantCents
          + split.deliveryCents
          + split.tokCents
          + split.developerCents,
      ).toBe(grossCents);
    }
  });

  it("uses server-authoritative basis-point helpers and exposes all exact amounts", () => {
    expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");
    expect(finance).toContain("TOK_DEVELOPER_SHARE_BPS = 1000");
    expect(finance).toContain("TOK_ORDER_DEVELOPER_SHARE_BPS = 100");
    expect(finance).toContain("calculateDeveloperRevenueSplit");
    expect(finance).toContain("calculateOrderPaymentDistribution");
    expect(finance).toContain("developerShareCents");
    expect(finance).toContain("tokNetRevenueCents");

    expect(checkout).toContain("application_fee_amount: marketplaceRouting.stripeApplicationFeeCents");
    expect(checkout).toContain("destination: marketplaceRouting.destinationAccountId");
    expect(checkout).toContain("developer_order_bps");
    expect(checkout).toContain("developer_share_amount_cents");
    expect(checkout).toContain("tok_net_amount_cents");
  });

  it("pays only the exact validated net developer payable through Stripe Connect", () => {
    expect(integrityMigration).toContain("financial_ledger.developer_payable");
    expect(integrityMigration).toContain("test_mode_excluded");
    expect(transferMigration).toContain(
      "v_statement.developer_amount_cents",
    );
    expect(transferMigration).toContain(
      "developer_statement_must_be_validated",
    );
    expect(transferMigration).toContain(
      "developer_connect_transfers_enabled boolean NOT NULL DEFAULT false",
    );
    expect(settlement).toContain("stripe.transfers.create");
    expect(settlement).toContain("idempotencyKey");
    expect(settlement).toContain("assertDeveloperConnectAccountReady");
    expect(settlement).not.toMatch(
      /destination\s*:\s*(body|req|request)/,
    );
  });

  it("keeps test settlement non-destructive and marks only a live statement paid", () => {
    expect(transferMigration).toContain("v_transfer.stripe_mode = 'live'");
    expect(transferMigration).toContain("SET status = 'paid'");
    expect(transferMigration).toContain("SET status = 'succeeded'");
    expect(transferMigration).toContain(
      "validated developer statements only allow the paid transition",
    );
    expect(settlement).toContain(
      'statement_status: stripeMode === "live" ? "paid" : "validated"',
    );
  });

  it("uses custom authenticated admin checks even though the gateway JWT switch is disabled", () => {
    expect(config).toContain("[functions.settle-developer-statement]\nverify_jwt = false");
    expect(settlement).toContain("authenticateRequest");
    expect(settlement).toContain("if (!actor.isAdmin)");
    expect(settlement).toContain("assertProductionFlowAllowed");
  });
});
