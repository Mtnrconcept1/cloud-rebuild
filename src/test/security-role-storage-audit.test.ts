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
    expect(roleAccess).toContain('client: "/mon-espace"');
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


  it("keeps public signup metadata from granting privileged roles", () => {
    const migration = read("supabase/migrations/20260714120000_commercial_demo_accounts.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(migration).toContain("VALUES (NEW.id, 'client'::public.app_role)");
    expect(migration).not.toContain("NEW.raw_user_meta_data->>'role'");
    expect(migration).toContain("guard_commercial_role_assignment");
    expect(migration).toContain("REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM anon, authenticated");
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

