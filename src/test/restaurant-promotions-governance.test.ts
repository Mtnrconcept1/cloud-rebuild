import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  if (!file) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
}

describe("restaurant promotion governance", () => {
  it("adds server-side constraints for type, target, value and date ranges", () => {
    const sql = latestMigrationContaining(/restaurant_promotions_value_check/i);

    expect(sql).toMatch(/promotion_type\s+IN\s+\('percentage',\s*'fixed',\s*'free_delivery'\)/i);
    expect(sql).toMatch(/target\s+IN\s+\('all',\s*'new',\s*'returning'\)/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'percentage'[\s\S]*promotion_value\s*>\s*0[\s\S]*promotion_value\s*<=\s*100/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'fixed'[\s\S]*promotion_value\s*>\s*0/i);
    expect(sql).toMatch(/promotion_type\s+=\s+'free_delivery'[\s\S]*promotion_value\s*=\s*0/i);
    expect(sql).toMatch(/end_at\s*>=\s*start_at/i);
    expect(sql).toContain("NOT VALID");
  });

  it("normalizes free delivery promotions to zero value before saving", () => {
    const page = read("src/pages/dashboard/DashboardPromotions.tsx");

    expect(page).toContain('promoType === "free_delivery" ? 0 : Number(promoValue)');
    expect(page).toContain('disabled={promoType === "free_delivery"}');
  });

  it("surfaces active dashboard promotions directly on restaurant detail pages", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain('queryKey: ["restaurant-active-promotions", restaurantId, demoSessionKey]');
    expect(restaurantDetail).toContain('.from("restaurant_promotions")');
    expect(restaurantDetail).toContain('.eq("restaurant_id", restaurantId!)');
    expect(restaurantDetail).toContain('.eq("active", true)');
    expect(restaurantDetail).toContain('.lte("start_at", now)');
    expect(restaurantDetail).toContain('.gte("end_at", now)');
    expect(restaurantDetail).toContain(".limit(RESTAURANT_PROMOTIONS_LIMIT)");
    expect(restaurantDetail).toContain("Promotions");
    expect(restaurantDetail).toContain("Offres disponibles");
    expect(restaurantDetail).toContain('offre{activePromotions.length > 1 ? "s" : ""}');
    expect(restaurantDetail).not.toContain("Ces remises restent visibles sur la fiche tant qu'elles sont actives.");
    expect(restaurantDetail).toContain("formatRestaurantPromotionValue(promotion)");
    expect(restaurantDetail).toContain("RESTAURANT_PROMOTION_TARGET_LABELS[promotion.target]");
  });

  it("shows active promotions on the restaurateur restaurant profile", () => {
    const dashboardRestaurant = read("src/pages/dashboard/DashboardRestaurant.tsx");

    expect(dashboardRestaurant).toContain('queryKey: ["dashboard-restaurant-active-promotions", selectedId]');
    expect(dashboardRestaurant).toContain('.from("restaurant_promotions")');
    expect(dashboardRestaurant).toContain('.eq("restaurant_id", selectedId!)');
    expect(dashboardRestaurant).toContain('.eq("active", true)');
    expect(dashboardRestaurant).toContain('.lte("start_at", now)');
    expect(dashboardRestaurant).toContain('.gte("end_at", now)');
    expect(dashboardRestaurant).toContain(".limit(DASHBOARD_RESTAURANT_PROMOTIONS_LIMIT)");
    expect(dashboardRestaurant).toContain("Promotions visibles");
    expect(dashboardRestaurant).toContain("Actives sur la fiche restaurant");
    expect(dashboardRestaurant).toContain("formatDashboardPromotionValue(promotion)");
  });

  it("keeps La Gazelle d'Or seed promotions compatible with production constraints", () => {
    const seed = read("supabase/migrations/20260607212249_seed_la_gazelle_dor_restaurant.sql");

    expect(seed).toContain("promotion_type = 'percentage'");
    expect(seed).toContain("'percentage',");
    expect(seed).toContain("target = 'all'");
    expect(seed).toContain("'all',");
    expect(seed).not.toContain("promotion_type = 'percent'");
    expect(seed).not.toContain("'percent',");
    expect(seed).not.toContain("target = 'reservation'");
    expect(seed).not.toContain("'reservation',");
  });
});
