import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

type AiImageJobTool = "marketing_studio" | "photopro" | "menu_photo" | "advisor_photo" | "unknown";
type AiImageJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type AiImageJobRow = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  tool: AiImageJobTool;
  title: string;
  request: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: AiImageJobStatus;
  error_message: string | null;
  generated_asset_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const FUNCTION_NAME = "ai-image-job";
const IMAGE_FUNCTION_NAME = "ai-image-enhance";
const VALID_TOOLS = new Set<AiImageJobTool>(["marketing_studio", "photopro", "menu_photo", "advisor_photo", "unknown"]);

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeTool(value: unknown): AiImageJobTool {
  const raw = sanitizeText(value, 48) as AiImageJobTool;
  return VALID_TOOLS.has(raw) ? raw : "unknown";
}

function getSupabaseFunctionUrl(functionName: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(503, "supabase_url_missing");
  return `${baseUrl}/functions/v1/${functionName}`;
}

function getAnonKey() {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!anonKey) throw new HttpError(503, "supabase_anon_key_missing");
  return anonKey;
}

async function readErrorMessage(response: Response) {
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  }

  const text = await response.text().catch(() => "");
  return text.trim() || `image_job_failed_${response.status}`;
}

function extractAssetId(result: Record<string, unknown> | null) {
  const assetId = result?.assetId;
  return typeof assetId === "string" && assetId.trim() ? assetId.trim() : null;
}

function serializeJob(row: AiImageJobRow) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    userId: row.user_id,
    tool: row.tool,
    title: row.title,
    request: row.request,
    result: row.result,
    status: row.status,
    errorMessage: row.error_message,
    generatedAssetId: row.generated_asset_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function waitUntilBackground(promise: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(promise);
    return;
  }

  void promise;
}

async function runImageGenerationJob(input: {
  adminClient: Awaited<ReturnType<typeof authenticateRequest>>["adminClient"];
  jobId: string;
  request: Record<string, unknown>;
  authorization: string;
  corsMetadata: Record<string, unknown>;
}) {
  const startedAt = new Date().toISOString();

  await input.adminClient
    .from("ai_image_jobs")
    .update({ status: "running", started_at: startedAt, error_message: null })
    .eq("id", input.jobId);

  try {
    const response = await fetch(getSupabaseFunctionUrl(IMAGE_FUNCTION_NAME), {
      method: "POST",
      headers: {
        Authorization: input.authorization,
        apikey: getAnonKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.request),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const result = await response.json() as Record<string, unknown>;
    await input.adminClient
      .from("ai_image_jobs")
      .update({
        status: "completed",
        result,
        generated_asset_id: extractAssetId(result),
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", input.jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "image_job_failed";
    await input.adminClient
      .from("ai_image_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.jobId);

    console.error(`[${FUNCTION_NAME}] background job failed`, {
      jobId: input.jobId,
      error: message,
      ...input.corsMetadata,
    });
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let jobId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    const action = sanitizeText(body.action, 24) || "start";

    if (action === "status") {
      jobId = maybeUuid(body.jobId);
      if (!jobId) throw new HttpError(400, "job_required");

      const { data: row, error } = await actor.adminClient
        .from("ai_image_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();

      if (error) throw new HttpError(500, error.message);
      if (!row) throw new HttpError(404, "job_not_found");

      await requireRestaurantAccess(actor, row.restaurant_id);
      if (!actor.isAdmin && row.user_id && row.user_id !== actor.userId) {
        throw new HttpError(403, "Forbidden");
      }

      return jsonResponse({ job: serializeJob(row as AiImageJobRow) }, 200, cors);
    }

    if (action !== "start") throw new HttpError(400, "unsupported_action");

    const requestPayload = body.request && typeof body.request === "object" && !Array.isArray(body.request)
      ? body.request as Record<string, unknown>
      : {};
    const restaurantId = maybeUuid(requestPayload.restaurantId ?? body.restaurantId);
    if (!restaurantId) throw new HttpError(400, "restaurant_required");

    await requireRestaurantAccess(actor, restaurantId);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 30, windowSeconds: 600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 90, windowSeconds: 600 });
    await rl.consume("global", { maxRequests: 240, windowSeconds: 60 });

    const tool = normalizeTool(body.tool);
    const title = sanitizeText(body.title, 180) || "Creation IA TOK";
    const authorization = req.headers.get("Authorization") || "";

    const { data: inserted, error: insertError } = await actor.adminClient
      .from("ai_image_jobs")
      .insert({
        restaurant_id: restaurantId,
        user_id: actor.userId,
        tool,
        title,
        request: requestPayload,
        status: "queued",
      })
      .select("*")
      .single();

    if (insertError) throw new HttpError(500, insertError.message);

    const row = inserted as AiImageJobRow;
    jobId = row.id;
    waitUntilBackground(runImageGenerationJob({
      adminClient: actor.adminClient,
      jobId,
      request: requestPayload,
      authorization,
      corsMetadata: { rid: log.rid, restaurant_id: restaurantId },
    }));

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "start_image_job",
      actor,
      request: req,
      targetEntityType: "ai_image_jobs",
      targetEntityId: jobId,
      metadata: { rid: log.rid, restaurant_id: restaurantId, tool },
    }).catch(() => {});

    return jsonResponse({ job: serializeJob(row) }, 202, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message, job_id: jobId });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: "image_job",
        actor,
        request: req,
        targetEntityType: "ai_image_jobs",
        targetEntityId: jobId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
