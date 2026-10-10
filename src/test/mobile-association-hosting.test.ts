import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const apexRule = config.redirects.find((rule: {
  source: string;
  has?: { type: string; value: string }[];
}) => rule.source.startsWith("/:path(")
  && rule.has?.some(condition => condition.type === "host" && condition.value === "thetok.ch"));

describe("mobile domain association hosting", () => {
  it("serves the extensionless Apple association as JSON", () => {
    const rule = config.headers.find((item: { source: string }) => item.source === "/.well-known/apple-app-site-association");
    expect(rule?.headers).toContainEqual({ key: "Content-Type", value: "application/json; charset=utf-8" });
  });

  // The provider domain redirect must be removed only AFTER these rules are live.
  // This checks the route contract; HTTP smoke checks still validate Vercel's matcher.
  it.each(["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"])(
    "does not redirect association requests: %s", path => {
      expect(apexRule).toBeDefined();
      const pattern = new RegExp(`^/${apexRule.source.slice("/:path(".length, -1)}$`);
      expect(pattern.test(path)).toBe(false);
    },
  );

  it.each(["/", "/restaurants/geneve", "/dashboard/reservations", "/.well-known/oauth-protected-resource", "/.well-known/apple-app-site-association-extra"])(
    "preserves canonical redirect coverage for ordinary paths: %s", path => {
      expect(apexRule).toBeDefined();
      const pattern = new RegExp(`^/${apexRule.source.slice("/:path(".length, -1)}$`);
      expect(pattern.test(path)).toBe(true);
      expect(apexRule.destination).toBe("https://www.thetok.ch/:path");
      expect(apexRule.permanent).toBe(true);
    },
  );

  it("scopes the canonical fallback to the apex, leaving app and admin hosts available", () => {
    expect(apexRule.has).toEqual([{ type: "host", value: "thetok.ch" }]);
  });
});
