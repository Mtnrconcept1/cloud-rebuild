import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("commercial demo account security", () => {
  const migration = read("supabase/migrations/20260714120000_commercial_demo_accounts.sql");
  const aclHardening = read("supabase/migrations/20260714181500_commercial_demo_function_acl_hardening.sql");
  const authRepair = read("supabase/migrations/20260714184500_repair_auth_email_change_null.sql");
  const sharedAuth = read("supabase/functions/_shared/auth.ts");
  const sessionHelper = read("src/lib/session.ts");
  const ownerHook = read("src/pages/dashboard/useOwnerRestaurants.ts");
  const app = read("src/App.tsx");
  const layout = read("src/components/DashboardLayout.tsx");
  const adminUsersPage = read("src/pages/admin/AdminUtilisateurs.tsx");
  const provisionFunction = read("supabase/functions/provision-commercial-accounts/index.ts");
  const mediaGovernance = read("supabase/functions/restaurant-media-governance/index.ts");
  const stripeConnectStatus = read("supabase/functions/stripe-connect-status/index.ts");

  it("ignores untrusted signup metadata for role assignment", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(migration).toContain("VALUES (NEW.id, 'client'::public.app_role)");
    expect(migration).not.toContain("NEW.raw_user_meta_data->>'role'");
    expect(migration).toContain("guard_commercial_role_assignment");
    expect(migration).toContain("Commercial role requires an active administrator-managed demo account");
    expect(migration).toContain("REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM anon, authenticated");
  });

  it("restricts the restaurateur surface to the mapped demo restaurant", () => {
    expect(ownerHook).toContain('.eq("id", effectiveDemoRestaurantId)');
    expect(ownerHook).toContain('.eq("is_demo", true)');
    expect(ownerHook).toContain("filterCommercialDemoRestaurants(data || [], effectiveDemoRestaurantId)");
    expect(ownerHook).toContain("must never see a real restaurant");
    expect(ownerHook).toContain('user?.app_metadata?.account_type === "commercial_demo"');
    expect(ownerHook).toContain("isMarkedCommercialDemoIdentity");
    expect(ownerHook).toContain("Boolean(demoAccount)");
    expect(ownerHook).toContain("if (isManagedCommercialIdentity && !effectiveDemoRestaurantId) return []");
  });

  it("shows every demo tool while centrally blocking paid or external effects", () => {
    expect(app).toContain('flagName.startsWith("dashboard-")');
    expect(sharedAuth).toContain("DEMO_SIDE_EFFECT_BLOCKED");
    expect(sharedAuth).toContain("options.allowDemo !== true");
    expect(layout).toContain("Mode démonstration");
    expect(layout).toContain("paiements");
    expect(mediaGovernance).toContain("{ allowDemo: true }");
    expect(stripeConnectStatus).toContain('disabled_reason: "commercial_demo"');
    expect(stripeConnectStatus).toContain("if (restaurant.is_demo)");
  });

  it("does not seed accounting, payment, order, reservation or customer data", () => {
    for (const table of [
      "orders",
      "reservations",
      "payments",
      "financial_ledger",
      "restaurant_invoices",
      "restaurant_credit_purchases",
    ]) {
      expect(migration).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+public\\.${table}\\b`, "i"));
    }
  });

  it("allows local demo posts while excluding them from public and engagement flows", () => {
    expect(migration).toContain("hide_commercial_demo_post_rows");
    expect(migration).toContain("block_commercial_demo_social_side_effect_row");
    expect(migration).toContain("'planSlug', 'commercial-demo'");
    expect(migration).toContain("AND r.is_demo IS FALSE");
  });

  it("derives the provisioning administrator from the authenticated JWT", () => {
    expect(migration).toContain("v_created_by uuid := auth.uid()");
    expect(migration).toContain("IF NOT public.auth_is_admin()");
    expect(migration).not.toContain("p_created_by");
    expect(provisionFunction).toContain("actor.userClient.rpc(");
  });

  it("keeps credentials in Supabase Auth and validates password resets", () => {
    expect(migration).not.toMatch(/password\s+(text|varchar)/i);
    expect(provisionFunction).toContain("assertStrongPassword(resetBody.password)");
    expect(provisionFunction).toContain("assertValidUuid(targetUserId)");
    expect(provisionFunction).toContain("commercial_password_reset_audit_warning");
    expect(provisionFunction).toContain("target_user_id: targetUserId");
  });

  it("creates accounts atomically without scanning every Auth user", () => {
    expect(provisionFunction).not.toContain("auth.admin.listUsers");
    expect(provisionFunction).not.toContain("findUserByEmail");
    expect(provisionFunction).toContain("isExistingAuthUserError");
    expect(provisionFunction).toContain('code === "email_exists"');
    expect(provisionFunction).toContain("authErrorMessage(createError");
  });

  it("recovers once from an expired Edge Function session without weakening admin authorization", () => {
    expect(sessionHelper).toContain("(error as ErrorWithHttpContext | null)?.context");
    expect(sessionHelper).toContain("getFunctionsErrorStatus(result.error, result.response)");
    expect(sessionHelper).toContain("await getFreshAccessToken(true)");
    expect(sessionHelper).toContain('auth.signOut({ scope: "local" })');
    expect(sessionHelper).toContain("throw new SessionExpiredError()");
    expect(provisionFunction).toContain("authenticateRequest(req)");
    expect(provisionFunction).toContain('requireUserRole(actor, ["admin"])');
  });

  it("classifies only explicit duplicate Auth failures as an existing account", () => {
    const duplicateClassifier = provisionFunction.slice(
      provisionFunction.indexOf("function isExistingAuthUserError"),
      provisionFunction.indexOf("async function getAuthUsersById"),
    );

    expect(duplicateClassifier).toContain('code === "email_exists"');
    expect(duplicateClassifier).toContain('code === "user_already_exists"');
    expect(duplicateClassifier).toContain("status === 422 &&");
    expect(duplicateClassifier).toContain(".test(message)");
    expect(duplicateClassifier).not.toContain('code === "weak_password"');
    expect(duplicateClassifier).not.toMatch(/\|\|\s*status\s*===\s*422\s*;?/);
  });

  it("replaces empty structured Auth messages with a useful fallback", () => {
    const errorMessageNormalizer = provisionFunction.slice(
      provisionFunction.indexOf("function authErrorMessage"),
      provisionFunction.indexOf("function isExistingAuthUserError"),
    );

    expect(errorMessageNormalizer).toContain('message !== "{}"');
    expect(errorMessageNormalizer).toContain('message !== "[object Object]"');
    expect(errorMessageNormalizer).toContain("return fallback");
    expect(provisionFunction).toContain(
      'authErrorMessage(passwordError, "Impossible de remplacer le mot de passe Auth.")',
    );
  });

  it("repairs only malformed legacy Auth e-mail change values", () => {
    expect(authRepair).toContain("UPDATE auth.users");
    expect(authRepair).toContain("SET email_change = ''");
    expect(authRepair).toContain("WHERE email_change IS NULL");
    expect(authRepair).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
  });

  it("routes new commercial identities through the managed provisioning tab", () => {
    expect(adminUsersPage).toContain(
      '!currentRoles.includes("commercial") && nextRoles.includes("commercial")',
    );
    expect(adminUsersPage).toContain('nextParams.set("tab", "commercials")');
    expect(adminUsersPage).toContain(
      '.filter((role) => role !== "commercial" || baseRoles.includes("commercial"))',
    );
    expect(adminUsersPage).toContain("Ouvrir Commerciaux");
  });

  it("keeps trigger-only security definer helpers out of the Data API", () => {
    for (const helper of [
      "protect_demo_restaurant_identity",
      "protect_commercial_demo_account_mapping",
      "guard_commercial_role_assignment",
      "block_commercial_demo_side_effect_row",
      "block_commercial_demo_social_side_effect_row",
      "guard_commercial_demo_image_analysis_job",
      "prevent_restaurant_demo_status_change",
      "prevent_restaurant_image_reassignment",
    ]) {
      expect(aclHardening).toContain(`FUNCTION public.${helper}()`);
    }

    expect(aclHardening).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(aclHardening).toContain("commercial_demo_accounts_created_by_idx");
    expect(aclHardening).toContain("Commercial role requires an active administrator-managed demo account");
    expect(aclHardening).toContain("UPDATE OF user_id, role ON public.user_roles");
    expect(aclHardening).toContain("AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id");
    expect(aclHardening).toContain("DELETE FROM public.user_roles ur");
    expect(aclHardening).toContain("IF NOT (v_role = ANY(v_old_roles))");
    expect(aclHardening).toContain("BEFORE INSERT OR UPDATE ON public.image_analysis_jobs");
    expect(aclHardening).toContain("AND restaurant.is_demo");
    expect(aclHardening).toContain("RETURN NULL");
    expect(aclHardening).toContain("Restaurant demonstration status is immutable");
    expect(aclHardening).toContain("Indexed restaurant image ownership is immutable");
  });
});
