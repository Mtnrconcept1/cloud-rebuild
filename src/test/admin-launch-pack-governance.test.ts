import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  if (!file) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
}

describe("admin Launch Pack governance", () => {
  it("adds audited RPCs for status, fulfillment and feature locks", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_launch_pack_status/i);

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_launch_pack_status/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_launch_pack_fulfillment/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_restaurant_disabled_features/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(sql).toContain("Pending payment launch packs must be updated by payment webhooks");
    expect(sql).toContain("Invalid fulfillment status");
    expect(sql).toContain("Invalid feature key");
  });

  it("routes the admin hook through RPCs instead of direct updates", () => {
    const hook = read("src/hooks/useAdminLaunchPacks.ts");

    expect(hook).toContain("admin_update_launch_pack_fulfillment");
    expect(hook).toContain("admin_update_restaurant_disabled_features");
    expect(hook).toContain("admin_update_launch_pack_status");
    expect(hook).not.toContain('.from("launch_pack_service_fulfillments").update');
    expect(hook).not.toContain('.from("restaurants").update({ disabled_dashboard_features');
    expect(hook).not.toContain('.from("restaurant_launch_packs").update');
  });

  it("uses the admin packs route as a restaurant subscription console", () => {
    const hook = read("src/hooks/useAdminLaunchPacks.ts");
    const page = read("src/pages/admin/AdminLaunchPacks.tsx");
    const adminHome = read("src/pages/admin/AdminHome.tsx");
    const adminMobileNavigation = read("src/components/admin/AdminMobileNavigation.tsx");

    expect(hook).toContain("useAdminRestaurantSubscriptions");
    expect(hook).toContain('"restaurant_ai_subscriptions"');
    expect(hook).toContain('"restaurant_subscription_plans"');
    expect(page).toContain("Abonnements restaurateur");
    expect(page).toContain("Les packs de lancement ne sont plus commercialisés");
    expect(page).toContain("CRM clients et Actualités restent réservés aux abonnements Premium et Élite");
    expect(page).toContain("computeDisabledFeatures([], { subscription: getSubscriptionAccess(subscription) })");
    expect(adminHome).toContain('title: "Abonnements restaurateur"');
    expect(adminMobileNavigation).toContain('label: "Abonnements restaurateur"');
  });
});
