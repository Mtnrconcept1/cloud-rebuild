import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-production.yml"),
  "utf8",
);
const secretWriter = readFileSync(
  resolve(process.cwd(), "scripts/write-supabase-secrets-env.mjs"),
  "utf8",
);

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing workflow section: ${start}`).toBeGreaterThan(-1);
  expect(endIndex, `missing workflow section boundary: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function secretEnvironmentNames(source: string) {
  return [...source.matchAll(/^\s+([A-Z][A-Z0-9_]+):\s+\$\{\{\s*secrets\./gm)]
    .map((match) => match[1])
    .sort();
}

describe("production deployment secret scope", () => {
  const preflight = section(workflow, "  preflight:", "  build_frontend:");
  const buildFrontend = section(workflow, "  build_frontend:", "  deploy_supabase:");
  const preflightSupabaseAuth = section(
    preflight,
    "      - name: Enforce and verify Supabase leaked-password protection",
    "      - name: Verify Supabase Vault cron and email provider configuration",
  );
  const preflightRuntimeSecurity = section(
    preflight,
    "      - name: Verify Supabase Vault cron and email provider configuration",
    "      - name: Release readiness",
  );
  const deploySupabase = section(workflow, "  deploy_supabase:", "  deploy_frontend:");
  const jobEnvironment = section(deploySupabase, "    env:", "    steps:");
  const beforeSecretSteps = section(
    deploySupabase,
    "    steps:",
    "      - name: Assert server-only OpenAI secret",
  );
  const assertOpenAi = section(
    deploySupabase,
    "      - name: Assert server-only OpenAI secret",
    "      - name: Prepare Supabase function secrets env",
  );
  const prepareSecrets = section(
    deploySupabase,
    "      - name: Prepare Supabase function secrets env",
    "      - name: Link Supabase production project",
  );
  const linkProject = section(
    deploySupabase,
    "      - name: Link Supabase production project",
    "      - name: Sync Supabase production secrets",
  );
  const syncSecrets = section(
    deploySupabase,
    "      - name: Sync Supabase production secrets",
    "      - name: Remove Supabase function secrets env",
  );
  const cleanupSecrets = section(
    deploySupabase,
    "      - name: Remove Supabase function secrets env",
    "      - name: Push database migrations",
  );
  const pushDatabase = section(
    deploySupabase,
    "      - name: Push database migrations",
    "      - name: Deploy impacted Edge Functions",
  );
  const deployFunctions = deploySupabase.slice(
    deploySupabase.indexOf("      - name: Deploy impacted Edge Functions"),
  );

  it("keeps every GitHub secret out of the job environment and setup actions", () => {
    expect(jobEnvironment).toContain("SUPABASE_URL:");
    expect(jobEnvironment).not.toContain("${{ secrets.");
    expect(secretEnvironmentNames(jobEnvironment)).toEqual([]);
    expect(beforeSecretSteps).not.toContain("${{ secrets.");
  });

  it("exposes function-provider secrets only while writing the private env file", () => {
    const expectedFunctionSecrets = [
      "ALLOWED_ORIGINS",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
      "FIREBASE_PROJECT_ID",
      "FIREBASE_SERVICE_ACCOUNT",
      "FIREBASE_TOKEN_URI",
      "FIRECRAWL_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_IMAGE_TIMEOUT_MS",
      "OPENAI_MODEL",
      "RESEND_API_KEY",
      "STRIPE_LIVE_WEBHOOK",
      "STRIPE_PERSONAL_SECRET_KEY",
      "STRIPE_PERSONNAL_SECRET_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_SECRET_KEY_LIVE",
      "STRIPE_SECRET_KEY_TEST",
      "STRIPE_TOK_ONE_SECRET_KEY",
      "STRIPE_TOK_ONE_TEST_SECRET_KEY",
      "STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET",
      "STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET",
      "STRIPE_TOK_ONE_WEBHOOK_SECRET",
      "STRIPE_TOK_ONE_WEBHOOK_SIGNING_SECRET",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_WEBHOOK_SECRET_LIVE",
      "STRIPE_WEBHOOK_SIGNING_SECRET",
      "STRIPE_WEBHOOK_SIGNING_SECRET_LIVE",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "TOK_AI_IMAGE_BUCKET",
      "TOK_GALLERY_IMAGE_BUCKET",
      "TOK_IMAGE_FAST_INTERACTIVE",
      "TOK_INTERACTIVE_IMAGE_TIMEOUT_MS",
      "TOK_SOURCE_IMAGE_TIMEOUT_MS",
    ].sort();

    expect(secretEnvironmentNames(prepareSecrets)).toEqual(expectedFunctionSecrets);
    expect(prepareSecrets).not.toContain("SUPABASE_ACCESS_TOKEN:");
    expect(prepareSecrets).not.toContain("SUPABASE_DB_PASSWORD:");

    for (const name of expectedFunctionSecrets) {
      expect(secretWriter).toContain(`"${name}"`);
    }
    expect(secretWriter).toContain("mode: 0o600");
    expect(secretWriter).toContain("fs.chmodSync(outFile, 0o600)");
  });

  it("gives Supabase CLI steps only the credentials they require", () => {
    expect(secretEnvironmentNames(assertOpenAi)).toEqual(["OPENAI_API_KEY"]);
    expect(secretEnvironmentNames(linkProject)).toEqual([
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_DB_PASSWORD",
    ]);
    expect(secretEnvironmentNames(syncSecrets)).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(secretEnvironmentNames(pushDatabase)).toEqual([
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_DB_PASSWORD",
    ]);
    expect(secretEnvironmentNames(deployFunctions)).toEqual(["SUPABASE_ACCESS_TOKEN"]);

    expect(syncSecrets).not.toContain("SUPABASE_DB_PASSWORD");
    expect(deployFunctions).not.toContain("SUPABASE_DB_PASSWORD");
    expect(linkProject).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(pushDatabase).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("scopes live production hardening credentials to their exact steps", () => {
    expect(workflow).not.toContain("APPLE_TEAM_ID");
    expect(workflow).not.toContain("ANDROID_KEYSTORE_BASE64");
    expect(workflow).not.toContain("write-apple-app-site-association.mjs");
    expect(workflow).toContain('RELEASE_READINESS_TARGET: "web"');
    expect(secretEnvironmentNames(preflightSupabaseAuth)).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(secretEnvironmentNames(preflightRuntimeSecurity)).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(preflightSupabaseAuth).not.toContain("SUPABASE_DB_PASSWORD");
    expect(preflightRuntimeSecurity).not.toContain("SUPABASE_DB_PASSWORD");
    expect(preflightSupabaseAuth).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(preflightRuntimeSecurity).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(preflightSupabaseAuth).toContain("id: supabase_auth_security");
    expect(preflightSupabaseAuth).toContain("ensure-supabase-auth-security.mjs");
    expect(preflightRuntimeSecurity).toContain("id: supabase_runtime_security");
    expect(preflightRuntimeSecurity).toContain("verify-supabase-runtime-security.mjs");
    expect(workflow).not.toContain("INTERNAL_CRON_SECRET: ${{ secrets.");
    expect(workflow).not.toContain("EMAIL_FROM: ${{ secrets.");
    expect(buildFrontend).toMatch(/needs:\n\s+- validation\n\s+- preflight/);
  });

  it("always removes the explicit temporary secrets file without printing it", () => {
    expect(secretEnvironmentNames(cleanupSecrets)).toEqual([]);
    expect(cleanupSecrets).toContain("always()");
    expect(cleanupSecrets).toContain('rm -f -- "${RUNNER_TEMP}/supabase.functions.env"');
    expect(cleanupSecrets).not.toContain("cat ");
    expect(cleanupSecrets).not.toContain("echo ");
  });
});
