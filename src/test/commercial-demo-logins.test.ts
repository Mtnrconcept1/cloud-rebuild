import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("admin-managed commercial demo accounts", () => {
  const authSource = read("src/pages/Auth.tsx");
  const panelSource = read("src/components/admin/AdminCommercialAccountsPanel.tsx");
  const provisionerSource = read("supabase/functions/provision-commercial-accounts/index.ts");
  const tombstoneSource = read("supabase/functions/provision-commercial-demo-logins/index.ts");
  const migration = read("supabase/migrations/20260714120000_commercial_demo_accounts.sql");

  it("removes public and predictable demo login shortcuts", () => {
    expect(authSource).not.toContain("COMMERCIAL_DEMO_LOGINS");
    expect(authSource).not.toContain("provision-commercial-demo-logins");
    expect(authSource).not.toContain('TabsTrigger value="commercial"');
    expect(tombstoneSource).toContain("LEGACY_DEMO_PROVISIONING_DISABLED");
    expect(tombstoneSource).toContain("status: 410");
  });

  it("creates a new Auth identity only after an authenticated admin check", () => {
    expect(provisionerSource).toContain("authenticateRequest(req)");
    expect(provisionerSource).toContain('requireUserRole(actor, ["admin"])');
    expect(provisionerSource).toContain("auth.admin.createUser");
    expect(provisionerSource).toContain("findUserByEmail");
    expect(provisionerSource).toContain("Aucun mot de passe ni rôle n'a été modifié");
    expect(provisionerSource).not.toContain("user_metadata: { role:");
    expect(provisionerSource).not.toContain("updateUserById(existing");
  });

  it("assigns the three requested roles and one isolated demo restaurant", () => {
    expect(migration).toContain("commercial_demo_accounts");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS is_demo");
    expect(migration).toContain("ARRAY['client', 'restaurateur']");
    expect(migration).toContain("VALUES (p_user_id, 'commercial'::public.app_role)");
    expect(migration).toContain("COALESCE(is_active, false) IS FALSE");
    expect(migration).toContain("stripe_account_id IS NULL");
    expect(migration).toContain("restaurants_public_select");
    expect(migration).toContain("hide_commercial_demo_rows");
    expect(migration).toContain("hide_commercial_demo_branch_rows");
  });

  it("never stores or returns a password after the one-time admin form", () => {
    expect(migration).not.toMatch(/password\s+(text|varchar)/i);
    expect(provisionerSource).not.toContain("return jsonResponse({ ok: true, password");
    expect(provisionerSource).not.toContain("request_metadata: { password");
    expect(provisionerSource).toContain("rollbackCreatedAuthUser");
    expect(provisionerSource).toContain("audit_warning");
    expect(panelSource).toContain("ne pourra pas être relu ensuite");
  });
});
