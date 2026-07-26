import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAddedDemoMigrations,
  parseMigrationPath,
} from "./apply-commercial-demo-migrations.mjs";

import {
  buildChangePlan,
  isDocumentationFile,
  normalizeFile,
  selectDirectContractTests,
} from "./ci-change-plan.mjs";

test("sélectionne uniquement les migrations démo ajoutées et les trie", () => {
  assert.deepEqual(
    parseAddedDemoMigrations(
      [
        "A\tsupabase/demo-migrations/20260719180000_second.sql",
        "A\tsupabase/demo-migrations/20260719170000_first.sql",
      ].join("\n"),
    ),
    [
      {
        path: "supabase/demo-migrations/20260719170000_first.sql",
        version: "20260719170000",
        name: "first",
      },
      {
        path: "supabase/demo-migrations/20260719180000_second.sql",
        version: "20260719180000",
        name: "second",
      },
    ],
  );
  assert.equal(
    parseMigrationPath("supabase/migrations/20260719170000_production.sql"),
    null,
  );
});

test("refuse la modification d'une migration démo déjà versionnée", () => {
  assert.throws(
    () => parseAddedDemoMigrations(
      "M\tsupabase/demo-migrations/20260719170000_existing.sql",
    ),
    /append-only/,
  );
});

test("normalise les chemins Windows et relatifs", () => {
  assert.equal(normalizeFile(".\\src\\pages\\Home.tsx"), "src/pages/Home.tsx");
});

test("reconnaît une modification de documentation sans lancer la toolchain", () => {
  const plan = buildChangePlan(["README.md", "docs/runbook.md"]);

  assert.equal(plan.docsOnly, true);
  assert.equal(plan.installRequired, false);
  assert.equal(plan.testMode, "none");
  assert.equal(plan.hasDeployableChanges, false);
  assert.equal(isDocumentationFile("docs/ci.md"), true);
});

test("cible les tests liés et le frontend pour une page React", () => {
  const plan = buildChangePlan(["src/pages/dashboard/DashboardPlanSalle.tsx"]);

  assert.equal(plan.fullSuite, false);
  assert.equal(plan.testMode, "affected");
  assert.equal(plan.runTypecheck, true);
  assert.equal(plan.runBuild, true);
  assert.equal(plan.deployFrontend, true);
  assert.equal(plan.deployFunctions, false);
});

test("un style frontend exige un build mais pas de tests TypeScript", () => {
  const plan = buildChangePlan(["src/index.css"]);

  assert.equal(plan.testMode, "none");
  assert.equal(plan.runTypecheck, false);
  assert.equal(plan.runBuild, true);
  assert.equal(plan.deployFrontend, true);
});

test("cible une seule Edge Function financière", () => {
  const plan = buildChangePlan([
    "supabase/functions/stripe-webhook/index.ts",
    "supabase/functions/stripe-webhook/handler.ts",
  ]);

  assert.equal(plan.testMode, "affected");
  assert.equal(plan.paymentCritical, true);
  assert.equal(plan.accountingCritical, false);
  assert.equal(plan.supabaseCritical, true);
  assert.equal(plan.deployFunctions, true);
  assert.equal(plan.deployAllFunctions, false);
  assert.deepEqual(plan.functionNames, ["stripe-webhook"]);
});

test("déploie toutes les Functions lorsque le code partagé change", () => {
  const plan = buildChangePlan(["supabase/functions/_shared/stripe-client.ts"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.deployFunctions, true);
  assert.equal(plan.deployAllFunctions, true);
  assert.deepEqual(plan.functionNames, []);
});

test("force la suite complète et le push DB pour une migration", () => {
  const plan = buildChangePlan([
    "supabase/migrations/20260712000000_financial_ledger.sql",
  ]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.deployDatabase, true);
  assert.equal(plan.paymentCritical, false);
  assert.equal(plan.accountingCritical, true);
  assert.equal(plan.deployFunctions, false);
});

test("force la suite complète et le déploiement DB pour une migration du projet démo", () => {
  const plan = buildChangePlan([
    "supabase/demo-migrations/20260719170000_demo_isolation.sql",
  ]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.deployDatabase, true);
  assert.equal(plan.supabaseCritical, true);
  assert.equal(plan.hasDeployableChanges, true);
});

test("sépare les garde-fous comptables des paiements", () => {
  const plan = buildChangePlan(["src/lib/invoicePresentation.ts"]);

  assert.equal(plan.accountingCritical, true);
  assert.equal(plan.paymentCritical, false);
  assert.equal(plan.testMode, "affected");
});

test("demande une synchronisation explicite quand le générateur de secrets change", () => {
  const plan = buildChangePlan(["scripts/write-supabase-secrets-env.mjs"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.syncSupabaseSecrets, true);
  assert.equal(plan.hasDeployableChanges, true);
});

test("signale les fichiers Supabase que db push ne déploie pas", () => {
  const plan = buildChangePlan(["supabase/roles.sql"]);

  assert.deepEqual(plan.unsupportedSupabasePaths, ["supabase/roles.sql"]);
});

test("traite le seed comme un artefact Preview/local sans déploiement Production", () => {
  const plan = buildChangePlan(["supabase/seed.sql"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.supabaseCritical, true);
  assert.equal(plan.deployDatabase, false);
  assert.equal(plan.deployFunctions, false);
  assert.equal(plan.hasDeployableChanges, false);
  assert.deepEqual(plan.unsupportedSupabasePaths, []);
});

test("une configuration globale force tous les tests sans déploiement applicatif", () => {
  const plan = buildChangePlan(["vitest.config.ts"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.runBuild, true);
  assert.equal(plan.hasDeployableChanges, false);
});

test("les dépendances forcent audit, suite complète et frontend", () => {
  const plan = buildChangePlan(["package.json", "pnpm-lock.yaml"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.dependencyAudit, true);
  assert.equal(plan.deployFrontend, true);
});

test("trie et déduplique les Functions ciblées", () => {
  const plan = buildChangePlan([
    "supabase/functions/zeta/index.ts",
    "supabase/functions/alpha/index.ts",
    "supabase/functions/zeta/helpers.ts",
  ]);

  assert.deepEqual(plan.functionNames, ["alpha", "zeta"]);
});

test("un diff indisponible reste fail-safe", () => {
  const plan = buildChangePlan([], { forceFull: true, forceDeploy: true });

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.deployFrontend, true);
  assert.equal(plan.deployDatabase, true);
  assert.equal(plan.deployAllFunctions, true);
});

test("un redéploiement manuel force toutes les surfaces même avec une baseline", () => {
  const plan = buildChangePlan(["README.md"], { forceDeploy: true });

  assert.equal(plan.deployFrontend, true);
  assert.equal(plan.deployDatabase, true);
  assert.equal(plan.deployFunctions, true);
  assert.equal(plan.deployAllFunctions, true);
  assert.equal(plan.syncSupabaseSecrets, true);
});

test("un chemin inconnu force validation complète et frontend", () => {
  const plan = buildChangePlan(["new-runtime/entry.ts"]);

  assert.equal(plan.fullSuite, true);
  assert.equal(plan.deployFrontend, true);
  assert.deepEqual(plan.unknownFiles, ["new-runtime/entry.ts"]);
});

test("retrouve les tests qui lisent directement un fichier modifié", () => {
  const tests = selectDirectContractTests(
    ["src/components/floor-plan/StudioCanvas.tsx"],
    [
      {
        path: "src/test/floor-plan-studio.test.ts",
        source: 'readProjectFile("src/components/floor-plan/StudioCanvas.tsx")',
      },
      {
        path: "src/test/unrelated.test.ts",
        source: 'readProjectFile("src/pages/Unrelated.tsx")',
      },
    ],
  );

  assert.deepEqual(tests, ["src/test/floor-plan-studio.test.ts"]);
});
