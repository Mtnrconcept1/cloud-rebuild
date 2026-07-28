import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FAIR_GROWTH_MODULES } from "@/lib/fairGrowth";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Fair Growth paid module activation", () => {
  const dashboard = read("src/pages/dashboard/DashboardPack.tsx");
  const publicPacks = read("src/pages/PacksRestaurateur.tsx");
  const faq = read("src/pages/Aide.tsx");
  const terms = read("src/pages/ConditionsRestaurateurs.tsx");
  const signup = read("src/pages/Auth.tsx");

  it("keeps every module on manual activation and exposes pilots honestly", () => {
    expect(FAIR_GROWTH_MODULES.every((module) => module.activationMode === "manual")).toBe(true);
    expect(
      FAIR_GROWTH_MODULES
        .filter((module) => module.availabilityStatus === "pilot")
        .map((module) => module.slug),
    ).toEqual([
      "ai-phone-receptionist",
      "direct-order-saver",
      "gift-cards-experiences",
    ]);
  });

  it("records a dashboard request without activating or billing it", () => {
    expect(dashboard).toContain("request_fair_growth_module");
    expect(dashboard).toContain("La demande n'active pas");
    expect(dashboard).toContain("n'autorise aucun débit");
    expect(dashboard).toContain("Demander l'accès pilote");
    expect(dashboard).toContain("aucune activation automatique");
  });

  it("marks every admin-enabled module active in demo without creating live billing", () => {
    expect(dashboard).toContain("enabled: Boolean(selectedId) && !isDemoMode");
    expect(dashboard).toContain("const demoSubscriptions = isDemoMode");
    expect(dashboard).toContain('module.availability_status === "available" ? "active" : "requested"');
    expect(dashboard).toContain("if (!selectedId || requestingSlug || isDemoMode) return");
    expect(dashboard).toContain("const canRequest = !isDemoMode");
    expect(dashboard).toContain("disabled={pending || (!canRequest && !action)");
    expect(dashboard).toContain("Non opérationnel");
    expect(dashboard).toContain("Actif dans le restaurant Démo");
    expect(dashboard).toContain("Stripe Test");
  });

  it("offers only valid lifecycle actions and links operational modules to their tool", () => {
    expect(dashboard).toContain("`${action}_fair_growth_module`");
    expect(dashboard).toContain("Mettre en pause");
    expect(dashboard).toContain("Reprendre");
    expect(dashboard).toContain("Tarif accepté");
    expect(dashboard).toContain("Ouvrir l’outil");
    expect(dashboard).toContain('module.availability_status === "available"');
  });

  it("states pilot and Elite multi-site limitations on public surfaces", () => {
    expect(publicPacks).toContain('"Pilote" : "Sur demande"');
    expect(publicPacks).toContain("Une demande ne déclenche aucun débit");
    expect(publicPacks).toContain("Rattachement multi-site");
    expect(publicPacks).toContain("avant toute facturation additionnelle");
    expect(signup).toContain("Sites rattachés après validation TOK ; aucun supplément sans confirmation");
    expect(faq).toContain("En pilote, après validation technique");
    expect(faq).toContain("enregistre uniquement une demande");
    expect(faq).toContain("Le rattachement des sites et tout supplément sont validés avec TOK avant facturation");
    expect(terms).toContain("offres pilote soumises à validation technique et contractuelle");
    expect(terms).toContain("n'autorise aucun debit");
    expect(terms).toContain("apres activation facturee");
  });
});
