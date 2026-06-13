import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("role separation, storage and audit security", () => {
  it("keeps client, restaurateur, admin and courier surfaces role-gated", () => {
    const authContext = read("src/lib/auth-context.ts");
    const roleAccess = read("src/lib/roleAccess.ts");
    const protectedRoute = read("src/components/ProtectedRoute.tsx");
    const dashboardRoute = read("src/components/DashboardRoute.tsx");
    const app = read("src/App.tsx");

    expect(authContext).toContain('UserRole = "client" | "restaurateur" | "admin" | "courier"');
    expect(roleAccess).toContain('client: "/"');
    expect(roleAccess).toContain('restaurateur: "/dashboard"');
    expect(roleAccess).toContain('admin: "/admin"');
    expect(roleAccess).toContain('courier: "/courier"');
    expect(protectedRoute).toContain("requiredRole");
    expect(protectedRoute).toContain("canAccessAnyRole");
    expect(dashboardRoute).toContain('requiredRole="restaurateur"');
    expect(app).toContain('requiredRole="client"');
    expect(app).toContain('requiredRole="admin"');
    expect(app).toContain('requiredRole="courier"');
  });


  it("keeps pending restaurateur signups in the restaurateur role without activating the restaurant", () => {
    const migration = read("supabase/migrations/20260613120000_restaurateur_pending_dashboard_access.sql");

    expect(migration).toContain("IF v_role_text = 'restaurateur' THEN");
    expect(migration).toContain("VALUES (v_actor_id, 'restaurateur')");
    expect(migration).toContain("status IN ('pending_review', 'needs_changes', 'rejected')");
    expect(migration).toContain("ELSIF v_application.requested_role = 'courier' THEN");
    expect(migration).toContain("WHEN v_next_status = 'approved' THEN 'active'");
    expect(migration).toContain("is_active = (v_next_status = 'approved')");
  });

  it("assigns the chosen signup role before email-confirmation redirects choose a surface", () => {
    const migration = read("supabase/migrations/20260613130000_auth_signup_role_routing.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(migration).toContain("NEW.raw_user_meta_data->>'role'");
    expect(migration).toContain("WHEN v_requested_role = 'restaurateur' THEN 'restaurateur'::public.app_role");
    expect(migration).toContain("WHEN v_requested_role IN ('courier', 'livreur') THEN 'courier'::public.app_role");
    expect(migration).toContain("VALUES (NEW.id, v_signup_role)");
    expect(migration).toContain("FROM auth.users u");
    expect(migration).toContain("ON CONFLICT (user_id, role) DO NOTHING");
  });

  it("audits sensitive Edge actions and restricts Storage buckets by ownership and MIME type", () => {
    const edgeAudit = read("supabase/migrations/20260312160000_search_audience_and_edge_audit.sql");
    const storageHardening = read("supabase/migrations/20260526152736_security_audit_hardening.sql");
    const tokAiStorage = read("supabase/migrations/20260602070000_restore_tok_ai_schema.sql");
    const authShared = read("supabase/functions/_shared/auth.ts");

    expect(edgeAudit).toContain("CREATE TABLE IF NOT EXISTS public.edge_function_audit_logs");
    expect(edgeAudit).toContain("request_metadata jsonb");
    expect(authShared).toContain("writeAuditLog");
    expect(authShared).toContain("buildRequestMetadata");
    expect(storageHardening).toContain("file_size_limit = 10485760");
    expect(storageHardening).toContain("allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']");
    expect(storageHardening).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(tokAiStorage).toContain("'ai-generated-assets'");
    expect(tokAiStorage).toContain("allowed_mime_types");
    expect(tokAiStorage).toContain("public.auth_owns_restaurant");
  });
});
