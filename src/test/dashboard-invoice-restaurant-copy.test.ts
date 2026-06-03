import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("restaurant dashboard invoice copy", () => {
  it("does not expose internal Miamz accounting labels on the restaurateur page", () => {
    const source = readSource("src/pages/dashboard/DashboardFactures.tsx");

    expect(source).not.toContain("ce que Tok finance en Miamz");
    expect(source).not.toContain("Miamz pris en charge");
    expect(source).not.toContain("montant Miamz");
    expect(source).not.toContain("réduction Miamz");
    expect(source).not.toContain("reduction Miamz");
  });
});
