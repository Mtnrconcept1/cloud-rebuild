import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/sync-incident-secrets.yml",
  "utf8",
);
const writer = readFileSync(
  "scripts/write-supabase-secrets-env.mjs",
  "utf8",
);

const requiredIncidentSecrets = [
  "OPS_CONTROL_SECRET",
  "OPS_INGEST_SECRET",
  "OPS_GITHUB_CALLBACK_SECRET",
  "GITHUB_INCIDENT_TOKEN",
  "GITHUB_INCIDENT_REPOSITORY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_ADMIN_USER_ID",
  "TELEGRAM_WEBHOOK_SECRET",
];

const requiredWorkflowSecretBindings = [
  ["SUPABASE_ACCESS_TOKEN", "SUPABASE_ACCESS_TOKEN"],
  ["TOK_INCIDENT_GITHUB_CONTROL", "TOK_INCIDENT_GITHUB_CONTROL"],
  ["OPS_INGEST_SECRET", "OPS_INGEST_SECRET"],
  ["TOK_INCIDENT_GITHUB_SECRET", "TOK_INCIDENT_GITHUB_SECRET"],
  ["GITHUB_INCIDENT_TOKEN", "TOK_GITHUB_INCIDENT_TOKEN"],
  ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"],
  ["TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID"],
  ["TELEGRAM_ADMIN_USER_ID", "TELEGRAM_ADMIN_USER_ID"],
  ["TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_WEBHOOK_SECRET"],
] as const;

describe("TOK incident secret synchronization", () => {
  it("allows every runtime-only incident secret in the protected env writer", () => {
    for (const name of requiredIncidentSecrets) {
      expect(writer).toContain(`"${name}"`);
    }
    expect(writer).toContain("quoteEnvValue");
    expect(writer).toContain("fs.chmodSync(outFile, 0o600)");
  });

  it("syncs only through the production environment and exact Supabase project", () => {
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("SUPABASE_PROJECT_REF: wwcrtyoueexyxkkikaos");
    expect(workflow).toContain("supabase secrets set");
    expect(workflow).toContain("--project-ref \"$SUPABASE_PROJECT_REF\"");
    expect(workflow).not.toContain("service_role=");
    expect(workflow).not.toContain("OPS_CONTROL_SECRET=");
    expect(workflow).not.toContain("TELEGRAM_BOT_TOKEN=");
  });

  it("fails closed when a Telegram or Codex credential is absent", () => {
    for (const [envName, secretName] of requiredWorkflowSecretBindings) {
      expect(workflow).toContain(`${envName}: \${{ secrets.${secretName} }}`);
    }
    expect(workflow).toContain("Missing required production secret");
    expect(workflow).toContain("exit 1");
  });

  it("configures a signed Telegram callback webhook and verifies readiness", () => {
    expect(workflow).toContain("/setWebhook");
    expect(workflow).toContain("secret_token: process.env.TELEGRAM_WEBHOOK_SECRET");
    expect(workflow).toContain('allowed_updates: ["callback_query"]');
    expect(workflow).toContain("payload.telegramConfigured !== true");
    expect(workflow).toContain("payload.githubConfigured !== true");
    expect(workflow).toContain("payload.openAiConfigured !== true");
  });

  it("runs a controlled scan after the secrets and webhook are verified", () => {
    expect(workflow).toContain("Run initial incident scan");
    expect(workflow).toContain("x-ops-control-secret");
    expect(workflow).toContain("--data '{\"action\":\"scan\"}'");
    expect(workflow).toContain("Remove temporary incident secrets");
    expect(workflow).toContain("if: always()");
  });
});
