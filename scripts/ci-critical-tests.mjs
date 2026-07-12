import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import path from "node:path";

export const TEST_GROUPS = Object.freeze({
  payment: [
    "src/test/checkout-stripe-guards.test.ts",
    "src/test/marketplace-finance-routing.test.ts",
    "src/test/create-checkout-subscription.test.ts",
    "src/test/reconcile-paid-order-checkouts.test.ts",
    "src/test/client-checkout-session-guards.test.ts",
    "src/test/checkout-return-url-frontend.test.ts",
    "src/test/restaurant-onboarding-payments.test.ts",
    "src/test/restaurant-billing-account.test.ts",
    "src/test/restaurant-paid-tok-purchases-invoices.test.ts",
    "src/test/order-confirmation.test.ts",
    "src/test/order-payment-breakdown.test.tsx",
    "src/test/dashboard-payments.test.ts",
    "src/test/stripe-return.test.ts",
    "src/test/security-edge-functions.test.ts",
    "src/test/accounting-refund-alignment.test.ts",
  ],
  accounting: [
    "src/test/accounting-dashboard-clarity.test.ts",
    "src/test/accounting-exports.test.ts",
    "src/test/accounting-refund-alignment.test.ts",
    "src/test/audit-readiness-financial-ledger.test.ts",
    "src/test/admin-compta-actions.test.ts",
    "src/test/admin-compta-governance.test.ts",
    "src/test/compta-commission-sources.test.ts",
    "src/test/compta-flow.test.ts",
    "src/test/dashboard-invoice-restaurant-copy.test.ts",
    "src/test/dashboard-invoices.test.ts",
    "src/test/dashboard-payments.test.ts",
    "src/test/invoice-line-details.test.ts",
    "src/test/invoice-line-table.test.tsx",
    "src/test/marketplace-finance-routing.test.ts",
    "src/test/restaurant-paid-tok-purchases-invoices.test.ts",
  ],
  auth: [
    "src/test/auth-provider.test.tsx",
    "src/test/auth-post-login-routing.test.ts",
    "src/test/auth-redirect-security.test.ts",
    "src/test/auth-signup-form.test.tsx",
    "src/test/signup.test.ts",
    "src/test/signup-correction-flow.test.ts",
    "src/test/submitSignupValidation.test.ts",
    "src/test/logout-availability.test.ts",
    "src/test/role-access.test.ts",
    "src/test/role-route-wiring.test.ts",
    "src/test/admin-domain-routing.test.ts",
    "src/test/admin-user-roles.test.ts",
    "src/test/session-isolation-governance.test.ts",
    "src/test/cart-session-isolation.test.tsx",
    "src/test/security-role-storage-audit.test.ts",
    "src/test/authenticated-security-audit-hardening.test.ts",
  ],
  supabase: [
    "src/test/supabase-client-imports.test.ts",
    "src/test/supabase-cors.test.ts",
    "src/test/supabase-critical-rpc-contracts.test.ts",
    "src/test/supabase-migration-order.test.ts",
    "src/test/supabase-return-url.test.ts",
    "src/test/rls-generic-policy-audit.test.ts",
    "src/test/rls-policy-hardening.test.ts",
    "src/test/database-value-constraints.test.ts",
    "src/test/security-edge-functions.test.ts",
    "src/test/security-role-storage-audit.test.ts",
    "src/test/super-admin-sensitive-rls.test.ts",
    "src/test/plan2-security-definer-rpc-grants.test.ts",
    "src/test/dashboard-rpc-security.test.ts",
  ],
});

export function selectCriticalTests(enabledGroups, extraTests = []) {
  const unknownGroups = enabledGroups.filter((group) => !(group in TEST_GROUPS));
  if (unknownGroups.length > 0) {
    throw new Error(`Unknown critical test groups: ${unknownGroups.join(", ")}`);
  }

  const invalidExtraTests = extraTests.filter(
    (testFile) => !/^src\/.+\.(test|spec)\.(ts|tsx)$/.test(testFile),
  );
  if (invalidExtraTests.length > 0) {
    throw new Error(`Invalid explicit test paths: ${invalidExtraTests.join(", ")}`);
  }

  return [...new Set([...enabledGroups.flatMap((group) => TEST_GROUPS[group]), ...extraTests])].sort();
}

function enabledGroupsFromEnvironment() {
  return Object.keys(TEST_GROUPS).filter(
    (group) => process.env[`CI_${group.toUpperCase()}_CRITICAL`] === "true",
  );
}

export function main() {
  const groups = enabledGroupsFromEnvironment();
  const extraTests = (process.env.CI_CONTRACT_TESTS || "").split(/\s+/).filter(Boolean);
  const tests = selectCriticalTests(groups, extraTests);

  if (tests.length === 0) {
    console.log("No critical test group selected.");
    return;
  }

  const missing = tests.filter((testFile) => !existsSync(testFile));
  if (missing.length > 0) {
    throw new Error(`Critical test files are missing: ${missing.join(", ")}`);
  }

  console.log(`Critical groups: ${groups.join(", ") || "none"}`);
  console.log(`Explicit contract tests: ${extraTests.length}`);
  console.log(`Explicit test files after deduplication: ${tests.length}`);

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    command,
    [
      "exec",
      "vitest",
      "run",
      "--mode",
      "production",
      "--passWithNoTests",
      ...tests,
    ],
    { stdio: "inherit" },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPoint === import.meta.url) {
  main();
}
