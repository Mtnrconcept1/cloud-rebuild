import {
  HttpError,
  type RequestActor,
} from "./auth.ts";

export type CommercialDemoAiAction = "chat" | "visual_generate" | "visual_history";
export type CommercialDemoChatTool = "assistant" | "support_chat";
export type CommercialDemoVisualTool = "marketing_studio" | "photo_studio" | "advisor_visual";
export type CommercialDemoAiTool = CommercialDemoChatTool | CommercialDemoVisualTool;
export type CommercialDemoSurface = "client" | "restaurant" | "courier";

export type CommercialDemoAiContext = {
  actor: RequestActor;
  sessionId: string;
  commercialUserId: string;
  demoRestaurantId: string;
  restaurant: {
    id: string;
    name: string;
    city: string | null;
    cuisine_type: string | null;
  };
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type CommercialDemoAiClaim = {
  state: "claimed" | "replay" | "mismatch" | "in_progress" | "failed" | "busy" | "circuit_open";
  request_id?: string;
  response?: Record<string, unknown>;
  error_code?: string;
  retry_after_seconds?: number;
  recovered_stale_lock?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const COMMERCIAL_DEMO_AI_BUCKET = "commercial-demo-ai";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireUuid(value: unknown, errorCode: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, errorCode);
  }
  return value;
}

export function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizeObject(value: unknown, maxBytes = 32_768): JsonRecord {
  const record = isRecord(value) ? value : {};
  const serialized = JSON.stringify(record);
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new HttpError(413, "context_too_large");
  }
  return record;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  const sorted: JsonRecord = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function resolveCommercialDemoAiContext(
  actor: RequestActor,
  sessionId: string,
): Promise<CommercialDemoAiContext> {
  if (!actor.userId || actor.authMode !== "user_jwt") {
    throw new HttpError(401, "Unauthorized");
  }

  const normalizedRoles = actor.roles.map((role) => role.trim().toLowerCase());
  const isCommercial = normalizedRoles.includes("commercial");
  if (!isCommercial && !actor.isAdmin) {
    throw new HttpError(403, "commercial_demo_ai_forbidden");
  }

  const { data: session, error: sessionError } = await actor.adminClient
    .from("commercial_demo_order_sessions")
    .select("id, commercial_user_id, demo_restaurant_id, status")
    .eq("id", sessionId)
    .eq("status", "active")
    .maybeSingle();

  if (sessionError) throw new HttpError(503, "commercial_demo_session_check_unavailable");
  if (!session) throw new HttpError(404, "commercial_demo_session_not_found");

  // Even an administrator must own the durable commercial-demo mapping. This
  // prevents an admin JWT from becoming an arbitrary session impersonator.
  if (session.commercial_user_id !== actor.userId) {
    throw new HttpError(403, "commercial_demo_ai_forbidden");
  }

  const [{ data: account, error: accountError }, { data: restaurant, error: restaurantError }] =
    await Promise.all([
      actor.adminClient
        .from("commercial_demo_accounts")
        .select("user_id, demo_restaurant_id, is_active")
        .eq("user_id", session.commercial_user_id)
        .eq("demo_restaurant_id", session.demo_restaurant_id)
        .eq("is_active", true)
        .maybeSingle(),
      actor.adminClient
        .from("restaurants")
        .select("id, name, city, cuisine_type, is_demo")
        .eq("id", session.demo_restaurant_id)
        .eq("is_demo", true)
        .maybeSingle(),
    ]);

  if (accountError || restaurantError) {
    throw new HttpError(503, "commercial_demo_mapping_check_unavailable");
  }
  if (!account || !restaurant) {
    throw new HttpError(403, "commercial_demo_mapping_invalid");
  }

  return {
    actor,
    sessionId,
    commercialUserId: session.commercial_user_id,
    demoRestaurantId: session.demo_restaurant_id,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name || "Restaurant Démo",
      city: restaurant.city || null,
      cuisine_type: restaurant.cuisine_type || null,
    },
  };
}

function requiredFeature(action: CommercialDemoAiAction, tool: CommercialDemoAiTool | null) {
  if (action === "chat") {
    return tool === "support_chat" ? "ai_support_chat" : "dashboard-advisor";
  }
  if (tool === "advisor_visual") return "dashboard-advisor";
  return "dashboard-photos";
}

export async function requireCommercialDemoAiFeature(
  context: CommercialDemoAiContext,
  action: CommercialDemoAiAction,
  tool: CommercialDemoAiTool | null,
) {
  const feature = requiredFeature(action, tool);
  const { data, error } = await context.actor.adminClient
    .from("feature_flags")
    .select("name, is_active")
    .eq("name", feature)
    .maybeSingle();

  if (error) throw new HttpError(503, "feature_flag_check_unavailable");
  if (!data?.is_active) throw new HttpError(403, "commercial_demo_ai_feature_disabled");
  return feature;
}

export async function loadCommercialDemoPromptContext(context: CommercialDemoAiContext) {
  const [orderResult, reservationsResult] = await Promise.all([
    context.actor.adminClient
      .from("commercial_demo_orders")
      .select("status, payment_status, total_amount_cents, updated_at")
      .eq("session_id", context.sessionId)
      .maybeSingle(),
    context.actor.adminClient
      .from("commercial_demo_reservations")
      .select("status, reservation_date, reservation_time, party_size")
      .eq("session_id", context.sessionId)
      .order("reservation_date", { ascending: false })
      .limit(20),
  ]);

  if (orderResult.error || reservationsResult.error) {
    throw new HttpError(503, "commercial_demo_context_unavailable");
  }

  return {
    restaurant: context.restaurant,
    simulated_order: orderResult.data || null,
    simulated_reservations: reservationsResult.data || [],
  };
}

export async function loadCommercialDemoConversationMessages(
  context: CommercialDemoAiContext,
  conversationId: string | null,
  tool: CommercialDemoChatTool,
) {
  if (!conversationId) return [];
  requireUuid(conversationId, "conversation_id_invalid");

  const { data: conversation, error: conversationError } = await context.actor.adminClient
    .from("commercial_demo_ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("session_id", context.sessionId)
    .eq("commercial_user_id", context.commercialUserId)
    .eq("demo_restaurant_id", context.demoRestaurantId)
    .eq("tool", tool)
    .eq("status", "active")
    .maybeSingle();

  if (conversationError) throw new HttpError(503, "commercial_demo_ai_history_unavailable");
  if (!conversation) throw new HttpError(404, "commercial_demo_ai_conversation_not_found");

  const { data: messages, error: messagesError } = await context.actor.adminClient
    .from("commercial_demo_ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    // Legacy message pairs were inserted with the same statement timestamp.
    // assistant < user, then reverse() below, preserves user -> assistant.
    .order("role", { ascending: true })
    .order("id", { ascending: false })
    .limit(16);

  if (messagesError) throw new HttpError(503, "commercial_demo_ai_history_unavailable");
  return (messages || []).reverse().map((message: JsonRecord) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: sanitizeText(message.content, 4000),
  }));
}

export async function claimCommercialDemoAiRequest(input: {
  context: CommercialDemoAiContext;
  requestId: string;
  action: "chat" | "visual_generate";
  tool: CommercialDemoAiTool;
  payloadHash: string;
  lockToken: string;
}) {
  if (!HEX_SHA256_PATTERN.test(input.payloadHash)) {
    throw new HttpError(500, "payload_hash_invalid");
  }

  const { data, error } = await input.context.actor.adminClient.rpc(
    "commercial_demo_ai_claim_request",
    {
      p_request_id: input.requestId,
      p_session_id: input.context.sessionId,
      p_actor_user_id: input.context.actor.userId,
      p_commercial_user_id: input.context.commercialUserId,
      p_demo_restaurant_id: input.context.demoRestaurantId,
      p_action: input.action,
      p_tool: input.tool,
      p_payload_hash: input.payloadHash,
      p_lock_token: input.lockToken,
    },
  );

  if (error || !isRecord(data) || typeof data.state !== "string") {
    throw new HttpError(503, "commercial_demo_ai_claim_unavailable");
  }
  return data as CommercialDemoAiClaim;
}

export async function completeCommercialDemoChat(input: {
  context: CommercialDemoAiContext;
  requestId: string;
  lockToken: string;
  message: string;
  clientContext: JsonRecord;
  conversationId: string | null;
  surface: CommercialDemoSurface;
  reply: string;
  model: string;
  providerResponseId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostChf: number;
}) {
  const { data, error } = await input.context.actor.adminClient.rpc(
    "commercial_demo_ai_complete_chat_request",
    {
      p_request_id: input.requestId,
      p_lock_token: input.lockToken,
      p_message: input.message,
      p_context: input.clientContext,
      p_conversation_id: input.conversationId,
      p_surface: input.surface,
      p_reply: input.reply,
      p_model: input.model,
      p_provider_response_id: input.providerResponseId,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_total_tokens: input.totalTokens,
      p_estimated_cost_chf: input.estimatedCostChf,
    },
  );

  if (error || !isRecord(data)) {
    throw new HttpError(503, "commercial_demo_ai_completion_unavailable");
  }
  return data;
}

export async function completeCommercialDemoVisual(input: {
  context: CommercialDemoAiContext;
  requestId: string;
  lockToken: string;
  prompt: string;
  format: "landscape" | "square" | "portrait";
  style: string;
  clientContext: JsonRecord;
  storagePath: string;
  outputSha256: string;
  model: string;
  providerResponseId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostChf: number;
  width: number;
  height: number;
  altText: string;
}) {
  const { data, error } = await input.context.actor.adminClient.rpc(
    "commercial_demo_ai_complete_visual_request",
    {
      p_request_id: input.requestId,
      p_lock_token: input.lockToken,
      p_prompt: input.prompt,
      p_format: input.format,
      p_style: input.style,
      p_context: input.clientContext,
      p_storage_path: input.storagePath,
      p_output_sha256: input.outputSha256,
      p_model: input.model,
      p_provider_response_id: input.providerResponseId,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_total_tokens: input.totalTokens,
      p_estimated_cost_chf: input.estimatedCostChf,
      p_width: input.width,
      p_height: input.height,
      p_alt_text: input.altText,
    },
  );

  if (error || !isRecord(data)) {
    throw new HttpError(503, "commercial_demo_ai_completion_unavailable");
  }
  return data;
}

export async function failCommercialDemoAiRequest(input: {
  context: CommercialDemoAiContext;
  requestId: string;
  lockToken: string;
  errorCode: string;
  model?: string | null;
}) {
  await input.context.actor.adminClient.rpc("commercial_demo_ai_fail_request", {
    p_request_id: input.requestId,
    p_lock_token: input.lockToken,
    p_error_code: sanitizeText(input.errorCode, 160) || "internal_error",
    p_model: sanitizeText(input.model, 120) || null,
  });
}

export async function readCompletedCommercialDemoAiRequest(
  context: CommercialDemoAiContext,
  requestId: string,
) {
  const { data, error } = await context.actor.adminClient
    .from("commercial_demo_ai_requests")
    .select("status, response")
    .eq("request_id", requestId)
    .eq("session_id", context.sessionId)
    .maybeSingle();

  if (error || data?.status !== "completed" || !isRecord(data.response)) return null;
  return data.response;
}

export async function uploadCommercialDemoVisual(
  context: CommercialDemoAiContext,
  requestId: string,
  bytes: Uint8Array,
) {
  const path = `${context.commercialUserId}/${context.sessionId}/${requestId}.png`;
  const { error } = await context.actor.adminClient.storage
    .from(COMMERCIAL_DEMO_AI_BUCKET)
    .upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      // Safe for an identical request retry: the path is derived from the
      // server-bound actor/session/request tuple and payload mismatch is
      // rejected before provider or Storage work.
      upsert: true,
    });

  if (error) throw new HttpError(503, "commercial_demo_ai_storage_unavailable");
  return path;
}

export async function removeCommercialDemoVisual(
  context: CommercialDemoAiContext,
  storagePath: string,
) {
  await context.actor.adminClient.storage
    .from(COMMERCIAL_DEMO_AI_BUCKET)
    .remove([storagePath]);
}

export async function addCommercialDemoSignedUrl(
  context: CommercialDemoAiContext,
  payload: JsonRecord,
) {
  const storageBucket = payload.storage_bucket;
  const storagePath = payload.storage_path;
  if (storageBucket !== COMMERCIAL_DEMO_AI_BUCKET || typeof storagePath !== "string") {
    return payload;
  }

  const { data, error } = await context.actor.adminClient.storage
    .from(COMMERCIAL_DEMO_AI_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new HttpError(503, "commercial_demo_ai_signing_unavailable");

  return {
    ...payload,
    output_url: data.signedUrl,
    signed_url: data.signedUrl,
    generated_image_url: data.signedUrl,
    gallery_image_url: data.signedUrl,
    signed_url_expires_in: SIGNED_URL_TTL_SECONDS,
  };
}

/**
 * Applies bounded, non-billing retention to the caller's isolated demo data.
 * The database atomically queues Storage objects before deleting their rows.
 */
export async function applyCommercialDemoAiRetention(context: CommercialDemoAiContext) {
  const { error } = await context.actor.adminClient.rpc(
    "commercial_demo_ai_apply_retention",
    {
      p_actor_user_id: context.actor.userId,
      p_commercial_user_id: context.commercialUserId,
    },
  );
  if (error) throw new HttpError(503, "commercial_demo_ai_retention_unavailable");
}

/**
 * Removes a small queue batch through the Storage API. Archive/delete triggers
 * and retention both feed this queue, so no SQL-only object deletion is used.
 */
export async function drainCommercialDemoAiStorageCleanup(
  caller: CommercialDemoAiContext | RequestActor,
) {
  const adminClient = "adminClient" in caller ? caller.adminClient : caller.actor.adminClient;
  // Best-effort operational TTL for append-only circuit-breaker events. The
  // Storage outbox must still drain even if this housekeeping RPC is delayed.
  await adminClient.rpc("commercial_demo_ai_prune_provider_failures");
  const { data, error } = await adminClient
    .from("commercial_demo_ai_storage_cleanup_queue")
    .select("id, storage_bucket, storage_path")
    .eq("storage_bucket", COMMERCIAL_DEMO_AI_BUCKET)
    .order("enqueued_at", { ascending: true })
    .limit(20);

  if (error) throw new HttpError(503, "commercial_demo_ai_cleanup_unavailable");
  const rows = (data || []).filter((row: JsonRecord) => (
    typeof row.id === "string"
    && typeof row.storage_path === "string"
    && row.storage_path.length > 0
  ));
  if (!rows.length) return 0;

  const paths = rows.map((row: JsonRecord) => String(row.storage_path));
  const { error: storageError } = await adminClient.storage
    .from(COMMERCIAL_DEMO_AI_BUCKET)
    .remove(paths);
  if (storageError) throw new HttpError(503, "commercial_demo_ai_cleanup_unavailable");

  const { error: deleteError } = await adminClient
    .from("commercial_demo_ai_storage_cleanup_queue")
    .delete()
    .in("id", rows.map((row: JsonRecord) => String(row.id)));
  if (deleteError) throw new HttpError(503, "commercial_demo_ai_cleanup_unavailable");
  return rows.length;
}

export async function getCommercialDemoVisualHistory(input: {
  context: CommercialDemoAiContext;
  tool: CommercialDemoVisualTool | null;
  limit: number;
}) {
  let query = input.context.actor.adminClient
    .from("commercial_demo_ai_generations")
    .select(
      "id, request_id, tool, prompt, format, status, output_mime_type, model, credit_units, estimated_cost_chf, metadata, storage_bucket, storage_path, input_tokens, output_tokens, total_tokens, created_at",
    )
    .eq("session_id", input.context.sessionId)
    .eq("commercial_user_id", input.context.commercialUserId)
    .eq("demo_restaurant_id", input.context.demoRestaurantId)
    .eq("status", "generated")
    .eq("storage_bucket", COMMERCIAL_DEMO_AI_BUCKET)
    .not("request_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit, 1), 60));

  if (input.tool) query = query.eq("tool", input.tool);
  const { data, error } = await query;
  if (error) throw new HttpError(503, "commercial_demo_ai_history_unavailable");

  const rows = (data || []).map((row: JsonRecord) => {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    return {
      request_id: row.request_id,
      generation_id: row.id,
      tool: row.tool,
      prompt: row.prompt,
      format: row.format,
      style: typeof metadata.style === "string" ? metadata.style : null,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      output_mime_type: row.output_mime_type,
      model: row.model,
      width: Number(metadata.width || 0),
      height: Number(metadata.height || 0),
      input_tokens: Number(row.input_tokens || 0),
      output_tokens: Number(row.output_tokens || 0),
      total_tokens: Number(row.total_tokens || 0),
      credit_units: 0,
      estimated_cost_chf: Number(row.estimated_cost_chf || 0),
      alt_text: `Visuel IA de démonstration pour ${input.context.restaurant.name}`,
      created_at: row.created_at,
    };
  });
  if (!rows.length) return [];

  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  const { data: signedRows, error: signingError } = await input.context.actor.adminClient.storage
    .from(COMMERCIAL_DEMO_AI_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (signingError) throw new HttpError(503, "commercial_demo_ai_signing_unavailable");

  const signedByPath = new Map<string, string>();
  for (const signed of signedRows || []) {
    if (typeof signed.path === "string" && typeof signed.signedUrl === "string") {
      signedByPath.set(signed.path, signed.signedUrl);
    }
  }

  // A deleted/expired object is skipped without hiding the rest of the
  // gallery. The retention queue will remove its stale metadata separately.
  return rows.flatMap((row) => {
    const signedUrl = typeof row.storage_path === "string"
      ? signedByPath.get(row.storage_path)
      : undefined;
    if (!signedUrl) return [];
    return [{
      ...row,
      output_url: signedUrl,
      signed_url: signedUrl,
      generated_image_url: signedUrl,
      gallery_image_url: signedUrl,
      signed_url_expires_in: SIGNED_URL_TTL_SECONDS,
    }];
  });
}
