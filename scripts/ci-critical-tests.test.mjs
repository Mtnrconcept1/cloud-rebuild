import assert from "node:assert/strict";
import test from "node:test";

import { selectCriticalTests, TEST_GROUPS } from "./ci-critical-tests.mjs";

test("déduplique les tests partagés entre les packs critiques", () => {
  const selected = selectCriticalTests(["payment", "accounting", "supabase"]);

  assert.equal(selected.filter((file) => file.endsWith("marketplace-finance-routing.test.ts")).length, 1);
  assert.equal(selected.filter((file) => file.endsWith("security-edge-functions.test.ts")).length, 1);
});

test("conserve les contrats essentiels de chaque domaine", () => {
  assert.ok(TEST_GROUPS.payment.includes("src/test/checkout-stripe-guards.test.ts"));
  assert.ok(TEST_GROUPS.accounting.includes("src/test/audit-readiness-financial-ledger.test.ts"));
  assert.ok(TEST_GROUPS.auth.includes("src/test/auth-redirect-security.test.ts"));
  assert.ok(TEST_GROUPS.supabase.includes("src/test/rls-policy-hardening.test.ts"));
});

test("refuse un groupe inconnu", () => {
  assert.throws(() => selectCriticalTests(["unknown"]), /Unknown critical test groups/);
});

test("ajoute et valide les contrats directs détectés", () => {
  const selected = selectCriticalTests([], ["src/test/floor-plan-studio.test.ts"]);

  assert.deepEqual(selected, ["src/test/floor-plan-studio.test.ts"]);
  assert.throws(() => selectCriticalTests([], ["README.md"]), /Invalid explicit test paths/);
});
