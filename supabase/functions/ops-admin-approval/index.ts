import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
  getEnv,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

const FUNCTION_NAME = "ops-admin-approval";
const REPOSITORY = "Mtnrconcept1/cloud-rebuild";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const BOUNDED_CODE_PATH = /^(src|scripts|supabase\/functions)\/[A-Za-z0-9._/-]+$/;

async function hashSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function completeRepairEligible(
  repairability: unknown,
  plan: Record<string, unknown> | null,
): boolean {
  if (!plan) return false;
  if (repairability === "code" && plan.codex_eligible === true) return true;
  if (repairability !== "external" && repairability !== "unknown") return false;

  const hasBoundedCodeTarget = stringList(plan.files_to_inspect).some((path) =>
    BOUNDED_CODE_PATH.test(path) && !/(^|\/)\.\.($|\/)/.test(path)
  );
  return hasBoundedCodeTarget
    && stringList(plan.repair_steps).length > 0
    && stringList(plan.validation_steps).length > 0;
}

function safeError(error: unknown) {
  return error instanceof HttpError ? error.message : "internal_error";
}

async function mainSha(): Promise<string> {
  const token = getEnv("GITHUB_INCIDENT_TOKEN");
  if (!token) throw new HttpError(503, "github_not_configured");
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/commits/main`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, "github_main_unavailable");
  const data = await response.json().catch(() => ({})) as { sha?: string };
  if (!/^[0-9a-f]{40}$/i.test(data.sha || "")) throw new HttpError(502, "github_revision_invalid");
  return String(data.sha);
}

async function dispatchIncident(
  incidentId: string,
  token: string,
  executionMode: "complete",
): Promise<void> {
  const githubToken = getEnv("GITHUB_INCIDENT_TOKEN");
  if (!githubToken || !getEnv("OPS_GITHUB_CALLBACK_SECRET")) {
    throw new HttpError(503, "repair_dispatch_not_configured");
  }
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "tok_incident_approved",
      client_payload: {
        incident_id: incidentId,
        context_token: token,
        execution_mode: executionMode,
        journal_report: true,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, "repair_dispatch_unavailable");
}

Deno.serve(async (req) => {
  let authenticatedActor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);

  try {
    if (req.headers.get("origin") !== "https://admin.thetok.ch") {
      throw new HttpError(403, "admin_origin_required");
    }
    const authorization = req.headers.get("authorization") || "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!jwt) throw new HttpError(401, "user_authentication_required");

    const actor = await authenticateRequest(req, { allowServiceRole: false });
    authenticatedActor = actor;
    requireUserRole(actor, ["admin"]);
    if (!actor.userId || !actor.userClient) throw new HttpError(403, "admin_identity_required");
    const assurance = await actor.userClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if (assurance.error || assurance.data?.currentLevel !== "aal2") {
      throw new HttpError(403, "admin_mfa_aal2_required");
    }

    const limiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await limiter.consume(`admin:${actor.userId}`, { maxRequests: 5, windowSeconds: 3600 });
    await limiter.consume("global", { maxRequests: 25, windowSeconds: 3600 });

    const MAX_BODY_BYTES = 65536;
    const length = Number(req.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) throw new HttpError(413, "approval_payload_too_large");
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError(400, "approval_body_required");
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new HttpError(413, "approval_payload_too_large");
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const part of chunks) { buffer.set(part, offset); offset += part.byteLength; }
    const raw = new TextDecoder().decode(buffer);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "invalid_json");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpError(400, "invalid_approval_payload");
    }

    const incidentId = typeof payload.incidentId === "string" ? payload.incidentId.toLowerCase() : "";
    const expectedHash = typeof payload.expectedEvidenceHash === "string"
      ? payload.expectedEvidenceHash.toLowerCase() : "";
    const proposedPlan = payload.expectedPlan;
    if (!UUID.test(incidentId) || !HASH.test(expectedHash)
      || !proposedPlan || typeof proposedPlan !== "object" || Array.isArray(proposedPlan)
      || payload.confirmation !== "APPROUVER"
      || payload.executionMode !== "complete"
      || payload.journalReport !== true) {
      throw new HttpError(400, "approval_validation_failed");
    }

    const { data: existing, error: lookupError } = await actor.adminClient
      .from("ops_incidents")
      .select("id, status, repairability, repair_plan, evidence_hash, sanitized_context")
      .eq("id", incidentId).maybeSingle();
    if (lookupError || !existing) throw new HttpError(404, "incident_unavailable");
    const storedPlan = existing.repair_plan as Record<string, unknown> | null;
    if (existing.status !== "awaiting_approval"
      || !completeRepairEligible(existing.repairability, storedPlan)) {
      throw new HttpError(409, "incident_not_eligible");
    }
    if (!getEnv("GITHUB_INCIDENT_TOKEN") || !getEnv("OPS_GITHUB_CALLBACK_SECRET")) {
      throw new HttpError(503, "repair_dispatch_not_configured");
    }
    const baseSha = await mainSha();
    const token = randomToken();
    const tokenHash = await hashSha256(token);
    const { error: approveError } = await actor.adminClient.rpc("ops_approve_incident_admin", {
      p_incident_id: incidentId,
      p_expected_evidence_hash: expectedHash,
      p_expected_plan: proposedPlan,
      p_actor_user_id: actor.userId,
    });
    if (approveError) throw new HttpError(409, "approval_expired_or_plan_changed");

    try {
      const sanitized = existing.sanitized_context && typeof existing.sanitized_context === "object"
        && !Array.isArray(existing.sanitized_context)
        ? existing.sanitized_context as Record<string, unknown> : {};
      const { data: updated, error: contextError } = await actor.adminClient
        .from("ops_incidents")
        .update({
          sanitized_context: {
            ...sanitized,
            approved_base_sha: baseSha,
            requested_repair_mode: "complete",
            repair_journal_requested: true,
          },
          repair_context_token_hash: tokenHash,
          repair_context_expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          failure_reason: null,
        })
        .eq("id", incidentId).eq("status", "approved").select("id").maybeSingle();
      if (contextError || !updated) throw new Error("context_update_failed");
      await dispatchIncident(incidentId, token, "complete");
    } catch {
      await actor.adminClient.from("ops_incidents").update({
        status: "failed",
        repair_context_token_hash: null,
        repair_context_expires_at: null,
        failure_reason: "admin_repair_dispatch_failed",
      }).eq("id", incidentId).eq("status", "approved");
      await actor.adminClient.from("ops_incident_events").insert({
        incident_id: incidentId,
        event_type: "codex_dispatch_failed",
        actor: `admin-ui:${actor.userId}`,
        payload: { reason: "admin_repair_dispatch_failed" },
      });
      throw new HttpError(502, "repair_dispatch_failed_no_production_change");
    }

    await actor.adminClient.from("ops_incident_events").insert({
      incident_id: incidentId,
      event_type: "codex_dispatch_requested",
      actor: `admin-ui:${actor.userId}`,
      payload: {
        approved_base_sha: baseSha,
        channel: "admin_ui",
        execution_mode: "complete",
        journal_report: true,
        max_repair_attempts: 3,
      },
    });
    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action: "approve",
      actor, request: req, status: "success",
      targetEntityType: "ops_incidents", targetEntityId: incidentId,
      metadata: {
        evidence_hash: expectedHash,
        codex_dispatched: true,
        execution_mode: "complete",
        journal_report: true,
      },
    });
    return jsonResponse({
      ok: true, decision: "approve", incidentId, codexDispatched: true,
    }, 200, cors);
  } catch (error) {
    if (authenticatedActor) {
      await writeAuditLog({
        adminClient: authenticatedActor.adminClient,
        functionName: FUNCTION_NAME,
        action: "approve",
        status: "failure",
        actor: authenticatedActor,
        request: req,
        errorMessage: safeError(error),
      }).catch(() => {});
    }
    return jsonResponse({ error: safeError(error) }, error instanceof HttpError ? error.status : 500, cors);
  }
});
