import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readMigration = (name: string) =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations", name),
    "utf8",
  );

const roleMigration = readMigration(
  "20260726022000_close_demo_user_role_escalation.sql",
);
const storageMigration = readMigration(
  "20260726022100_close_demo_storage_bypass.sql",
);

describe("commercial demo security isolation", () => {
  it("removes the blanket demo policy from user_roles", () => {
    expect(roleMigration).toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access",
    );
    expect(roleMigration).toContain(
      "ON public.user_roles",
    );
    expect(roleMigration).toContain(
      "A demo actor mutation policy remains on public.user_roles",
    );
  });

  it("preserves self-read and super-admin management policies", () => {
    expect(roleMigration).toContain(
      "user_roles_self_select",
    );
    expect(roleMigration).toContain(
      "user_roles_super_admin_all",
    );
    expect(roleMigration).toContain(
      "auth_is_super_admin()",
    );
  });

  it("fails closed if an active demo actor already has admin", () => {
    expect(roleMigration).toContain(
      "commercial_demo_accounts",
    );
    expect(roleMigration).toContain(
      "assigned_role.role = 'admin'::public.app_role",
    );
    expect(roleMigration).toContain(
      "Incident check failed: an active demo actor already has admin",
    );
  });

  it("removes cross-bucket demo access while retaining scoped policies", () => {
    expect(storageMigration).toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access",
    );
    expect(storageMigration).toContain(
      "ON storage.objects",
    );
    expect(storageMigration).toContain(
      "verification_documents_select",
    );
    expect(storageMigration).toContain(
      "restaurant_images_storage_owner_select",
    );
    expect(storageMigration).toContain(
      "A dedicated demo bypass remains on storage.objects",
    );
  });
});
