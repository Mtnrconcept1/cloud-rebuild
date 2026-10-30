import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getCampaignSpendableChf,
  getCreditCommittedAmount,
  isCampaignCreditExhausted,
} from "../../supabase/functions/_shared/campaign-credit-policy";

const credits = (balance: unknown, metadata: unknown) => ({
  credits: [{ kind: "tok_credits", balance, metadata }],
});

describe("TOK advertising credits policy", () => {
  it("never treats 500 promotional AI credits as a funded campaign wallet", () => {
    // Real production failure: displayed 500, pre-activation, zero spendable.
    const usage = credits(500, {
      preactivation: true, real_tok_balance: 15, campaign_spendable_balance: 0,
    });
    expect(getCampaignSpendableChf(usage)).toBe(0);
    expect(getCampaignSpendableChf(credits(500, { preactivation: true }))).toBe(0);
  });

  it("uses the ledger's explicit spendable amount even after preactivation", () => {
    expect(getCampaignSpendableChf(credits(500, {
      preactivation: false, campaign_spendable_balance: 150,
    }))).toBe(10);
    expect(getCampaignSpendableChf(credits(500, {
      preactivation: false, campaign_spendable_balance: 0,
    }))).toBe(0);
    expect(getCampaignSpendableChf(credits(250, {
      campaign_spendable_balance: null,
    }))).toBe(0);
  });

  it("retains legitimate active and legacy campaign allowances, but not malformed data", () => {
    expect(getCampaignSpendableChf(credits(150, { preactivation: false }))).toBe(10);
    expect(getCampaignSpendableChf({
      credits: [{ kind: "campaign", balance: 12.5 }],
    })).toBe(12.5);
    expect(getCampaignSpendableChf(credits("Infinity", null))).toBe(0);
    expect(getCampaignSpendableChf(credits(-300, null))).toBe(0);
    expect(getCampaignSpendableChf(null)).toBe(0);
  });

  it("reuses an already-paid campaign commitment including paid_amount", () => {
    expect(getCreditCommittedAmount({
      payment_method: "credits", payment_status: "paid",
      total_budget: 30, spent: 42, paid_amount: 135,
    })).toBe(135);
    expect(getCreditCommittedAmount({
      payment_method: "credits", payment_status: "paid",
      total_budget: 30, spent: 42, paid_amount: 12,
    })).toBe(42);
    expect(getCreditCommittedAmount({
      payment_method: "credits", payment_status: "unpaid",
      total_budget: 500, spent: 0, paid_amount: 0,
    })).toBe(0);
    expect(getCreditCommittedAmount({
      payment_method: "card", payment_status: "paid",
      total_budget: 500,
    })).toBe(0);
  });

  it("only recognizes a known ledger credits refusal; unrelated database failures remain failures", () => {
    expect(isCampaignCreditExhausted({ code: "P0001",
      message: "TOK credits exhausted for restaurant (fixture): required 2025, available 0",
    })).toBe(true);
    expect(isCampaignCreditExhausted({ code: "P0001", message: "other payment invariant" })).toBe(false);
    expect(isCampaignCreditExhausted({ code: "23514", message: "check constraint" })).toBe(false);
    expect(isCampaignCreditExhausted(null)).toBe(false);
  });

  it("keeps the server's paid-campaign DB checks, mutation translation and the client in sync", () => {
    const server = readFileSync("supabase/functions/campaign-portal/index.ts", "utf8");
    const dashboard = readFileSync("src/pages/dashboard/DashboardCampagnes.tsx", "utf8");
    const trigger = readFileSync(
      "supabase/migrations/20261014110000_restaurant_preactivation_weekly_ai_credits.sql", "utf8",
    );
    expect(server).toContain("getCampaignSpendableChf(data)");
    expect(server).toContain("getCreditCommittedAmount(existingCampaign)");
    expect(server).toContain("if (isCampaignCreditExhausted(error))");
    expect(server).toContain('throw new HttpError(402, "Credits campagnes insuffisants.');
    expect(server).toContain("if (error) throwCampaignPersistenceError(error)");
    expect(dashboard).toContain("campaign_spendable_balance");
    expect(dashboard).toContain("Object.prototype.hasOwnProperty.call(metadata,");
    expect(trigger).toContain("campaign_spendable_balance");
    expect(trigger).toContain("TOK credits exhausted");
  });
});
