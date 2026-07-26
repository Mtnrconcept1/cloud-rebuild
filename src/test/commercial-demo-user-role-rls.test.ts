import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726022000_close_demo_user_role_escalation.sql",
  ),
  "utf8",
);

describe("commercial demo user-role isolation", () => {
  it("removes the blanket demo policy from user_roles", () => {
    expect(migration).toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access",
    );
    expect(migration).toContain(
      "ON public.user_roles",
    );
    expect(migration).toContain(
      "A demo actor mutation policy remains on public.user_roles",
    );
  });

  it("preserves self-read and super-admin management policies", () => {
    expect(migration).toContain(
      "user_roles_self_select",
    );
    expect(migration).toContain(
      "user_roles_super_admin_all",
    );
    expect(migration).toContain(
      "auth_is_super_admin()",
    );
  });

  it("fails closed if an active demo actor already has admin", () => {
    expect(migration).toContain(
      "commercial_demo_accounts",
    );
    expect(migration).toContain(
      "assigned_role.role = 'admin'::public.app_role",
    );
    expect(migration).toContain(
      "Incident check failed: an active demo actor already has admin",
    );
  });
});
