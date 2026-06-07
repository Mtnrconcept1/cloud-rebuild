import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readLatestMigrationContaining(pattern: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(pattern));

  expect(migrationName, `a migration containing ${pattern} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

describe("La Gazelle d'Or public restaurant page", () => {
  it("seeds the restaurant as an active reservable Geneva listing with a stable slug", () => {
    const sql = readLatestMigrationContaining("La Gazelle d''Or");

    expect(sql).toContain("https://www.thefork.ch/restaurant/la-gazelle-d-or-r849111");
    expect(sql).toContain("La Gazelle d''Or");
    expect(sql).toContain("Rue de Lyon 55");
    expect(sql).toContain("1203");
    expect(sql).toContain("Geneve");
    expect(sql).toContain("Ethiopien");
    expect(sql).toContain("Cuisine érythréenne et éthiopienne");
    expect(sql).toContain("rating = t.rating");
    expect(sql).toContain("review_count = t.review_count");
    expect(sql).toContain("supports_reservation = true");
    expect(sql).toContain("slug = 'la-gazelle-d-or'");
  });

  it("adds the public menu anchors and the visible restaurant offer", () => {
    const sql = readLatestMigrationContaining("La Gazelle d''Or");

    expect(sql).toContain("Sambusa fait maison");
    expect(sql).toContain("Sambusa végétarienne");
    expect(sql).toContain("Timatum salade");
    expect(sql).toContain("Salade du chef");
    expect(sql).toContain("Carte de vin rouge, blanc ou rosé");
    expect(sql).toContain("Café traditionnel");
    expect(sql).toContain("promotion_value");
    expect(sql).toContain("30.00");
    expect(sql).toContain("Gazelle d''Or -30% réservation");
  });

  it("keeps the existing restaurant detail route available for the seeded slug target", () => {
    const app = read("src/App.tsx");
    const slugHelper = read("src/lib/restaurantSlugs.ts");

    expect(app).toContain('<Route path="/restaurant/:id" element={<RestaurantDetail />} />');
    expect(slugHelper).toContain("/restaurants/");
  });
});
