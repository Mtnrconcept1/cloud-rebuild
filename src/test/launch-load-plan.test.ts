import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("launch 10k load plan", () => {
  const plan = readFileSync(resolve(process.cwd(), "docs/testing/launch-10k-load-plan.md"), "utf8");
  const runner = readFileSync(resolve(process.cwd(), "scripts/launch-10k-load-check.mjs"), "utf8");
  const pkg = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

  it("documents the requested pre-launch concurrency and failure scenarios", () => {
    for (const expected of [
      "100 utilisateurs simultanes sur la homepage",
      "100 recherches restaurant en parallele",
      "50 paniers simultanes",
      "20 paiements Stripe test en parallele",
      "Webhook Stripe recu plusieurs fois",
      "Commande payee mais restaurant muet",
      "Restaurant qui refuse une commande payee",
      "Produit supprime pendant paiement",
      "Double reservation",
      "Upload massif d'images",
      "Connexion simultanee client, restaurateur et admin",
    ]) {
      expect(plan).toContain(expected);
      expect(runner).toContain(expected);
    }

    expect(pkg).toContain("\"test:launch:10k\"");
    expect(runner).toContain("TOK_LOAD_TEST_BASE_URL");
    expect(runner).toContain("TOK_LOAD_TEST_CHECKOUT_PAYLOAD");
    expect(runner).toContain("TOK_LOAD_TEST_AUTH_PAYLOADS");
    expect(runner).toContain("resolveScenarioPayloads");
    expect(plan).toContain("fixtures JSON");
    expect(runner).toContain("dryRun");
    expect(runner).toContain("refuseProduction");
  });
});
