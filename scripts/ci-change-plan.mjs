import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ZERO_SHA = /^0+$/;
const FUNCTION_NAME = /^[A-Za-z0-9_-]+$/;

const FULL_SUITE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "vitest.config.ts",
  "vite.config.ts",
  "eslint.config.js",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tsconfig.typecheck.json",
  "src/test/setup.ts",
  "src/App.tsx",
  "src/main.tsx",
  "src/integrations/supabase/client.ts",
  "src/integrations/supabase/types.ts",
  "src/lib/auth.tsx",
  "src/lib/auth-context.ts",
  "src/lib/featureFlags.ts",
  "src/lib/featureCatalog.ts",
  "scripts/ci-change-plan.mjs",
  "scripts/ci-change-plan.test.mjs",
  "scripts/ci-critical-tests.mjs",
  "scripts/ci-critical-tests.test.mjs",
  "scripts/release-readiness.mjs",
  "scripts/write-production-env.mjs",
  "scripts/write-supabase-secrets-env.mjs",
]);

const FRONTEND_ROOT_FILES = new Set([
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "vite.config.ts",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "vercel.json",
]);

const PAYMENT_PATTERN = /(stripe|payment|checkout|billing|payout|refund|subscription|order[-_.]?pricing|zero[-_.]?attente|chefs?[-_.]?table|tok[-_.]?one)/i;
const ACCOUNTING_PATTERN = /(accounting|compta|invoice|commission|finance|financial|ledger|payable)/i;
const AUTH_PATTERN = /(auth|login|signup|session|jwt|rls|policy|permission|security|role)/i;

export function normalizeFile(file) {
  return String(file || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

export function isDocumentationFile(file) {
  const normalized = normalizeFile(file);
  return (
    normalized === "README" ||
    normalized === "README.md" ||
    normalized === "LICENSE" ||
    normalized.startsWith("docs/") ||
    /\.(md|mdx|txt)$/i.test(normalized)
  );
}

export function selectDirectContractTests(changedFiles, testEntries) {
  const needles = [...new Set(changedFiles.map(normalizeFile).filter(Boolean))];
  if (needles.length === 0) return [];

  return testEntries
    .filter(({ source }) => needles.some((file) => source.includes(file)))
    .map(({ path: testPath }) => normalizeFile(testPath))
    .filter(Boolean)
    .filter((testPath, index, tests) => tests.indexOf(testPath) === index)
    .sort();
}

function discoverTestEntries(directory) {
  if (!existsSync(directory)) return [];

  const entries = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, item.name);
    if (item.isDirectory()) {
      entries.push(...discoverTestEntries(itemPath));
      continue;
    }

    const normalized = normalizeFile(path.relative(process.cwd(), itemPath));
    if (!/\.(test|spec)\.(ts|tsx)$/.test(normalized)) continue;
    entries.push({ path: normalized, source: readFileSync(itemPath, "utf8") });
  }

  return entries;
}

function isFullSuiteFile(file) {
  return (
    FULL_SUITE_FILES.has(file) ||
    /^(vitest|vite)\.config\./.test(file) ||
    /^eslint\.config\./.test(file) ||
    /^tsconfig(?:\..+)?\.json$/.test(file) ||
    /^src\/lib\/(auth|auth-context|featureFlags|featureCatalog)\.(ts|tsx)$/.test(file) ||
    file.startsWith(".github/workflows/") ||
    file.startsWith(".github/actions/") ||
    file.startsWith("android/") ||
    file.startsWith("ios/") ||
    /^capacitor\.config\./.test(file) ||
    file.startsWith("supabase/migrations/") ||
    file.startsWith("supabase/tests/") ||
    file.startsWith("supabase/functions/_shared/") ||
    file === "supabase/config.toml"
  );
}

function isFrontendFile(file) {
  return (
    FRONTEND_ROOT_FILES.has(file) ||
    file.startsWith("src/") ||
    file.startsWith("api/") ||
    file.startsWith("public/") ||
    file.startsWith("scripts/prerender-") ||
    file === "scripts/write-production-env.mjs"
  );
}

function isRootTestRelevant(file) {
  return (
    (file.startsWith("src/") && /\.(ts|tsx)$/.test(file)) ||
    file.startsWith("supabase/") ||
    file.startsWith("api/") ||
    (file.startsWith("scripts/") && !file.startsWith("scripts/ci-change-plan"))
  );
}

function isRecognizedFile(file) {
  return (
    isDocumentationFile(file) ||
    FULL_SUITE_FILES.has(file) ||
    FRONTEND_ROOT_FILES.has(file) ||
    file.startsWith("src/") ||
    file.startsWith("public/") ||
    file.startsWith("supabase/") ||
    file.startsWith("workers/") ||
    file.startsWith("scripts/") ||
    file.startsWith("api/") ||
    file.startsWith(".github/") ||
    file.startsWith("android/") ||
    file.startsWith("ios/") ||
    file.startsWith(".vscode/") ||
    file.startsWith(".devcontainer/") ||
    /^capacitor\.config\./.test(file) ||
    /^\.git(ignore|attributes)$/.test(file)
  );
}

function getFunctionImpact(files, forceDeploy) {
  let deployFunctions = forceDeploy;
  let deployAllFunctions = forceDeploy;
  const functionNames = new Set();

  for (const file of files) {
    if (file === "supabase/config.toml") {
      deployFunctions = true;
      deployAllFunctions = true;
      continue;
    }

    if (!file.startsWith("supabase/functions/")) continue;
    deployFunctions = true;

    const remainder = file.slice("supabase/functions/".length);
    const segments = remainder.split("/").filter(Boolean);
    const functionName = segments[0];

    if (
      segments.length < 2 ||
      functionName === "_shared" ||
      !FUNCTION_NAME.test(functionName)
    ) {
      deployAllFunctions = true;
      continue;
    }

    functionNames.add(functionName);
  }

  if (deployFunctions && functionNames.size === 0) {
    deployAllFunctions = true;
  }

  return {
    deployFunctions,
    deployAllFunctions,
    functionNames: deployAllFunctions ? [] : [...functionNames].sort(),
  };
}

export function buildChangePlan(rawFiles, options = {}) {
  const files = [...new Set(rawFiles.map(normalizeFile).filter(Boolean))].sort();
  const forceFull = options.forceFull === true;
  const forceDeploy = options.forceDeploy === true;
  const noDiffAvailable = files.length === 0;
  const docsOnly = files.length > 0 && files.every(isDocumentationFile);
  const unknownFiles = files.filter((file) => !isRecognizedFile(file));
  const fullSuite =
    forceFull || noDiffAvailable || unknownFiles.length > 0 || files.some(isFullSuiteFile);
  const dependencies = files.some((file) =>
    /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json)$/.test(file),
  );
  const deployFrontend = forceDeploy || unknownFiles.length > 0 || files.some(isFrontendFile);
  const deployDatabase = forceDeploy || files.some((file) => file.startsWith("supabase/migrations/"));
  const functionImpact = getFunctionImpact(files, forceDeploy);
  const paymentCritical = files.some((file) => PAYMENT_PATTERN.test(file));
  const accountingCritical = files.some((file) => ACCOUNTING_PATTERN.test(file));
  const authCritical = files.some((file) => AUTH_PATTERN.test(file));
  const supabaseCritical = files.some((file) => file.startsWith("supabase/"));
  const syncSupabaseSecrets =
    forceDeploy || files.includes("scripts/write-supabase-secrets-env.mjs");
  const unsupportedSupabasePaths = files.filter(
    (file) => file === "supabase/roles.sql" || file === "supabase/seed.sql",
  );
  const runWorkerTests = files.some((file) => file.startsWith("workers/image-ai-worker/"));
  const runTests = fullSuite || files.some(isRootTestRelevant);
  const runLint =
    fullSuite ||
    files.some((file) => /\.(ts|tsx)$/.test(file) || file === "eslint.config.js");
  const runTypecheck =
    fullSuite ||
    files.some(
      (file) =>
        (file.startsWith("src/") && /\.(ts|tsx)$/.test(file)) ||
        /^tsconfig(?:\..+)?\.json$/.test(file),
    );
  const runBuild = fullSuite || deployFrontend;
  const dependencyAudit = dependencies || forceFull;
  const installRequired =
    dependencyAudit || runLint || runTypecheck || runBuild || runTests || runWorkerTests;
  const hasDeployableChanges =
    deployFrontend || deployDatabase || functionImpact.deployFunctions || syncSupabaseSecrets;

  return {
    files,
    unknownFiles,
    hasChanges: files.length > 0,
    docsOnly,
    fullSuite,
    testMode: runTests ? (fullSuite ? "full" : "affected") : "none",
    runTests,
    runLint,
    runTypecheck,
    runBuild,
    runWorkerTests,
    dependencyAudit,
    installRequired,
    paymentCritical,
    accountingCritical,
    authCritical,
    supabaseCritical,
    deployFrontend,
    deployDatabase,
    deployFunctions: functionImpact.deployFunctions,
    deployAllFunctions: functionImpact.deployAllFunctions,
    functionNames: functionImpact.functionNames,
    syncSupabaseSecrets,
    unsupportedSupabasePaths,
    hasDeployableChanges,
  };
}

function readArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function hasCommit(ref) {
  if (!ref || ZERO_SHA.test(ref)) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function splitNullDelimited(value) {
  return value.split("\0").map(normalizeFile).filter(Boolean);
}

function getChangedFiles(base, head) {
  if (hasCommit(base) && hasCommit(head)) {
    return splitNullDelimited(
      git(["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", base, head]),
    );
  }

  return [];
}

function bool(value) {
  return value ? "true" : "false";
}

function writeOutput(file, key, value) {
  if (!file) return;
  appendFileSync(file, `${key}=${value}\n`, "utf8");
}

function writeSummary(file, plan, base, head, usedFallback, contractTests) {
  if (!file) return;
  const lines = [
    "## Plan de validation CI",
    "",
    `- Base : \`${base || "indisponible"}\``,
    `- Cible : \`${head}\``,
    `- Fichiers modifiés : **${plan.files.length}**`,
    `- Mode de tests : **${plan.testMode}**`,
    `- Suite complète : **${bool(plan.fullSuite)}**`,
    `- Tests financiers critiques : **${bool(plan.paymentCritical)}**`,
    `- Tests comptables critiques : **${bool(plan.accountingCritical)}**`,
    `- Tests Auth/RLS critiques : **${bool(plan.authCritical)}**`,
    `- Déploiement frontend : **${bool(plan.deployFrontend)}**`,
    `- Migrations Supabase : **${bool(plan.deployDatabase)}**`,
    `- Edge Functions Supabase : **${bool(plan.deployFunctions)}**`,
  ];

  if (usedFallback) {
    lines.push("", "> Base Git indisponible : validation complète activée par sécurité.");
  }

  if (plan.functionNames.length > 0) {
    lines.push(`- Functions ciblées : \`${plan.functionNames.join(", ")}\``);
  }

  if (contractTests.length > 0) {
    lines.push(`- Tests de contrat liés directement : **${contractTests.length}**`);
  }

  if (plan.unsupportedSupabasePaths.length > 0) {
    lines.push(
      "",
      `> Chemins Supabase non déployés automatiquement : \`${plan.unsupportedSupabasePaths.join(", ")}\`.`,
    );
  }

  if (plan.unknownFiles.length > 0) {
    lines.push(
      "",
      `> Fichiers inconnus du classificateur : validation complète et déploiement frontend par sécurité (\`${plan.unknownFiles.join(", ")}\`).`,
    );
  }

  appendFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

export function main() {
  const base = readArg("base") || process.env.CI_BASE_SHA || "";
  const head = readArg("head") || process.env.CI_HEAD_SHA || "HEAD";
  const baseAvailable = hasCommit(base);
  const forceFull = process.env.CI_FORCE_FULL === "true" || !baseAvailable;
  const forceDeploy = process.env.CI_FORCE_DEPLOY === "true";
  const files = getChangedFiles(base, head);
  const plan = buildChangePlan(files, { forceFull, forceDeploy });
  const contractTests =
    plan.testMode === "affected"
      ? selectDirectContractTests(plan.files, discoverTestEntries(path.join(process.cwd(), "src")))
      : [];
  const outputFile = process.env.GITHUB_OUTPUT;

  const outputs = {
    base_sha: baseAvailable ? base : "",
    has_changes: bool(plan.hasChanges),
    docs_only: bool(plan.docsOnly),
    full_suite: bool(plan.fullSuite),
    test_mode: plan.testMode,
    run_tests: bool(plan.runTests),
    run_lint: bool(plan.runLint),
    run_typecheck: bool(plan.runTypecheck),
    run_build: bool(plan.runBuild),
    run_worker_tests: bool(plan.runWorkerTests),
    dependency_audit: bool(plan.dependencyAudit),
    install_required: bool(plan.installRequired),
    payment_critical: bool(plan.paymentCritical),
    accounting_critical: bool(plan.accountingCritical),
    auth_critical: bool(plan.authCritical),
    supabase_critical: bool(plan.supabaseCritical),
    deploy_frontend: bool(plan.deployFrontend),
    deploy_database: bool(plan.deployDatabase),
    deploy_functions: bool(plan.deployFunctions),
    deploy_all_functions: bool(plan.deployAllFunctions),
    function_names: plan.functionNames.join(" "),
    sync_supabase_secrets: bool(plan.syncSupabaseSecrets),
    unsupported_supabase: bool(plan.unsupportedSupabasePaths.length > 0),
    unsupported_supabase_paths: plan.unsupportedSupabasePaths.join(" "),
    unknown_files: plan.unknownFiles.join(" "),
    contract_tests: contractTests.join(" "),
    has_deployable_changes: bool(plan.hasDeployableChanges),
  };

  for (const [key, value] of Object.entries(outputs)) {
    writeOutput(outputFile, key, value);
  }

  writeSummary(
    process.env.GITHUB_STEP_SUMMARY,
    plan,
    base,
    head,
    !baseAvailable,
    contractTests,
  );
  console.log(JSON.stringify({ ...outputs, changed_files: plan.files }, null, 2));
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPoint === import.meta.url) {
  main();
}
