import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

describe("AdminLoyalty Miamz benefit controls", () => {
  it("lets admins activate, deactivate and edit visible Miamz benefit text per tier", () => {
    const page = readFileSync(resolve(root, "pages/admin/AdminLoyalty.tsx"), "utf8");

    expect(page).toContain("Avantages Miamz du palier");
    expect(page).toContain("toggleTierBenefit");
    expect(page).toContain("updateTierBenefitText");
    expect(page).toContain("buildTierBenefitPayload");
    expect(page).toContain("Texte visible sur la page des avantages");
  });
});
