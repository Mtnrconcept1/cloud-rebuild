import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { calculateGoogleBusinessSavings } from "@/lib/googleBusinessEconomics";

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("pages commerciales restaurateurs", () => {
  it("compare les deux modèles Google avec le forfait TOK par table", () => {
    const comparison = calculateGoogleBusinessSavings({
      monthlyTables: 10,
      coversPerTable: 4,
      commissionPerCoverChf: 5,
      tokFeePerTableChf: 5,
      monthlyPackFeeChf: 69,
    });

    expect(comparison.perCoverModelCostChf).toBe(200);
    expect(comparison.tokModelCostChf).toBe(119);
    expect(comparison.monthlySavingsChf).toBe(81);
  });

  it("protège une comparaison honnête, uniquement sur les réservations réellement servies", () => {
    const alternativePage = readSource("src/pages/AlternativeCommissionCouvert.tsx");
    const googlePage = readSource("src/pages/RestaurateursGoogleBusiness.tsx");
    const genevePage = readSource("src/pages/RestaurateursGeneve.tsx");

    expect(alternativePage).toContain("const perCoverCost = honoredCovers * fee;");
    expect(alternativePage).toContain("les mêmes réservations réellement servies");
    expect(alternativePage).toContain("que la table compte 2 ou 8 personnes");
    expect(googlePage).toContain("tokFeePerTableChf: RESERVATION_FLAT_FEE_CHF");
    expect(googlePage).not.toContain("tokFeePerTableChf: 0");
    expect(googlePage).toContain("TOK : {monthlyTables.toLocaleString");
    expect(genevePage).toContain("Trois repères avant de comparer les offres.");
    expect(genevePage).toContain("5 CHF pour une table réellement servie");
  });
});
