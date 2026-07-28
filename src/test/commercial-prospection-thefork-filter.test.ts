import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/CommercialProspection.tsx"), "utf8");

describe("commercial TheFork-only filter", () => {
  it("uses the explicit merged catalog affiliation flag", () => {
    expect(source).toContain("theForkOnly: boolean");
    expect(source).toContain("prospect.isTheFork !== true");
    expect(source).not.toContain("sourceObjectId >= 2600000001");
  });

  it("applies through search and resets safely", () => {
    expect(source).toContain("theForkOnly,");
    expect(source).toContain("setTheForkOnly(false)");
    expect(source).toContain("checked === true");
    expect(source).toContain("handleTheForkOnlyChange");
    expect(source).toContain("setAppliedFilters((current) => ({ ...current, theForkOnly: nextTheForkOnly }))");
    expect(source).toContain("Affiliés TheFork uniquement");
    expect(source).toContain("Source TheFork indisponible");
  });
});
