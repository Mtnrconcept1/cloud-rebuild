/**
 * Expose the existing restaurant Marketing Studio to the canonical ChatGPT MCP.
 *
 * Only a Supabase OAuth user JWT is forwarded to TOK's authenticated app bridge.
 * The bridge enforces restaurant ownership, explicit confirmation, idempotency,
 * AI feature flags, credit accounting, and generation via ai-image-enhance.
 * This adapter does not generate images or publish anything itself.
 */
export class TokMarketingVisualBridgeError extends Error {
  constructor(public readonly status: number, code: string) {
    super(code);
    this.name = "TokMarketingVisualBridgeError";
  }
}

export type TokMarketingVisualInput = {
  authorization: string | null;
  authMode: string;
  environment: string;
  userId: string | null;
  args: Record<string, unknown>;
  supabaseUrl: string;
  anonKey?: string;
  fetcher?: typeof fetch;
};

export type TokMarketingVisualOutput = {
  marketing_visual: {
    restaurant_id: string;
    asset_id: string;
    image_url: string;
    format: "square" | "portrait" | "landscape";
    image_count: 1;
    model: string | null;
    credit_units: number | null;
    status: "stored";
    publication_status: "not_published";
    requires_publication_confirmation: true;
  };
  replayed: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,120}$/;
const PUBLIC_GALLERY_PATH = "/storage/v1/object/public/restaurant-images/";
const KNOWN_ERRORS = new Set([
  "ai_credits_exhausted",
  "marketing_reference_ids_required",
  "marketing_reference_mismatch",
  "marketing_reference_required",
  "ai_service_unavailable",
  "feature_disabled",
  "tok_connect_human_confirmation_required",
  "tok_connect_idempotency_key_reused_with_different_body",
  "tok_connect_idempotency_request_in_progress",
  "tok_connect_owned_restaurant_not_found",
  "tok_connect_restaurant_mcp_disabled",
  "tok_connect_restaurateur_required",
  "tok_connect_user_required",
]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeErrorCode(response: Record<string, unknown>): string {
  const downstream = record(response.data);
  const error = record(response.error);
  const candidate = typeof error.code === "string" ? error.code
    : typeof downstream.error === "string" ? downstream.error
    : typeof downstream.error_code === "string" ? downstream.error_code
    : "";
  return KNOWN_ERRORS.has(candidate) ? candidate : "tok_marketing_visual_generation_failed";
}

export async function generateTokMarketingVisualThroughBridge(
  input: TokMarketingVisualInput,
): Promise<TokMarketingVisualOutput> {
  if (input.environment !== "production" || input.authMode !== "supabase_oauth" || !input.userId) {
    throw new TokMarketingVisualBridgeError(403, "tok_marketing_oauth_restaurateur_required");
  }
  if (input.args.confirmed_by_user !== true) {
    throw new TokMarketingVisualBridgeError(409, "tok_connect_human_confirmation_required");
  }

  const restaurantId = input.args.restaurant_id;
  const prompt = input.args.prompt;
  const idempotencyKey = input.args.idempotency_key;
  const format = input.args.format ?? "square";
  const referenceMediaIds = input.args.reference_media_ids;
  if (!Array.isArray(referenceMediaIds) || referenceMediaIds.length < 1 || referenceMediaIds.length > 4
    || new Set(referenceMediaIds).size !== referenceMediaIds.length
    || referenceMediaIds.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new TokMarketingVisualBridgeError(400, "marketing_reference_ids_required");
  }
  if (typeof restaurantId !== "string" || !UUID.test(restaurantId)
    || typeof prompt !== "string" || prompt.trim().length < 5 || prompt.length > 3500
    || typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(idempotencyKey)
    || !["square", "portrait", "landscape"].includes(String(format))) {
    throw new TokMarketingVisualBridgeError(400, "tok_marketing_visual_arguments_invalid");
  }
  if (!input.authorization || !/^Bearer\s+\S+$/i.test(input.authorization)) {
    throw new TokMarketingVisualBridgeError(401, "tok_marketing_oauth_token_required");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(input.supabaseUrl);
    if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      throw new Error("unsafe_origin");
    }
  } catch {
    throw new TokMarketingVisualBridgeError(503, "tok_marketing_service_unconfigured");
  }

  const headers = new Headers({
    authorization: input.authorization,
    accept: "application/json",
    "content-type": "application/json",
  });
  if (input.anonKey) headers.set("apikey", input.anonKey);

  // The payload is a strict allowlist: ignore any arbitrary model-supplied keys.
  const bridgeRequest = {
    mode: "role_operation",
    operation: "tok_generate_restaurant_marketing_visual",
    args: {
      restaurant_id: restaurantId,
      prompt: prompt.trim(),
      reference_media_ids: referenceMediaIds,
      format,
      confirmed_by_user: true,
      idempotency_key: idempotencyKey,
    },
  };

  let response: Response;
  try {
    response = await (input.fetcher || fetch)(
      new URL("/functions/v1/tok-connect-app-bridge", baseUrl),
      {
        method: "POST",
        headers,
        body: JSON.stringify(bridgeRequest),
        signal: AbortSignal.timeout(130_000),
      },
    );
  } catch {
    // An upstream timeout is indeterminate; do not automatically re-submit
    // an AI job. The same idempotency key must be retained for reconciliation.
    throw new TokMarketingVisualBridgeError(503, "tok_marketing_visual_result_unconfirmed");
  }

  const payload = record(await response.json().catch(() => null));
  if (!response.ok || payload.ok !== true || payload.mode !== "edge" || payload.capability !== "restaurant.ai.image") {
    throw new TokMarketingVisualBridgeError(
      response.ok ? 502 : response.status,
      safeErrorCode(payload),
    );
  }

  const asset = record(payload.data);
  const assetId = asset.assetId;
  const galleryImageUrl = asset.gallery_image_url;
  let publicImageUrl: URL | null = null;
  try {
    if (typeof galleryImageUrl === "string") publicImageUrl = new URL(galleryImageUrl);
  } catch {
    publicImageUrl = null;
  }
  if (asset.status !== "stored" || typeof assetId !== "string" || !UUID.test(assetId)
    || publicImageUrl?.origin !== baseUrl.origin
    || !publicImageUrl.pathname.startsWith(PUBLIC_GALLERY_PATH)) {
    throw new TokMarketingVisualBridgeError(502, "tok_marketing_visual_asset_unconfirmed");
  }

  const creditUnits = asset.credit_units;
  return {
    marketing_visual: {
      restaurant_id: restaurantId,
      asset_id: assetId,
      image_url: publicImageUrl.href,
      format: format as "square" | "portrait" | "landscape",
      image_count: 1,
      model: typeof asset.model === "string" ? asset.model : null,
      credit_units: typeof creditUnits === "number" && Number.isFinite(creditUnits) && creditUnits >= 0
        ? creditUnits : null,
      status: "stored",
      publication_status: "not_published",
      requires_publication_confirmation: true,
    },
    replayed: payload.replayed === true,
  };
}
