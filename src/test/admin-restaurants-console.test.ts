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

function extractFunction(sql: string, functionName: string) {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\nEND;\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("admin restaurants console", () => {
  it("adds audited admin RPCs for restaurant detail, critical updates and action history", () => {
    const detailSql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_restaurant_admin_detail/i,
    );
    const updateSql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_restaurant_admin_state/i,
    );

    const detailFn = extractFunction(detailSql, "admin_get_restaurant_admin_detail");
    const updateFn = extractFunction(updateSql, "admin_update_restaurant_admin_state");
    const actionSql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_record_restaurant_admin_action[\s\S]*public\.enqueue_notification/i,
    );
    const actionFn = extractFunction(actionSql, "admin_record_restaurant_admin_action");

    expect(detailFn).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(detailFn).toMatch(/quality[\s\S]*missing_fields[\s\S]*publishable/i);
    expect(detailFn).toMatch(/orders_summary/i);
    expect(detailFn).toMatch(/reservations_summary/i);
    expect(detailFn).toMatch(/reviews_summary/i);
    expect(detailFn).toMatch(/campaigns_summary/i);
    expect(detailFn).toMatch(/payment_health/i);
    expect(detailFn).toMatch(/recent_history/i);
    expect(detailFn).toMatch(/p\.recipient_id\s*=\s*p_restaurant_id\s+AND/i);
    expect(detailFn).not.toMatch(/p\.recipient_id\s*=\s*p_restaurant_id::text/i);

    expect(updateFn).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(updateFn).toMatch(/jsonb_object_keys\(p_patch\)/i);
    expect(updateFn).toMatch(/v_disallowed_keys/i);
    expect(updateFn).toMatch(/v_activation_requested/i);
    expect(updateFn).toMatch(/p_override\s+IS\s+NOT\s+TRUE/i);
    expect(updateFn).toMatch(/p_reason\s+IS\s+NULL/i);
    expect(updateFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);

    expect(actionFn).toMatch(/v_action\s+NOT\s+IN\s+\('request_correction',\s*'reindex_catalog',\s*'send_notification'\)/i);
    expect(actionFn).toMatch(/SELECT[\s\S]*owner_id[\s\S]*INTO[\s\S]*v_owner_id/i);
    expect(actionFn).toMatch(/public\.enqueue_notification/i);
    expect(actionFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(detailSql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_restaurant_admin_detail\(uuid\)\s+FROM\s+anon/i);
    expect(updateSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_update_restaurant_admin_state/i);
    expect(actionSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_record_restaurant_admin_action/i);
  });

  it("uses the audited RPCs and exposes the restaurant detail operations console", () => {
    const source = readFileSync(resolve(root, "src/pages/admin/AdminRestaurants.tsx"), "utf8");

    expect(source).toContain("admin_get_restaurant_admin_detail");
    expect(source).toContain("admin_update_restaurant_admin_state");
    expect(source).toContain("admin_record_restaurant_admin_action");
    expect(source).not.toContain('.from("restaurants").update');
    expect(source).toContain("RestaurantDetailPanel");
    expect(source).toContain("buildFallbackRestaurantAdminDetail");
    expect(source).toContain("fallbackRestaurant");
    expect(source).toContain("restaurantDetailError");
    expect(source).toContain("Données détaillées indisponibles");
    expect(source).not.toContain("Détail technique");
    expect(source).toContain("isLoading && !detail");
    expect(source).toContain("Fiche restaurant");
    expect(source).toContain("DialogContent");
    expect(source).toContain("max-w-6xl");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
    expect(source).toContain("onOpenChange={(open) => {");
    expect(source).not.toContain("selectedRestaurantId ? (\n        <RestaurantDetailPanel");
    expect(source).toContain("Santé paiement");
    expect(source).toContain("Historique");
    expect(source).toContain("Demander correction");
    expect(source).toContain("Réindexer catalogue");
    expect(source).toContain("overrideReason");
  });
});
