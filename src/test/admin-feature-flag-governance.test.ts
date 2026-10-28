import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDir, name), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const matches = migrationFiles().filter((name) => pattern.test(readMigration(name)));
  expect(matches.length).toBeGreaterThan(0);
  return readMigration(matches[matches.length - 1]);
}

describe("admin feature flag governance", () => {
  it("decouples delivery orders from payments and preserves checkout confirmations", () => {
    const sql = readMigration("20261012063000_decouple_delivery_orders_flag.sql");
    const edge = readFileSync(resolve(root, "supabase/functions/validate-order/index.ts"), "utf8");
    const checkout = readFileSync(resolve(root, "supabase/functions/create-checkout/index.ts"), "utf8");
    const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");

    expect(sql).not.toContain("payment-card requires commandes checkout to stay enabled");
    expect(sql).toContain("'commandes',");
    expect(sql).toMatch(/WHEN 'commandes' THEN\s+RETURN public\.is_feature_flag_active\('livraison'\);/);
    expect(sql).toContain("INSERT INTO public.feature_flag_audit_logs");
    expect(edge).toContain('!activeFlags.has("commandes")');
    expect(edge).toContain('!activeFlags.has("emporter")');
    expect(checkout).toContain("assertPaymentMethodAllowed");
    expect(app).toContain('<ClientSurfaceRoute><OrderConfirmation /></ClientSurfaceRoute>');
    expect(app).not.toContain("enabled={commandesEnabled}");
  });

  it("adds audited feature flag history, presets and guarded admin RPCs", () => {
    const sql = latestMigrationContaining(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.feature_flag_audit_logs/i);

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.feature_flag_audit_logs/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_feature_flag_audit_logs/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_toggle_feature_flag\(text,\s*boolean,\s*text,\s*text\)/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_apply_feature_flag_preset/i);
    expect(sql).toMatch(/production stable/i);
    expect(sql).toMatch(/maintenance paiements/i);
    expect(sql).toMatch(/maintenance livraison/i);
    expect(sql).toMatch(/mode lecture seule/i);
    expect(sql).toMatch(/reason is required/i);
    expect(sql).toMatch(/payment-card.*commandes/i);
    expect(sql).toMatch(/actualites-sociales.*tracking/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.feature_flag_audit_logs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+public\.feature_flag_audit_logs\s+TO\s+authenticated/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_apply_feature_flag_preset/i);
  });

  it("wires presets, route impact and required reasons into the admin platform screen", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminPlatformConfig.tsx"), "utf8");
    const flags = readFileSync(resolve(root, "src/lib/featureFlags.ts"), "utf8");
    const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
    const adminHome = readFileSync(resolve(root, "src/pages/admin/AdminHome.tsx"), "utf8");

    expect(app).toContain('hasFeature("admin-platform-config")');
    expect(app).toContain("<FeatureSwitch enabled={adminPlatformConfigEnabled} fallback=\"/admin\"><AdminPlatformConfig /></FeatureSwitch>");
    expect(adminHome).toContain('feature: "admin-platform-config"');
    expect(flags).toContain("FEATURE_FLAG_PRESETS");
    expect(flags).toContain("validateFeatureFlagPreset");
    expect(flags).toContain("admin_get_feature_flag_audit_logs");
    expect(flags).toContain("admin_apply_feature_flag_preset");
    expect(flags).toContain("p_reason");

    expect(page).toContain("production stable");
    expect(page).toContain("maintenance paiements");
    expect(page).toContain("maintenance livraison");
    expect(page).toContain("mode lecture seule");
    expect(page).toContain("Routes impactees");
    expect(page).toContain("Historique");
    expect(page).toContain("Raison obligatoire");
    expect(page).toContain("applyFeatureFlagPreset");
    expect(page).toContain("flagAuditLogs");
    expect(adminHome).toContain("Jeux clients");
    expect(adminHome).toContain('flag.name === "plinko-welcome"');
    expect(adminHome).toContain('flag.name === "daily-slot-machine"');
    expect(adminHome).toContain("setFlagState");
  });
});
