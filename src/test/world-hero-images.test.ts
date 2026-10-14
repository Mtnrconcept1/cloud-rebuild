import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WORLD_HERO_CATALOG, resolveWorldHero } from "@/lib/worldHeroImages";

describe("TOK worldwide homepage visuals", () => {
  it("includes 51 countries with independently stored WebP files", () => {
    expect(Object.keys(WORLD_HERO_CATALOG)).toHaveLength(51);
    const paths = new Set<string>();
    for (const cities of Object.values(WORLD_HERO_CATALOG)) {
      for (const art of Object.values(cities)) {
        for (const url of [art.desktop, art.mobile].filter(Boolean) as string[]) {
          expect(url).toMatch(/^\/images\/world\/.*\.webp$/);
          expect(existsSync(resolve(process.cwd(), "public", url.slice(1)))).toBe(true);
          paths.add(url);
        }
      }
    }
    expect(paths.size).toBeGreaterThanOrEqual(54);
  });
  it("resolves user profile cities before country fallback", () => {
    expect(resolveWorldHero({city:"Paris"})?.desktop).toContain("/France/paris/");
    expect(resolveWorldHero({city:"Lisbonne, Portugal"})?.desktop).toContain("/Portugal/lisbonne/");
    expect(resolveWorldHero({city:"Tokyo, Japon"})?.desktop).toContain("/Japon/tokyo/");
    expect(resolveWorldHero({city:"Lausanne, Suisse"})?.desktop).toContain("/Suisse/");
  });
  it("supports GPS country code and safe unknown-location fallback", () => {
    expect(resolveWorldHero({countryCode:"BR"})?.desktop).toContain("/Bresil/");
    expect(resolveWorldHero({city:"Somewhere unknown", country:"France"})?.desktop).toContain("/France/");
    expect(resolveWorldHero({city:"Completely unknown"})).toBeNull();
  });
});
