import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial pins and admin destructive actions", () => {
  const markerCss = read("src/styles/commercial-prospection-markers.css");
  const destructiveActions = read("src/components/admin/AdminDestructiveActions.tsx");
  const assignment = read("src/components/admin/AdminRealRestaurantAssignment.tsx");
  const migration = read(
    "supabase/migrations/20260726013000_admin_destructive_actions.sql",
  );
  const repairMigration = read(
    "supabase/migrations/20261006010000_repair_admin_commercial_supabase_regressions.sql",
  );
  const deleteAccountEdge = read("supabase/functions/delete-account/index.ts");
  const storageCleanup = read("supabase/functions/_shared/user-storage-cleanup.ts");

  it("keeps commercial map pins visible under the production CSP", () => {
    expect(markerCss).not.toContain("data:image/svg+xml");
    expect(markerCss).not.toContain("mask-image");
    expect(markerCss).toContain(
      ".commercial-prospect-marker-glyph.is-thefork::before",
    );
    expect(markerCss).toContain(
      ".commercial-prospect-marker-glyph.is-standard",
    );
    expect(markerCss).toContain("currentColor");
    expect(markerCss).toContain("#facc15");
    expect(markerCss).toContain("#f97316");
    expect(markerCss).toContain("#16a34a");
    expect(markerCss).toContain("#ef4444");
  });

  it("exposes deletion controls from existing user and restaurant detail panels", () => {
    expect(assignment).toContain('import AdminDestructiveActions from "@/components/admin/AdminDestructiveActions"');
    expect(assignment).toContain("targetUserId={targetUserId}");
    expect(assignment).toContain("targetRestaurantId={targetRestaurantId}");
    expect(destructiveActions).toContain('invokeSupabaseFunction<{');
    expect(destructiveActions).toContain('>("delete-account", {');
    expect(destructiveActions).not.toContain('("admin_delete_user_account"');
    expect(destructiveActions).toContain('"admin_delete_restaurant"');
    expect(destructiveActions).toContain("confirmation.trim() === targetId");
    expect(destructiveActions).toContain("Motif obligatoire");
  });

  it("protects permanent user deletion with server-side safeguards", () => {
    expect(migration).toContain("public.admin_delete_user_account");
    expect(migration).toContain("Admin access required.");
    expect(migration).toContain("cannot delete their own account");
    expect(migration).toContain("The last administrator account cannot be deleted");
    expect(migration).toContain("still owns % active restaurant(s)");
    expect(migration).toContain("delete_user_gdpr_cascade_unguarded");
    expect(migration).toContain("INSERT INTO public.audit_log");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
  });

  it("keeps the admin repair migration SQL block delimiters valid", () => {
    expect(repairMigration).toContain("DO $");
    expect(repairMigration).not.toMatch(/DO \\$(?!\\$)/);
    expect(repairMigration).not.toMatch(/\\n\\$;\\n/);
  });

  it("deletes Storage objects through the Storage API only after guarded database deletion", () => {
    expect(repairMigration).toContain("admin_list_user_storage_objects_for_deletion");
    expect(repairMigration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(deleteAccountEdge).toContain("listUserStorageObjects");
    expect(deleteAccountEdge).toContain("admin_delete_user_account");
    expect(deleteAccountEdge).toContain("removeUserStorageObjects");
    expect(deleteAccountEdge.indexOf('"admin_delete_user_account"')).toBeLessThan(
      deleteAccountEdge.indexOf("removeUserStorageObjects("),
    );
    expect(storageCleanup).toContain("adminClient.storage.from(bucketId).remove(batch)");
    expect(storageCleanup).toContain("offset += 1000");
  });

  it("keeps real-restaurant deletion safeguards without treating demo ownership as a blocker", () => {
    const adminDeleteFn = repairMigration.slice(
      repairMigration.indexOf("CREATE OR REPLACE FUNCTION public.admin_delete_user_account"),
      repairMigration.indexOf("COMMENT ON FUNCTION public.admin_delete_user_account"),
    );

    expect(adminDeleteFn).toContain("restaurant.is_demo IS FALSE");
    expect(adminDeleteFn).toContain("No administrator is available to retain technical ownership");
    expect(adminDeleteFn).toContain("UPDATE public.restaurants");
    expect(adminDeleteFn).toContain("SET owner_id = v_demo_owner_id");
    expect(adminDeleteFn).toContain("delete_user_gdpr_cascade_unguarded");
  });

  it("archives restaurants instead of breaking financial history", () => {
    expect(migration).toContain("public.admin_delete_restaurant");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("v_restaurant.is_demo");
    expect(migration).toContain("status = 'archived'");
    expect(migration).toContain("is_active = false");
    expect(migration).toContain("legal_and_financial_history_preserved");
    expect(migration).not.toContain("DELETE FROM public.restaurants");
  });
});
