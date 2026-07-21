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
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("signup email verification + server-side draft SQL", () => {
  const draftSql = latestMigrationContaining(
    /on_auth_user_email_confirmed[\s\S]*CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_submit_signup_application/i,
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

  it("assigns every public signup the client role until an approved server-side workflow promotes it", () => {
    const handleUserSql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user/i);
    const handleNewUser = extractFunction(handleUserSql, "handle_new_user");

    expect(handleNewUser).toContain("VALUES (NEW.id, 'client'::public.app_role)");
    expect(handleNewUser).not.toContain("NEW.raw_user_meta_data->>'role'");
    expect(handleNewUser).not.toContain("v_signup_role");
  });

  it("grants approved roles and only revokes courier roles from the admin review RPC", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_review_signup_application/i);
    const reviewSignupApplication = extractFunction(sql, "admin_review_signup_application");

    expect(reviewSignupApplication).toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*VALUES\s*\(\s*v_application\.user_id\s*,\s*v_application\.requested_role\s*\)/i);
    expect(reviewSignupApplication).toMatch(
      /ELSIF v_application\.requested_role = 'courier'(?:::public\.app_role)? THEN/,
    );
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


  it("guards privileged signup RPC against ambiguous application_id references", () => {
    const sql = latestMigrationContaining(/Finalize the privileged signup RPC ambiguity fix/i);
    const submitDraft = extractFunction(sql, "admin_submit_signup_application");

    expect(submitDraft).toContain("FROM public.signup_application_documents sad");
    expect(submitDraft).toContain("WHERE sad.application_id = v_application_id");
    expect(submitDraft).toContain(
      "ON CONFLICT ON CONSTRAINT signup_application_documents_application_id_document_type_key DO UPDATE",
    );
    expect(submitDraft).not.toContain("ON CONFLICT (application_id, document_type)");
    expect(submitDraft).not.toMatch(/FROM public\.signup_application_documents\s+WHERE application_id = v_application_id/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_submit_signup_application[\s\S]*TO service_role/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("guards admin review RPC against ambiguous signup application document columns", () => {
    const sql = latestMigrationContaining(/Fix admin signup review ambiguity/i);
    const reviewApplication = extractFunction(sql, "admin_review_signup_application");

    expect(reviewApplication).toContain("UPDATE public.signup_application_documents AS sad");
    expect(reviewApplication).toContain("WHERE sad.application_id = p_application_id");
    expect(reviewApplication).toContain("reviewed_by = CASE WHEN v_is_service_role THEN sad.reviewed_by ELSE v_actor_id END");
    expect(reviewApplication).toContain("UPDATE public.signup_applications AS sa");
    expect(reviewApplication).toContain("WHERE sa.id = p_application_id");
    expect(reviewApplication).not.toMatch(/WHERE\s+application_id\s*=\s*p_application_id/i);
    expect(reviewApplication).not.toMatch(/WHERE\s+id\s*=\s*p_application_id/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_review_signup_application[\s\S]*TO authenticated,\s*service_role/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
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

  it("retires the historical multipart signup endpoint without processing documents", () => {
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
    const submitFunction = readFileSync(
      resolve(process.cwd(), "supabase/functions/submit-signup-application/index.ts"),
      "utf8",
    );

    expect(config).toMatch(/\[functions\.submit-signup-application\]\s*\nverify_jwt\s*=\s*false/i);
    expect(submitFunction).toContain("signup_submission_endpoint_retired");
    expect(submitFunction).toContain("status: 410");
    expect(submitFunction).toContain("handleCorsPreflight");
    expect(submitFunction).not.toContain("req.formData()");
    expect(submitFunction).not.toContain("admin_submit_signup_application");
    expect(submitFunction).not.toContain('from("verification-documents")');
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
    expect(submitFunction).toContain("signup_submission_endpoint_retired");
    expect(submitFunction).toContain("status: 410");
  });

  it("accepts common mobile document uploads through the authenticated direct flow", () => {
    const submitFunction = readFileSync(
      resolve(process.cwd(), "supabase/functions/submit-signup-application/index.ts"),
      "utf8",
    );
    const validation = readFileSync(
      resolve(process.cwd(), "supabase/functions/submit-signup-application/validation.ts"),
      "utf8",
    );
    const uploadSecurity = readFileSync(resolve(process.cwd(), "src/lib/uploadSecurity.ts"), "utf8");
    const authPage = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");
    const signupLib = readFileSync(resolve(process.cwd(), "src/lib/signup.ts"), "utf8");

    expect(validation).toContain('"image/heic"');
    expect(validation).toContain('"image/heif"');
    expect(submitFunction).toContain("signup_submission_endpoint_retired");
    expect(uploadSecurity).toContain('"image/heic": "heic"');
    expect(uploadSecurity).toContain('"image/heif": "heif"');
    expect(signupLib).toContain(".heic,.heif");
    expect(signupLib).toContain("uploadVerificationDocumentsWithRollback");
    expect(signupLib).toContain("removeVerificationDocumentsBestEffort");
    expect(authPage).toContain("pendingPrivilegedSignupRef");
    expect(authPage).toContain("uploadVerificationDocumentsWithRollback");
    expect(authPage).not.toMatch(/indexedDB|localStorage/i);
    expect(authPage).not.toContain('functions.invoke("submit-signup-application"');
  });
});

describe("pending restaurateur workspace and human-only publication", () => {
  const sql = latestMigrationContaining(/Human-only signup review/i);

  it("forces every new restaurant to remain private until an approved application exists", () => {
    const guard = extractFunction(sql, "protect_restaurant_moderation_state");

    expect(sql).toMatch(/ALTER COLUMN status SET DEFAULT 'pending'/i);
    expect(sql).toMatch(/ALTER COLUMN is_active SET DEFAULT false/i);
    expect(guard).toContain("NEW.status := 'pending'");
    expect(guard).toContain("NEW.is_active := false");
    expect(guard).toContain("restaurant_is_approved_for_publication(NEW.id, NEW.owner_id)");
    expect(guard).toContain("v_is_owner_correction_reset");
    expect(guard).toContain("application.status = 'pending_review'");
    expect(sql).toMatch(/restaurants_public_select[\s\S]*is_active IS TRUE[\s\S]*status[\s\S]*'active'/i);
  });

  it("allows the owner to edit only the private restaurant profile while moderation remains locked", () => {
    const context = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardContext.tsx"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/components/DashboardRoute.tsx"), "utf8");
    const restaurant = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardRestaurant.tsx"), "utf8");

    expect(context).not.toMatch(/dashboardAccessLocked[\s\S]*lockedFeatures\.add\("dashboard-restaurant"\)/);
    expect(route).toContain('location.pathname === "/dashboard/restaurant"');
    expect(restaurant).toContain('status: "pending"');
    expect(restaurant).toContain("is_active: false");
    expect(restaurant).toContain("Fiche privée — validation en attente");
    expect(restaurant).toContain("createdRestaurantIdRef.current = data.id");
    expect(restaurant).toContain("setSelectedId(data.id)");
  });

  it("requires an authenticated human admin and a ready payment before approval", () => {
    const review = extractFunction(sql, "admin_review_signup_application");
    const humanGuard = extractFunction(sql, "guard_human_signup_review");

    expect(review).toContain("v_actor_id IS NULL");
    expect(review).toContain("signup_restaurateur_onboarding_payment_ready");
    expect(review).toContain("count(DISTINCT document.document_type)");
    expect(review).toContain("business_registration");
    expect(review).toContain("reviewed_by = v_actor_id");
    expect(review).toContain("v_application.status = v_next_status");
    expect(review).toContain("v_application.review_note IS NOT DISTINCT FROM v_review_note");
    expect(review.indexOf("v_application.status = v_next_status"))
      .toBeLessThan(review.indexOf("UPDATE public.signup_applications"));
    expect(review).not.toContain("v_is_service_role");
    expect(humanGuard).toContain("validation humaine administrateur");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_review_signup_application[\s\S]*service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_review_signup_application[\s\S]*TO authenticated/i);
    expect(sql).toMatch(/CREATE TRIGGER enforce_restaurateur_signup_role[\s\S]*AFTER INSERT OR UPDATE\s+ON public\.signup_applications/i);
  });

  it("keeps documents private and validates only storage metadata, never their identity content", () => {
    const authPage = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");
    const signupLib = readFileSync(resolve(process.cwd(), "src/lib/signup.ts"), "utf8");
    const submissionFunction = readFileSync(
      resolve(process.cwd(), "supabase/functions/submit-signup-application/index.ts"),
      "utf8",
    );
    const documentFlow = `${authPage}\n${signupLib}\n${submissionFunction}`;

    expect(sql).toContain("file_size_limit = 15728640");
    expect(sql).toContain("public = false");
    expect(sql).toContain("validate_signup_document_manifest");
    expect(documentFlow).not.toMatch(/\b(openai|tesseract|textract|documentai)\b/i);
    expect(documentFlow).not.toContain("analyze-restaurant-image");
  });

  it("keeps privileged dossiers in memory until email confirmation and never persists sensitive fields", () => {
    const authPage = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");

    expect(authPage).toContain("pendingPrivilegedSignupRef");
    expect(authPage).toContain("privilegedSignupMutexRef.current = true");
    expect(authPage).toContain("privilegedSignupOperationRef.current");
    expect(authPage).toContain('payload.role !== "client" || options.skipIfExisting');
    expect(authPage).toContain("skipIfExisting: true");
    expect(authPage).not.toContain('functions.invoke("submit-signup-application"');
    expect(authPage).not.toMatch(/indexedDB|localStorage/i);
    expect(authPage).not.toContain("pendingPrivilegedSignupDraft");
    expect(authPage).toContain("const { password, ...applicationForm } = form");
  });

  it("guards public restaurant actions and authorizes GDPR deletion only for trusted callers", () => {
    for (const functionName of [
      "validate_and_create_reservation",
      "create_match_group",
      "upsert_match_group_member_order",
      "get_meal_formula_service_availability",
      "assert_meal_formula_service_capacity",
    ]) {
      const wrapper = extractFunction(sql, functionName);
      expect(wrapper).toContain("restaurant_is_publicly_visible");
      expect(sql).toContain(`${functionName}_unguarded`);
    }

    const gdprDelete = extractFunction(sql, "delete_user_gdpr_cascade");
    const storageQuarantine = latestMigrationContaining(/gdpr_storage_api_cleanup_required/i);
    expect(gdprDelete).toContain("v_actor_id IS DISTINCT FROM p_user_id");
    expect(gdprDelete).toContain("public.has_role(v_actor_id, 'admin'::public.app_role)");
    expect(gdprDelete).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(sql).toMatch(/signup_application_review_events[\s\S]*ON DELETE CASCADE/i);
    expect(sql).toContain("constraint_row.confdeltype <> 'c'");
    expect(sql).toContain("ALTER TABLE public.signup_application_review_events DROP CONSTRAINT %I");
    expect(sql).toContain("ADD CONSTRAINT signup_application_review_events_application_id_fkey");
    expect(sql).toMatch(/CREATE TRIGGER reject_signup_review_event_mutation\s+BEFORE UPDATE\s+ON public\.signup_application_review_events/i);
    expect(storageQuarantine).toContain("WHEN insufficient_privilege THEN");
    expect(storageQuarantine).toContain("gdpr_storage_api_cleanup_required");
  });

  it("never sends fallback cuisine slugs to the uuid cuisine RPC", () => {
    const restaurant = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardRestaurant.tsx"), "utf8");

    expect(restaurant).toContain("UUID_PATTERN");
    expect(restaurant).toContain("hasPersistableCuisineReference");
    expect(restaurant).toContain("if (!hasPersistableCuisineReference) return");
    expect(restaurant).toContain("p_cuisine_ids: selectedCuisineIds");
  });
});
