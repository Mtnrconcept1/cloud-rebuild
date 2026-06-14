import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

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
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("signup email verification + server-side draft SQL", () => {
  const draftSql = latestMigrationContaining(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_submit_signup_application/i,
  );

  it("ajoute le statut awaiting_email a la contrainte CHECK", () => {
    expect(draftSql).toMatch(/status\s+IN\s*\([^)]*'awaiting_email'/i);
  });

  it("cree un RPC service-role parametre par p_user_id (jamais auth.uid)", () => {
    const fn = extractFunction(draftSql, "admin_submit_signup_application");
    expect(fn).toContain("p_user_id uuid");
    expect(fn).not.toMatch(/auth\.uid\(\)/);
    expect(fn).toContain("'awaiting_email'");
    expect(draftSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_submit_signup_application[\s\S]*TO\s+service_role/i);
  });

  it("promeut les brouillons et notifie l'admin a la confirmation d'email", () => {
    expect(draftSql).toContain("on_auth_user_email_confirmed");
    expect(draftSql).toMatch(/AFTER\s+UPDATE\s+OF\s+email_confirmed_at\s+ON\s+auth\.users/i);
    const trigFn = extractFunction(draftSql, "handle_email_confirmation");
    expect(trigFn).toMatch(/status\s*=\s*'pending_review'/i);
    expect(trigFn).toContain("email_queue");
  });

  it("notifie le demandeur depuis le RPC de revue admin", () => {
    const reviewSql = latestMigrationContaining(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_review_signup_application/i,
    );
    const reviewFn = extractFunction(reviewSql, "admin_review_signup_application");
    expect(reviewFn).toContain("email_queue");
    expect(reviewFn).toMatch(/v_applicant_email/i);
  });
});

describe("signup and admin moderation SQL", () => {
  it("keeps client signup document-free and immediately approved", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_signup_application/i);
    const syncSignupApplication = extractFunction(sql, "sync_signup_application");

    expect(syncSignupApplication).toContain("v_required_docs text[] := ARRAY[]::text[]");
    expect(syncSignupApplication).toContain("CASE WHEN v_role_text = 'client' THEN 'approved'");
    expect(syncSignupApplication).toContain("IF array_length(v_required_docs, 1) IS NOT NULL THEN");
  });

  it("grants pending restaurateurs their dashboard role while keeping courier roles approval-only", () => {
    const syncSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_signup_application/i);
    const syncSignupApplication = extractFunction(syncSql, "sync_signup_application");
    const handleUserSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user/i);
    const handleNewUser = extractFunction(handleUserSql, "handle_new_user");

    expect(syncSignupApplication).toContain("IF v_role_text = 'restaurateur' THEN");
    expect(syncSignupApplication).toContain("VALUES (v_actor_id, 'restaurateur')");
    expect(syncSignupApplication).not.toContain("VALUES (v_actor_id, 'courier')");
    expect(handleNewUser).toContain("ELSE 'client'::public.app_role");
    expect(handleNewUser).not.toContain("VALUES (NEW.id, 'client'::public.app_role)");
  });

  it("grants approved roles and only revokes courier roles from the admin review RPC", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_review_signup_application/i);
    const reviewSignupApplication = extractFunction(sql, "admin_review_signup_application");

    expect(reviewSignupApplication).toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*VALUES\s*\(\s*v_application\.user_id\s*,\s*v_application\.requested_role\s*\)/i);
    expect(reviewSignupApplication).toContain("ELSIF v_application.requested_role = 'courier' THEN");
    expect(reviewSignupApplication).toMatch(/DELETE\s+FROM\s+public\.user_roles[\s\S]*role = v_application\.requested_role/i);
    expect(reviewSignupApplication).toContain("v_next_status = 'approved'");
  });

  it("exposes signup moderation directly from the admin home", () => {
    const adminHome = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminHome.tsx"), "utf8");
    const adminUsers = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminUtilisateurs.tsx"), "utf8");

    expect(adminHome).toContain("/admin/utilisateurs?tab=applications");
    expect(adminUsers).toContain("useSearchParams");
    expect(adminUsers).toContain("value={activeAdminTab}");
  });


  it("keeps privileged signups out of the client role and repairs confirmed dossiers", () => {
    const sql = latestMigrationContaining(/Fix privileged signup dossiers and exclusive roles/i);
    const handleNewUser = extractFunction(sql, "handle_new_user");
    const submitDraft = extractFunction(sql, "admin_submit_signup_application");
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

    expect(handleNewUser).toContain("ELSE 'client'::public.app_role");
    expect(submitDraft).toContain("VALUES (p_user_id, p_requested_role)");
    expect(submitDraft).toMatch(/DELETE\s+FROM\s+public\.user_roles[\s\S]*role = 'client'::public\.app_role/i);
    expect(sql).toMatch(/UPDATE\s+public\.signup_applications[\s\S]*status = 'pending_review'[\s\S]*email_confirmed_at IS NOT NULL/i);
    expect(config).toMatch(/\[functions\.submit-signup-application\]\s*\nverify_jwt\s*=\s*false/i);
  });

  it("keeps restaurateur dossiers visible with admin badges and image previews", () => {
    const adminUsers = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminUtilisateurs.tsx"), "utf8");
    const mobileNav = readFileSync(resolve(process.cwd(), "src/components/admin/AdminMobileNavigation.tsx"), "utf8");
    const submitFunction = readFileSync(resolve(process.cwd(), "supabase/functions/submit-signup-application/index.ts"), "utf8");

    expect(adminUsers).toContain("pendingRestaurantApplicationsCount");
    expect(adminUsers).toContain("SignupDocumentPreview");
    expect(adminUsers).toContain("bg-red-600");
    expect(adminUsers).toContain("getVerificationDocumentUrl(document.file_path)");
    expect(mobileNav).toContain("pendingSignupBadge: true");
    expect(mobileNav).toContain("pendingSignupApplicationsCount");
    expect(submitFunction).toContain("admin_submit_signup_application");
    expect(submitFunction).toContain("verification-documents");
    expect(submitFunction).toContain("missing_document");
  });
});
