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
    expect(destructiveActions).toContain('"admin_delete_user_account"');
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
