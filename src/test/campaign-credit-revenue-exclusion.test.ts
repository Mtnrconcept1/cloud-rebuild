import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("campagnes financees par des credits TOK", () => {
  const migration = read(
    "supabase/migrations/20260729100000_exclude_credit_funded_campaigns_from_revenue.sql",
  );
  const shared = read("src/pages/admin/adminComptaShared.ts");
  const compta = read("src/pages/admin/AdminCompta.tsx");

  it("sort la depense de credits du chiffre d'affaires mensuel officiel", () => {
    // Une campagne reglee en credits porte payment_status = 'paid' comme une
    // campagne reglee par carte : le statut seul ne suffit pas a distinguer un
    // encaissement d'une consommation de solde deja paye.
    expect(migration).toContain("build_accounting_month_official_totals");
    expect(migration).toContain(
      "'paid_amount', COALESCE(sum(COALESCE(ac.paid_amount, ac.total_budget, 0)) FILTER (WHERE COALESCE(ac.payment_method, '') <> 'credits'), 0)",
    );
    expect(migration).toContain(
      "'count', count(*) FILTER (WHERE COALESCE(ac.payment_method, '') <> 'credits')",
    );

    // Le montant est deplace, pas supprime : la consommation de credits reste
    // mesurable sans etre comptee en recette.
    expect(migration).toContain("'credit_funded_amount'");
    expect(migration).toContain("'credit_funded_count'");
  });

  it("empeche de refacturer une campagne deja reglee avec le solde TOK", () => {
    // Ces montants alimentent « Encore a facturer », derriere un bouton de
    // generation de factures : les y laisser exposerait a un vrai second
    // prelevement, pas seulement a un total errone.
    expect(shared).toContain("export function isCreditFundedCampaign");
    expect(shared).toContain('=== "credits"');
    expect(shared).toContain("if (isCreditFundedCampaign(campaign)) return;");

    // La colonne doit etre rapatriee, sinon le filtre ne peut rien decider.
    expect(shared).toContain("payment_method: string | null;");
    expect(shared).toMatch(/payment_status,\s*\n\s*payment_method,/);
  });

  it("exclut ces campagnes du resume de chiffre d'affaires", () => {
    // buildTokRevenueSummary agrege deja l'abonnement Tok One et les achats de
    // credits. Y ajouter la depense de credits compterait la meme recette deux
    // fois : une fois a l'encaissement, une fois a la depense.
    expect(shared).toContain("buildTokRevenueSummary");
    expect(shared).toContain(".filter((campaign) => !isCreditFundedCampaign(campaign))");
    expect(shared).toContain("creditFundedCampaignsTotal");
    expect(shared).toContain("creditFundedCampaignsCount");
  });

  it("dit a l'admin pourquoi le montant n'apparait pas en recette", () => {
    // Un ecart silencieux entre ce qui est depense et ce qui est compte se lit
    // comme un bug : l'ecran doit porter l'explication.
    expect(compta).toContain("creditFundedCampaignsTotal");
    expect(compta).toContain("financés par crédits TOK");
    expect(compta).toContain("hors chiffre d'affaires");
  });
});
