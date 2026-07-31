import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

type TypeScriptRuntime = {
  ModuleKind: { CommonJS: number };
  ScriptTarget: { ES2022: number };
  transpileModule: (
    source: string,
    options: {
      compilerOptions: { module: number; target: number };
      reportDiagnostics: boolean;
    },
  ) => { outputText: string; diagnostics?: unknown[] };
};

function loadTypeScript() {
  const configuredModule = process.env.TOK_TEST_TYPESCRIPT_MODULE?.trim();
  return nodeRequire(configuredModule || "typescript") as TypeScriptRuntime;
}

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function extractWorkflowStep(workflow: string, name: string) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start, `workflow step "${name}" should exist`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function extractMonitorEvidenceScript(workflow: string) {
  const marker = "          if ! node <<'NODE'\n";
  const start = workflow.indexOf(marker);
  expect(start, "inline evidence script should exist").toBeGreaterThanOrEqual(0);
  const scriptStart = start + marker.length;
  const end = workflow.indexOf("\n          NODE\n", scriptStart);
  expect(end, "inline evidence script terminator should exist").toBeGreaterThan(scriptStart);
  return workflow
    .slice(scriptStart, end)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

function extractNamedFunction(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}(`);
  expect(start, `function ${functionName} should exist`).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("{", start);
  expect(bodyStart, `function ${functionName} should have a body`).toBeGreaterThan(start);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Unable to extract function ${functionName}`);
}

type AuditRowFixture = {
  function_name: string;
  action: string;
  status: "success" | "failure";
  error_message: string | null;
  created_at: string;
};

function compileAuditFailureVerifier(edgeFunction: string) {
  const ts = loadTypeScript();
  const functionSource = extractNamedFunction(edgeFunction, "verifyCurrentAuditFailures");
  const harness = `
    type AuditLogRow = {
      function_name: string | null;
      action: string | null;
      status: string;
      error_message: string | null;
      created_at: string | null;
    };
    const FUNCTION_NAME = "ops-incident-control";
    function asText(value: unknown, maxLength = 1600, fallback = "") {
      const text = typeof value === "string" ? value.trim() : "";
      return (text || fallback).slice(0, maxLength);
    }
    function toIsoDate(value: unknown) {
      if (typeof value !== "string") return null;
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }
    function normalizeFingerprintText(value: string) {
      return value
        .toLowerCase()
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<uuid>")
        .replace(/\\b\\d{4,}\\b/g, "<number>")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 1400);
    }
    ${functionSource}
    export { verifyCurrentAuditFailures };
  `;
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  expect(result.diagnostics ?? []).toHaveLength(0);

  const loaded = { exports: {} as Record<string, unknown> };
  runInNewContext(result.outputText, { module: loaded, exports: loaded.exports });
  return loaded.exports.verifyCurrentAuditFailures as (
    rows: AuditRowFixture[],
  ) => Array<{ failures: AuditRowFixture[] }>;
}

type WorkflowEvidence = {
  primary_error: string;
  failed_jobs: Array<{
    id: number;
    conclusion: string;
    failed_steps: Array<{ conclusion: string }>;
    log_excerpt: string | null;
  }>;
};

function runMonitorEvidenceScript(
  script: string,
  jobs: Array<Record<string, unknown>>,
  logs: Record<string, string>,
) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "tok-workflow-evidence-"));
  const jobsFile = join(fixtureDir, "jobs.json");
  const evidenceFile = join(fixtureDir, "evidence.json");

  try {
    writeFileSync(jobsFile, JSON.stringify({ jobs }), "utf8");
    for (const [jobId, log] of Object.entries(logs)) {
      writeFileSync(join(fixtureDir, `${jobId}.log`), log, "utf8");
    }

    execFileSync(process.execPath, ["-e", script], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        JOBS_FILE: jobsFile,
        EVIDENCE_DIR: fixtureDir,
        EVIDENCE_FILE: evidenceFile,
      },
      stdio: "pipe",
      timeout: 5_000,
    });

    const raw = readFileSync(evidenceFile, "utf8");
    return {
      raw,
      evidence: JSON.parse(raw) as WorkflowEvidence,
    };
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
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

  it("reports a Codex run that found no safe change as an outcome, not a failure", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260728010000_ops_incident_no_changes_status.sql",
    );
    const edgeFunction = readProjectFile(
      "supabase/functions/ops-incident-control/index.ts",
    );

    // The status is allowed by the widened CHECK, and no previously valid value is dropped.
    expect(migration).toContain("'no_changes'");
    for (const status of [
      "'detected'",
      "'analyzing'",
      "'awaiting_approval'",
      "'approved'",
      "'repairing'",
      "'pr_open'",
      "'resolved'",
      "'rejected'",
      "'failed'",
      "'ignored'",
    ]) {
      expect(migration).toContain(status);
    }
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);

    // A recurrence must merge onto the reviewed incident instead of re-dispatching Codex.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ops_register_incident");
    expect(migration).toContain("occurrence_count = occurrence_count + 1");

    // The workflow outcome no longer collapses into "failed".
    expect(edgeFunction).toContain('no_changes: "no_changes"');
    expect(edgeFunction).not.toContain('no_changes: "failed"');
    expect(edgeFunction).toContain("Analyse terminée sans correctif");
  });

  it("expires stale incident states so a recurring failure can be repaired again", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260801090000_ops_incident_stale_recovery.sql",
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ops_register_incident");
    expect(migration).toContain("stale_incident_expired");
    expect(migration).toContain("approval_expired");
    expect(migration).toContain("repair_dispatch_timed_out");
    expect(migration).toContain("analysis_timed_out");
    expect(migration).toContain("repair_workflow_timed_out");
    expect(migration).toContain("no_changes_recurrence_window_expired");
    expect(migration).toContain("status = 'no_changes'");
    expect(migration).toContain("last_seen_at <= now() - interval '24 hours'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'no_changes'");
    expect(migration).toContain("occurrence_count = occurrence_count + 1");
    expect(migration).toContain("last_seen_at = now()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.ops_register_incident");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.ops_register_incident");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it("leases Google outbox claims and fences settlement with the claim token", () => {
    const migration = readProjectFile(
      "supabase/migrations/20260801100000_google_actions_center_outbox_claim_lease.sql",
    );

    for (const marker of [
      "claim_token uuid",
      "lease_expires_at timestamptz",
      "status = 'processing'",
      "FOR UPDATE SKIP LOCKED",
      "claim_token = gen_random_uuid()",
      "lease_expires_at = now() + interval '30 minutes'",
      "CREATE OR REPLACE FUNCTION public.settle_google_actions_center_outbox_claim",
      "AND claim_token = p_claim_token",
      "claim_token = NULL",
      "lease_expires_at = NULL",
      "RETURN false",
      "TO service_role",
    ]) {
      expect(migration).toContain(marker);
    }

    expect(migration).toContain("status IN ('pending', 'processing', 'sent', 'failed', 'abandoned')");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/\b(?:TRUNCATE|DELETE\s+FROM)\b/i);
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
      "GITHUB_SECRET",
      "IPV4",
      "PHONE",
      "PRIVATE_KEY",
      "SAFE_AUDIT_METADATA_KEYS",
      "analysis_model_requested",
      "analysis_model_returned",
      "analysis_error",
      'selectTokAiModel("admin_monitor", complexity)',
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
    expect(edgeFunction).toContain("resolveApprovedBaseSha");
    expect(edgeFunction).toContain("approved_base_sha: approvedBaseSha");
    expect(edgeFunction).toContain('throw new HttpError(409, "approved_base_sha_missing")');
    expect(edgeFunction).toContain('const CODEX_REPAIR_MODEL = "gpt-5.6-sol"');
    expect(edgeFunction).toContain('const CODEX_REPAIR_EFFORT = "high"');
    expect(edgeFunction).toContain("repair_model: CODEX_REPAIR_MODEL");
    expect(edgeFunction).toContain("reasoning_effort: CODEX_REPAIR_EFFORT");
    expect(edgeFunction).toContain("repairModel !== CODEX_REPAIR_MODEL");
    expect(edgeFunction).toContain("reasoningEffort !== CODEX_REPAIR_EFFORT");
    expect(edgeFunction).toContain("audit_metadata: sanitizeAuditMetadata");
    expect(edgeFunction).not.toContain("request_metadata: row.request_metadata");
    expect(edgeFunction).toContain('"Modification of the incident automation control plane"');
    expect(edgeFunction).not.toContain("gh pr merge");

    const metadataWhitelist = edgeFunction.match(
      /const SAFE_AUDIT_METADATA_KEYS = new Set\(\[([\s\S]*?)\]\);/,
    )?.[1];
    expect(metadataWhitelist, "safe audit metadata whitelist should exist").toBeTruthy();
    for (const key of ["claimed", "sent", "failed", "failure_codes"]) {
      expect(metadataWhitelist).toContain(`"${key}"`);
    }
  });

  it("keeps only failures from the segment after the most recent success", () => {
    const edgeFunction = readProjectFile(
      "supabase/functions/ops-incident-control/index.ts",
    );
    const verifyCurrentAuditFailures = compileAuditFailureVerifier(edgeFunction);
    const row = (
      status: "success" | "failure",
      createdAt: string,
      errorMessage: string | null,
    ): AuditRowFixture => ({
      function_name: "daily-dish-ai",
      action: "generate",
      status,
      error_message: errorMessage,
      created_at: createdAt,
    });
    const firstFailure = row("failure", "2026-08-01T00:00:00.000Z", "provider_timeout");
    const interveningSuccess = row("success", "2026-08-01T00:01:00.000Z", null);
    const latestFailure = row("failure", "2026-08-01T00:02:00.000Z", "provider_timeout");

    const active = verifyCurrentAuditFailures([
      firstFailure,
      interveningSuccess,
      latestFailure,
    ]);
    expect(active).toHaveLength(1);
    expect(active[0].failures).toHaveLength(1);
    expect(active[0].failures[0].created_at).toBe(latestFailure.created_at);

    const recovered = verifyCurrentAuditFailures([
      firstFailure,
      interveningSuccess,
      latestFailure,
      row("success", "2026-08-01T00:03:00.000Z", null),
    ]);
    expect(recovered).toHaveLength(0);
  });

  it("routes complex diagnostics to the strategic model independently from Codex repair", () => {
    const edgeFunction = readProjectFile(
      "supabase/functions/ops-incident-control/index.ts",
    );
    const sharedOpenAi = readProjectFile("supabase/functions/_shared/openai.ts");
    const selector = extractNamedFunction(sharedOpenAi, "selectTokAiModel");

    expect(edgeFunction).toMatch(
      /input\.source === "github_actions" \|\| severityRank\(input\.severity\) >= 3[\s\S]*?\? "complex"[\s\S]*?: "standard"/,
    );
    expect(edgeFunction).toContain('selectTokAiModel("admin_monitor", complexity)');
    expect(selector).toContain(
      'if (complexity === "complex") return TOK_AI_STRATEGIC_MODEL;',
    );
    expect(selector).toMatch(/case "admin_monitor":\s+return TOK_AI_MINI_MODEL;/);
  });

  it("isolates Codex, validation, and publication on separate runners", () => {
    const workflow = readProjectFile(
      ".github/workflows/incident-codex-repair.yml",
    );
    const codexStep = extractWorkflowStep(workflow, "Run Codex on the approved plan");
    const checkoutStep = extractWorkflowStep(workflow, "Checkout approved immutable base revision");
    const finalCallbackStep = extractWorkflowStep(workflow, "Send final status");

    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("tok_incident_approved");
    expect(workflow).not.toMatch(/^\s{0,2}workflow_dispatch:/m);
    expect(workflow).toMatch(
      /^env:\n  CODEX_REPAIR_MODEL: gpt-5\.6-sol\n  CODEX_REPAIR_EFFORT: high$/m,
    );
    expect(codexStep).toMatch(/uses: openai\/codex-action@[0-9a-f]{40}(?:\s+#\s+v\d+(?:\.\d+)*)?/);
    expect(codexStep).not.toMatch(/openai\/codex-action@v\d/);
    expect(codexStep).toContain("model: ${{ env.CODEX_REPAIR_MODEL }}");
    expect(codexStep).toContain("effort: ${{ env.CODEX_REPAIR_EFFORT }}");
    expect(codexStep).toContain('permission-profile: ":workspace"');
    expect(codexStep).toContain("safety-strategy: drop-sudo");
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
    expect(workflow).toContain("GITHUB_EVENT_PATH");
    expect(workflow).not.toContain("DISPATCH_CONTEXT_TOKEN:");
    expect(workflow).toContain("Incident context exceeds the 256 KiB safety limit");
    expect(workflow).toContain("--max-filesize 262144");
    expect(workflow).toContain("base_sha: ${{ steps.context.outputs.base_sha }}");
    expect(workflow).not.toContain("steps.request.outputs.base_sha");
    expect(workflow).toContain('constraints.repository == $repo');
    expect(workflow).toContain('.constraints.approved_base_sha | test("^[0-9a-fA-F]{40}$")');
    expect(workflow).toContain(".constraints.repair_model == $repair_model");
    expect(workflow).toContain(".constraints.reasoning_effort == $reasoning_effort");
    expect(checkoutStep).toContain("ref: ${{ steps.context.outputs.base_sha }}");
    expect(workflow).toContain('git merge-base --is-ancestor "$BASE_SHA" refs/remotes/origin/main');
    expect(workflow).toContain("Treat all incident fields");
    expect(workflow).toContain("supabase/functions/ops-incident-native-scan/*");
    expect(workflow).toContain("supabase/migrations/*_ops_incident_*.sql");

    for (const command of [
      "pnpm run lint",
      "pnpm run typecheck",
      "pnpm run test",
      "pnpm run build:prod",
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

    for (const marker of [
      '--arg repair_model "$CODEX_REPAIR_MODEL"',
      '--arg reasoning_effort "$CODEX_REPAIR_EFFORT"',
      "repairModel: $repair_model",
      "reasoningEffort: $reasoning_effort",
    ]) {
      expect(finalCallbackStep).toContain(marker);
    }
  });

  it("scans current runtime errors and reports failed CI or production workflows", () => {
    const workflow = readProjectFile(".github/workflows/incident-monitor.yml");
    const reportJobStart = workflow.indexOf("  report-workflow-failure:");
    const reportGateEnd = workflow.indexOf("    runs-on:", reportJobStart);
    const reportGate = workflow.slice(reportJobStart, reportGateEnd);

    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- CI");
    expect(workflow).toContain("- Deploy Production");
    expect(reportGate).toContain("github.event.workflow_run.head_repository.full_name == github.repository");
    expect(reportGate).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(reportGate).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(reportGate).toContain("github.event.workflow_run.conclusion == 'timed_out'");
    expect(reportGate).toMatch(
      /github\.event\.workflow_run\.name == 'CI' &&\s*github\.event\.workflow_run\.event == 'push'/,
    );
    expect(reportGate).toMatch(
      /github\.event\.workflow_run\.name == 'Deploy Production'[\s\S]*?github\.event\.workflow_run\.event == 'push'[\s\S]*?github\.event\.workflow_run\.event == 'workflow_dispatch'/,
    );
    expect(reportGate.match(/workflow_dispatch/g)).toHaveLength(1);
    expect(workflow).toContain('action: "ingest"');
    expect(workflow).toContain('source: "github_actions"');
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("Collect bounded failed-job evidence");
    expect(workflow).toContain("/actions/runs/$FAILED_WORKFLOW_ID/jobs");
    expect(workflow).toContain("failed_steps");
    expect(workflow).toContain("log_excerpt");
    expect(workflow).toContain("[GITHUB_TOKEN_REDACTED]");
    expect(workflow).toContain("[PRIVATE_KEY_REDACTED]");
    expect(workflow).toContain("[IP_REDACTED]");
    expect(workflow).toContain("const maxEvidenceBytes = 24576");
    expect(workflow).toContain('fingerprint: ("github_actions:" + $workflow + ":" + $sha)');
    expect(workflow).toContain("evidence_bounded");
    expect(workflow).toContain('--data \'{"action":"scan"}\'');
    expect(workflow).toContain("--max-time 120");
    expect(workflow).not.toContain("pull_request_target");
  });

  it("executes the bounded workflow evidence collector and prioritizes the real failure", () => {
    const workflow = readProjectFile(".github/workflows/incident-monitor.yml");
    const script = extractMonitorEvidenceScript(workflow);
    const longName = "job-" + "n".repeat(240);
    const longStepName = "step-" + "s".repeat(240);
    const steps = (offset: number) => Array.from({ length: 8 }, (_, index) => ({
      number: offset + index,
      name: `${longStepName}-${index}`,
      conclusion: index % 3 === 0
        ? "cancelled"
        : index % 3 === 1
        ? "failure"
        : "timed_out",
    }));
    const jobs = [
      {
        id: 1,
        name: `cancelled-first-${longName}`,
        conclusion: "cancelled",
        html_url: `https://github.com/example/repo/actions/jobs/${"c".repeat(430)}`,
        steps: steps(100),
      },
      {
        id: 20,
        name: `real-failure-${longName}`,
        conclusion: "failure",
        html_url: `https://github.com/example/repo/actions/jobs/${"f".repeat(430)}`,
        steps: steps(200),
      },
      {
        id: 30,
        name: `second-failure-${longName}`,
        conclusion: "failure",
        html_url: `https://github.com/example/repo/actions/jobs/${"g".repeat(430)}`,
        steps: steps(300),
      },
      {
        id: 10,
        name: `timed-out-${longName}`,
        conclusion: "timed_out",
        html_url: `https://github.com/example/repo/actions/jobs/${"t".repeat(430)}`,
        steps: steps(400),
      },
      {
        id: 40,
        name: `extra-cancelled-${longName}`,
        conclusion: "cancelled",
        html_url: `https://github.com/example/repo/actions/jobs/${"x".repeat(430)}`,
        steps: steps(500),
      },
    ];

    const basicSecret = "dXNlcjpzdXBlci1zZWNyZXQ=";
    const apiKeySecret = "tok-api-key-super-secret";
    const awsSecret = "AKIAABCDEFGHIJKLMNOP";
    const urlCredentials = "alice:hunter2";
    const primaryLog = [
      `Authorization: Basic ${basicSecret}`,
      `x-api-key: ${apiKeySecret}`,
      "##[error]Fatal: TypeScript compile failure in src/main.ts",
      `AWS=${awsSecret} remote=https://${urlCredentials}@example.com/private`,
      "Process completed with exit code 1.",
    ].join("\n");
    const secondaryLog = (jobId: number) => Array.from(
      { length: 16 },
      (_, index) => `##[error]Fatal: secondary failure ${jobId}-${index} ${"x".repeat(680)}`,
    ).join("\n");

    const { raw, evidence } = runMonitorEvidenceScript(script, jobs, {
      "1": secondaryLog(1),
      "10": secondaryLog(10),
      "20": primaryLog,
      "30": secondaryLog(30),
      "40": secondaryLog(40),
    });

    expect(evidence.failed_jobs).toHaveLength(4);
    expect(evidence.failed_jobs[0]).toMatchObject({ id: 20, conclusion: "failure" });
    expect(evidence.failed_jobs.every((job) => job.failed_steps.length === 6)).toBe(true);
    expect(evidence.failed_jobs[0].failed_steps[0].conclusion).toBe("failure");
    expect(evidence.primary_error).toContain("Fatal: TypeScript compile failure in src/main.ts");
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(24_576);

    for (const secret of [basicSecret, apiKeySecret, awsSecret, urlCredentials]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain("Authorization: [REDACTED]");
    expect(raw).toContain("x-api-key: [REDACTED]");
    expect(raw).toContain("[AWS_ACCESS_KEY_REDACTED]");
    expect(raw).toContain("https://[REDACTED]@example.com/private");
  });

  it("makes the observed Google Actions Center failures visible to the scanner", () => {
    const edgeFunction = readProjectFile(
      "supabase/functions/google-actions-center-sync/index.ts",
    );
    const idleStart = edgeFunction.indexOf("if (rows.length === 0) {");
    const idleEnd = edgeFunction.indexOf("// Minted once per batch", idleStart);
    const idleBlock = edgeFunction.slice(idleStart, idleEnd);
    const authIndex = edgeFunction.indexOf("const authenticated = await authenticateRequest");
    const actorAssignmentIndex = edgeFunction.indexOf("actor = authenticated", authIndex);
    const firstAuditIndex = edgeFunction.indexOf("await writeAuditLog({", actorAssignmentIndex);
    const handlerCatch = edgeFunction.slice(edgeFunction.lastIndexOf("  } catch (error) {"));

    expect(edgeFunction).toContain("writeAuditLog");
    expect(edgeFunction).toContain('action = "sync_google_actions_center"');
    expect(edgeFunction).toContain("google_delivery_batch_failed");
    expect(edgeFunction).toContain("failure_codes");
    expect(edgeFunction).toContain('status: "failure"');
    expect(edgeFunction).not.toContain("private_key,");
    expect(idleStart).toBeGreaterThanOrEqual(0);
    expect(idleEnd).toBeGreaterThan(idleStart);
    expect(idleBlock).not.toContain("writeAuditLog");
    expect(idleBlock).not.toContain('status: "success"');
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(actorAssignmentIndex).toBeGreaterThan(authIndex);
    expect(firstAuditIndex).toBeGreaterThan(actorAssignmentIndex);
    expect(handlerCatch).toMatch(/if \(actor\) \{[\s\S]*?await writeAuditLog\(\{/);
    expect(edgeFunction).toContain(
      "const stableFailureCodes = [...failureCodes].sort().slice(0, 10);",
    );
    expect(edgeFunction).toContain(
      '`google_delivery_batch_failed:${stableFailureCodes.join(",") || "unknown_error"}`',
    );
    expect(edgeFunction).not.toContain(
      '`google_delivery_batch_failed:${failed}/${rows.length}`',
    );
    expect(edgeFunction).toContain("hasOutstandingDeliveryFailures");
    expect(edgeFunction).toContain('.or("status.eq.processing,last_error.not.is.null")');
    expect(edgeFunction).toMatch(
      /if \(failed === 0 && await hasOutstandingDeliveryFailures\(actor\.adminClient\)\)[\s\S]*?return jsonResponse/,
    );
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
