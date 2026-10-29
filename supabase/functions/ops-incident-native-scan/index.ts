import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "ops-incident-native-scan";
const CONTROL_FUNCTION_NAME = "ops-incident-control";
const OUTBOUND_TIMEOUT_MS = 115_000;

type IncidentScanResult = {
  ok?: boolean;
  activeFailures?: number;
  incidents?: unknown[];
  checkedSince?: string;
};

async function callIncidentControl() {
  const projectUrl = getEnv("SUPABASE_URL");
  const controlSecret = getEnv("OPS_CONTROL_SECRET");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!projectUrl) throw new HttpError(503, "supabase_url_not_configured");
  if (!controlSecret && !serviceRoleKey) {
    throw new HttpError(503, "ops_control_credentials_not_configured");
  }

  // This hop stays inside the Supabase project: when the dedicated control
  // secret has not been provisioned, the auto-provisioned service-role key
  // authenticates the scan so incident detection never silently stops.
  const authHeaders: Record<string, string> = controlSecret
    ? { "x-ops-control-secret": controlSecret }
    : { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${projectUrl.replace(/\/$/, "")}/functions/v1/${CONTROL_FUNCTION_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
          "User-Agent": "TOK-Native-Incident-Scanner/1.0",
        },
        body: JSON.stringify({ action: "scan" }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(504, "incident_scan_timeout");
    }
    throw new HttpError(502, "incident_scan_unreachable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new HttpError(502, `incident_scan_upstream_failed:${response.status}`);
  }

  let payload: IncidentScanResult;
  try {
    payload = await response.json() as IncidentScanResult;
  } catch {
    throw new HttpError(502, "incident_scan_invalid_response");
  }

  if (payload.ok !== true) {
    throw new HttpError(502, "incident_scan_rejected");
  }

  return payload;
}

async function callSentinelControl(): Promise<{ findings: number; notified: number }> {
  const projectUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) throw new HttpError(503, "sentinel_service_not_configured");
  const response = await fetch(
    `${projectUrl.replace(/\/$/, "")}/functions/v1/ops-sentinel-control`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "User-Agent": "TOK-Native-Sentinel-Scanner/1.0",
      },
      body: JSON.stringify({ action: "scan" }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new HttpError(502, "sentinel_scan_upstream_failed");
  const payload = await response.json().catch(() => null) as {
    ok?: boolean; findings?: number; notified?: number;
  } | null;
  if (!payload || payload.ok !== true) throw new HttpError(502, "sentinel_scan_invalid_response");
  return { findings: Number(payload.findings || 0), notified: Number(payload.notified || 0) };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  const adminClient = createAdminClient();
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    if (actor.authMode !== "scheduler_secret") {
      throw new HttpError(403, "scheduler_identity_required");
    }

    const result = await callIncidentControl();
    // Sentinel failure must never break the proven operations incident scanner.
    let sentinel: { findings: number; notified: number } | null = null;
    try {
      sentinel = await callSentinelControl();
    } catch {
      await writeAuditLog({
        adminClient, actor, request: req, functionName: FUNCTION_NAME,
        action: "scan_sentinel", status: "failure",
        errorMessage: "sentinel_scan_unavailable",
        metadata: { rid: log.rid },
      }).catch(() => {});
    }
    const activeFailures = Number.isFinite(Number(result.activeFailures))
      ? Math.max(0, Number(result.activeFailures))
      : 0;
    const incidentCount = Array.isArray(result.incidents) ? result.incidents.length : 0;

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "scan_runtime_incidents",
      status: "success",
      metadata: {
        rid: log.rid,
        active_failures: activeFailures,
        incident_count: incidentCount,
        checked_since: typeof result.checkedSince === "string" ? result.checkedSince : null,
      },
    });

    return jsonResponse(
      {
        ok: true,
        activeFailures,
        incidentCount,
        sentinelFindings: sentinel?.findings ?? null,
        sentinelNotifications: sentinel?.notified ?? null,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";

    log.error("request_failed", {
      status,
      message,
    });

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "scan_runtime_incidents",
      status: "failure",
      errorMessage: message.slice(0, 500),
      metadata: { rid: log.rid },
    });

    return jsonResponse(
      {
        error: status >= 500 ? "incident_scan_failed" : message,
        rid: log.rid,
      },
      status,
      corsHeaders,
    );
  }
});
