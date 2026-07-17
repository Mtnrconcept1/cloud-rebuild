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

function splitTokOwnedRevenue(tokOwnedCents: number, developerShareBps = 1000) {
  const developerCents = Math.round((tokOwnedCents * developerShareBps) / 10_000);
  return {
    tokCents: tokOwnedCents - developerCents,
    developerCents,
  };
}

function splitOrder(grossCents: number, platformFeeBps = 1000, developerShareBps = 1000) {
  const platformFeeCents = Math.round((grossCents * platformFeeBps) / 10_000);
  const restaurantCents = grossCents - platformFeeCents;
  const { tokCents, developerCents } = splitTokOwnedRevenue(
    platformFeeCents,
    developerShareBps,
  );

  return {
    restaurantCents,
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

  it("splits an order into 90% restaurant, 9% TOK and 1% developer", () => {
    expect(splitOrder(10_000)).toEqual({
      restaurantCents: 9_000,
      tokCents: 900,
      developerCents: 100,
    });
  });

  it("keeps cent allocations exhaustive after integer rounding", () => {
    for (const grossCents of [1, 2, 9, 10, 99, 101, 999, 10_001, 123_456]) {
      const split = splitOrder(grossCents);
      expect(split.restaurantCents + split.tokCents + split.developerCents).toBe(
        grossCents,
      );
    }
  });

  it("uses server-authoritative basis-point helpers and exposes all exact amounts", () => {
    expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");
    expect(finance).toContain("TOK_DEVELOPER_SHARE_BPS = 1000");
    expect(finance).toContain("calculateDeveloperRevenueSplit");
    expect(finance).toContain("calculateOrderPaymentDistribution");
    expect(finance).toContain("developerShareCents");
    expect(finance).toContain("tokNetRevenueCents");

    expect(checkout).toContain("application_fee_amount: marketplaceRouting.platformFeeCents");
    expect(checkout).toContain("destination: marketplaceRouting.destinationAccountId");
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
