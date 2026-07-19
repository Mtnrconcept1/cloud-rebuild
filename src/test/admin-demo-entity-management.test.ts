import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("admin demo entity management", () => {
  const usersPage = read("src/pages/admin/AdminUtilisateurs.tsx");
  const restaurantsPage = read("src/pages/admin/AdminRestaurants.tsx");
  const demoDialog = read("src/components/admin/AdminDemoEntitiesDialog.tsx");
  const realAssignment = read("src/components/admin/AdminRealRestaurantAssignment.tsx");
  const edge = read("supabase/functions/admin-demo-entities/index.ts");
  const productionMigration = read(
    "supabase/migrations/20260719150000_admin_real_restaurant_ownership.sql",
  );
  const demoMigrationPath =
    "supabase/demo-migrations/20260719151000_admin_demo_entity_management.sql";
  const demoMigration = read(demoMigrationPath);
  const demoClient = read("src/integrations/supabase/demoClient.ts");
  const authState = read("src/lib/auth.tsx");
  const app = read("src/App.tsx");
  const auth = read("src/pages/Auth.tsx");

  it("exposes demo creation and linking from both admin tabs", () => {
    expect(usersPage).toContain('<AdminDemoEntitiesDialog mode="users" />');
    expect(restaurantsPage).toContain('<AdminDemoEntitiesDialog mode="restaurants" />');
    expect(usersPage).toContain("<AdminRealRestaurantAssignment targetUserId={userId} />");
    expect(restaurantsPage).toContain("targetRestaurantId={detail.restaurant.id}");
    expect(demoDialog).toContain("Lier un restaurateur démo à un restaurant démo");
    expect(realAssignment).toContain("Motif obligatoire de la réaffectation");
  });

  it("keeps all privileged demo writes behind an authenticated production admin bridge", () => {
    expect(edge).toContain("requireProductionRuntime()");
    expect(edge).toContain("assertProductionFlowAllowed(actor");
    expect(edge).toContain('requireUserRole(actor, ["admin"])');
    expect(edge).toContain("DEMO_SUPABASE_SECRET_KEY");
    expect(edge).toContain('DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf"');
    expect(edge).toContain("demo.auth.admin.createUser");
    expect(edge).toContain('account_type: "restaurant_demo"');
    expect(edge).toContain("request_id");
    expect(edge).not.toMatch(/return\s+jsonResponse\([^)]*password/is);
  });

  it("tracks dedicated-demo state outside production migrations", () => {
    expect(demoMigrationPath.startsWith("supabase/demo-migrations/")).toBe(true);
    expect(demoMigration).toContain("demo_admin_operation_keys");
    expect(demoMigration).toContain("demo_admin_managed_restaurants");
    expect(demoMigration).toContain("demo_admin_system_state");
    expect(demoMigration).toContain("This shared demo restaurant cannot be reassigned");
    expect(demoMigration).toContain("FOR UPDATE");
    expect(demoMigration).toContain("demo_admin_ownership_audit");
  });

  it("rejects demo entities in the audited production ownership operation", () => {
    expect(productionMigration).toContain("admin_link_real_user_restaurant");
    expect(productionMigration).toContain("commercial_demo_accounts");
    expect(productionMigration).toContain("restaurant_demo");
    expect(productionMigration).toContain("v_restaurant.is_demo");
    expect(productionMigration).toContain("FOR UPDATE");
    expect(productionMigration).toContain("p_expected_owner_id");
    expect(productionMigration).toContain("INSERT INTO public.audit_log");
  });

  it("provides a tab-scoped demo login without changing production sessions", () => {
    expect(app).toContain('<Route path="/auth/demo" element={<Auth demoMode />} />');
    expect(auth).toContain("Connexion restaurateur démo");
    expect(demoClient).toContain('"tok-active-demo-workspace"');
    expect(demoClient).toContain("window.sessionStorage");
    expect(demoClient).toContain("isCommercialDemoAuthPath");
    expect(demoClient).toContain("clearCommercialDemoWorkspace");
    expect(authState).toContain('DEMO_ACTIVE_ROLE_KEY = "miamz-demo-active-role"');
    expect(authState).toContain("isCommercialDemoWorkspaceActive()");
  });
});
