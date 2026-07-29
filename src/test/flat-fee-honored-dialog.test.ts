import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cloture de table quand Mon pack est coupe", () => {
  const dialog = read("src/components/MarkReservationHonoredDialog.tsx");
  const list = read("src/pages/dashboard/DashboardReservations.tsx");

  it("cesse de promettre un calcul plafonne", () => {
    // Le serveur applique un forfait : ni le tarif du plan ni le plafond de 7 %
    // n'interviennent. L'ecran affichait pourtant l'inverse, ce qui laissait le
    // restaurateur croire que sa saisie determinait le montant facture.
    expect(dialog).toContain('isEnabled("dashboard-pack")');
    expect(dialog).toContain("FLAT_RESERVATION_FEE_CHF = 5");
    expect(dialog).toContain("sans plafond ni distinction de canal");

    // La formulation Fair Growth reste, mais seulement dans la branche ou elle
    // est vraie.
    expect(dialog).toContain("plafonné à 7%");
    expect(dialog).toContain("flatFee");
  });

  it("rend le chiffre d'affaires facultatif en forfait", () => {
    // Il n'entre plus dans aucun calcul de frais : l'exiger bloquait la cloture
    // sans rien apporter. Une saisie erronee reste refusee.
    expect(dialog).toContain("const valid = flatFee");
    expect(dialog).toContain("!revenueProvided || revenueUsable");
    expect(dialog).toContain("— facultatif");
  });

  it("aligne le libelle du bouton sur ce qui se passe reellement", () => {
    expect(list).toContain("honorCtaLabel");
    expect(list).toContain('"Clôturer la table"');
    expect(list).toContain('"Clôturer la table et calculer les frais"');
    expect(list).toContain('isFeatureEnabled("dashboard-pack")');
  });
});
