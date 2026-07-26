import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("human-approved Telegram and Codex incident automation", () => {
  it("creates a service-role incident ledger with admin read-only RLS", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260726053000_ops_incident_automation.sql",
    );

    for (const table of ["ops_incidents", "ops_incident_events"]) {
      expect(migration).toMatch(
        new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"),
      );
      expect(migration).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"),
      );
      expect(migration).toContain(`REVOKE ALL ON public.${table} FROM anon, authenticated`);
      expect(migration).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
    }

    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.ops_incidents TO service_role");
    expect(migration).toContain("GRANT SELECT, INSERT ON public.ops_incident_events TO service_role");
    expect(migration).not.toContain("GRANT ALL ON public.ops_incident_events TO service_role");
    expect(migration).toContain("USING (public.auth_is_admin())");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ops_register_incident");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ops_decide_incident");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Service role required.");
    expect(migration).toContain("occurrence_count = occurrence_count + 1");
    expect(migration).toContain("WHEN 'critical' THEN 4");
    expect(migration).not.toMatch(/TO authenticated\s+WITH CHECK\s*\(true\)/i);
  });

  it("requires signed collectors, Telegram identity, bounded payloads, and sanitized context", () => {
    const edgeFunction = readProjectFile(
      "supabase/functions/ops-incident-control/index.ts",
    );
    const config = readProjectFile("supabase/config.toml");

    expect(config).toContain("[functions.ops-incident-control]");
    expect(config).toMatch(/\[functions\.ops-incident-control\]\s+verify_jwt = false/);

    for (const marker of [
      "x-ops-control-secret",
      "x-ops-ingest-secret",
      "x-ops-github-secret",
      "x-telegram-bot-api-secret-token",
      "TELEGRAM_ADMIN_CHAT_ID",
      "TELEGRAM_ADMIN_USER_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "approval_token_hash",
      "approval_expires_at",
      "repair_context_token_hash",
      "repair_context_expires_at",
      "MAX_REQUEST_BODY_BYTES",
      "readJsonBody",
      "sanitizeValue",
      "safeEqual",
      "sha256Hex",
      "incident_bound_to_another_github_run",
    ]) {
      expect(edgeFunction).toContain(marker);
    }

    expect(edgeFunction).toContain('row.status === "failure" && asText(row.error_message');
    expect(edgeFunction).toContain('row.status === "success"');
    expect(edgeFunction).toContain('verification: "no_success_after_last_failure"');
    expect(edgeFunction).toContain('functionName === FUNCTION_NAME');
    expect(edgeFunction).toContain('event_type: "tok_incident_approved"');
    expect(edgeFunction).toContain("fingerprintHint");
    expect(edgeFunction).not.toContain("input.summary,\n    JSON.stringify(input.technicalDetails)");
    expect(edgeFunction).toContain("automatic_merge: false");
    expect(edgeFunction).toContain("automatic_production_deploy: false");
    expect(edgeFunction).toContain('"Modification of the incident automation control plane"');
    expect(edgeFunction).not.toContain("gh pr merge");
  });

  it("isolates Codex, validation, and publication on separate runners", () => {
    const workflow = readProjectFile(
      ".github/workflows/incident-codex-repair.yml",
    );

    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("tok_incident_approved");
    expect(workflow).toContain("uses: openai/codex-action@v1");
    expect(workflow).toContain('permission-profile: ":workspace"');
    expect(workflow).toContain("safety-strategy: drop-sudo");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("prepare:");
    expect(workflow).toContain("validate:");
    expect(workflow).toContain("publish:");
    expect(workflow).toContain("report:");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("uses: actions/download-artifact@v4");
    expect(workflow).toContain("git apply --check --whitespace=error-all");
    expect(workflow).toContain("core.hooksPath=/dev/null");
    expect(workflow).toContain("TOK_CODEX_GITHUB_TOKEN: ${{ secrets.TOK_CODEX_GITHUB_TOKEN }}");
    expect(workflow).toContain("GH_TOKEN: ${{ secrets.TOK_CODEX_GITHUB_TOKEN }}");
    expect(workflow).not.toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toMatch(/permissions:\s+contents: read/);
    expect(workflow).not.toMatch(/permissions:\s+[\s\S]{0,120}contents: write/);
    expect(workflow).not.toContain("pull-requests: write");

    for (const command of [
      "pnpm run lint",
      "pnpm run typecheck",
      "pnpm run test",
      "pnpm run build",
    ]) {
      expect(workflow).toContain(command);
    }

    for (const protectedMarker of [
      ".github/*",
      "AGENTS.md",
      "docs/skills/*",
      "supabase/config.toml",
      "Existing migrations are immutable",
      "Destructive SQL is not allowed",
      "Symlink changes are not allowed",
    ]) {
      expect(workflow).toContain(protectedMarker);
    }

    expect(workflow).toContain("git switch -c \"$REPAIR_BRANCH\"");
    expect(workflow).toContain("gh pr create");
    expect(workflow).toContain("--base main");
    expect(workflow).not.toContain("gh pr merge");
    expect(workflow).not.toContain("git push origin main");
  });

  it("scans current runtime errors and reports failed CI or production workflows", () => {
    const workflow = readProjectFile(".github/workflows/incident-monitor.yml");

    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- CI");
    expect(workflow).toContain("- Deploy Production");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.event.workflow_run.name == 'Deploy Production'");
    expect(workflow).toContain('action: "ingest"');
    expect(workflow).toContain('source: "github_actions"');
    expect(workflow).toContain('--data \'{"action":"scan"}\'');
    expect(workflow).toContain("--max-time 120");
    expect(workflow).not.toContain("pull_request_target");
  });

  it("documents activation, least privilege, smoke testing, and rollback", () => {
    const docs = readProjectFile(
      "docs/operations/telegram-codex-incidents.md",
    );

    for (const marker of [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_ADMIN_CHAT_ID",
      "TELEGRAM_ADMIN_USER_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "GITHUB_INCIDENT_TOKEN",
      "OPS_INGEST_SECRET",
      "OPS_CONTROL_SECRET",
      "OPS_GITHUB_CALLBACK_SECRET",
      "TOK_CODEX_GITHUB_TOKEN",
      "TOK_INCIDENT_CONTROL_URL",
      "Test d'incident manuel non destructif",
      "runner neuf",
      "groupingKey",
      "Retour arrière",
      "Aucune fusion",
    ]) {
      expect(docs).toContain(marker);
    }
  });
});
