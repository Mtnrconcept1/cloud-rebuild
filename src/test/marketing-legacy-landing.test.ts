import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
describe("legacy social campaign landing", () => {
  it("redirects the exact broken campaign path to the existing public conversion page", () => {
    const rule = config.redirects.find((entry: { source: string }) => entry.source === "/restaurateurs-geneve");
    expect(rule).toMatchObject({ destination: "/restaurateurs/geneve", permanent: true });
    expect(rule).not.toHaveProperty("missing");
    expect(readFileSync("src/App.tsx", "utf8")).toContain('path="/restaurateurs/geneve"');
    expect(readFileSync("src/pages/RestaurateursGeneve.tsx", "utf8")).toContain('id="demande-demo"');
  });
  it("keeps the canonical pre-rendered B2B page out of the SPA fallback", () => {
    expect(config.rewrites).not.toContainEqual({ source: "/restaurateurs/geneve", destination: "/index.html" });
  });
});
