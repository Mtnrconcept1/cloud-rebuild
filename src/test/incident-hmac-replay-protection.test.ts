import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("incident automation HMAC and replay protection", () => {
  it("signs the repository dispatch without including the signature in its canonical payload", () => {
    const edgeFunction = read("supabase/functions/ops-incident-control/index.ts");
    const workflow = read(".github/workflows/incident-codex-repair.yml");

    for (const marker of [
      "INCIDENT_SIGNATURE_VERSION",
      "buildIncidentDispatchCanonical",
      "dispatch_signature_version",
      "dispatch_nonce_hash",
      "signature_version",
      "context_token: contextToken",
      "timestamp: dispatchTimestamp",
      "nonce: dispatchNonce",
      "signature: dispatchSignature",
    ]) {
      expect(edgeFunction).toContain(marker);
    }

    expect(edgeFunction).toContain(
      "`${INCIDENT_SIGNATURE_VERSION}\\n${incidentId}\\n${timestamp}\\n${nonce}\\n${contextToken}`",
    );
    expect(edgeFunction).not.toContain("JSON.stringify(client_payload)");

    expect(workflow).toContain("Validate signed approved incident request");
    expect(workflow).toContain("timingSafeEqual");
    expect(workflow).toContain("DISPATCH_SIGNATURE_VERSION");
    expect(workflow).toContain("DISPATCH_TIMESTAMP");
    expect(workflow).toContain("DISPATCH_NONCE");
    expect(workflow).toContain("DISPATCH_SIGNATURE");
    expect(workflow).toContain("timestamp < now - 300");
    expect(workflow).toContain("timestamp > now + 60");
  });

  it("requires signed HTTP callbacks and records one-time request nonces", () => {
    const edgeFunction = read("supabase/functions/ops-incident-control/index.ts");
    const workflow = read(".github/workflows/incident-codex-repair.yml");
    const migration = read(
      "supabase/migrations/20260904150000_ops_incident_hmac_replay_protection.sql",
    );

    for (const marker of [
      "x-tok-signature-version",
      "x-tok-timestamp",
      "x-tok-nonce",
      "x-tok-signature",
      "assertSignedGithubRequest",
      "OPS_GITHUB_CALLBACK_SECRET_PREVIOUS",
      "ops_register_incident_request_nonce",
      "request_signature_replayed",
    ]) {
      expect(edgeFunction).toContain(marker);
    }

    expect(workflow).not.toContain('-H "x-ops-github-secret:');
    expect(workflow).toContain("sign_github_request");
    expect(workflow).toContain("x-tok-signature-version: v1");
    expect(workflow).toContain("x-tok-timestamp: $REQUEST_TIMESTAMP");
    expect(workflow).toContain("x-tok-nonce: $REQUEST_NONCE");
    expect(workflow).toContain("x-tok-signature: $REQUEST_SIGNATURE");

    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.ops_incident_request_nonces",
    );
    expect(migration).toContain("PRIMARY KEY (nonce_hash)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ops_register_incident_request_nonce");
    expect(migration).toContain("ops_consume_incident_dispatch");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("dispatch_consumed_by_run_id");
    expect(migration).toContain("GRANT EXECUTE");
    expect(migration).not.toMatch(/\b(?:TRUNCATE|DROP\s+TABLE)\b/i);
  });

  it("supports overlap windows for callback and scheduler secret rotation", () => {
    const edgeFunction = read("supabase/functions/ops-incident-control/index.ts");
    const auth = read("supabase/functions/_shared/auth.ts");
    const migration = read(
      "supabase/migrations/20260904150000_ops_incident_hmac_replay_protection.sql",
    );
    const runbook = read("docs/operations/internal-secret-rotation.md");

    expect(edgeFunction).toContain("OPS_GITHUB_CALLBACK_SECRET_PREVIOUS");
    expect(auth).toContain("INTERNAL_CRON_SECRET_PREVIOUS");
    expect(auth).toContain("CRON_SECRET_PREVIOUS");
    expect(migration).toContain("internal_cron_secret_previous");
    expect(migration).toContain("verify_internal_cron_secret");
    expect(migration).toContain("REVOKE ALL");
    expect(migration).toContain("TO service_role");

    for (const marker of [
      "Fenêtre de chevauchement",
      "Retour arrière",
      "OPS_GITHUB_CALLBACK_SECRET_PREVIOUS",
      "INTERNAL_CRON_SECRET_PREVIOUS",
      "internal_cron_secret_previous",
    ]) {
      expect(runbook).toContain(marker);
    }
  });

  it("keeps generated repair artifacts bounded", () => {
    const workflow = read(".github/workflows/incident-codex-repair.yml");

    expect(workflow).toContain("File exceeds the 5 MiB per-file size limit");
    expect(workflow).toContain("Total size of changed files exceeds the 8 MiB safety limit");
    expect(workflow).toContain("chmod 400 .codex-runtime/incident-context.json");
  });
});
