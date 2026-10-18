/** Durable admission for one paid image intention. All financial mutations are
 * performed by the native ledger RPCs in one PostgreSQL transaction. */
export type ImageOperationRpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export class ImageOperationError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = "ImageOperationError";
  }
}

export function requireImageIdempotencyKey(headers: Headers, body: Record<string, unknown>): string {
  const supplied = [headers.get("Idempotency-Key"), body.idempotency_key, body.idempotencyKey]
    .filter((value) => value !== undefined && value !== null);
  if (supplied.length === 0) throw new ImageOperationError(400, "image_idempotency_key_required");
  if (supplied.some((value) => typeof value !== "string" || !/^[A-Za-z0-9_.:-]{8,200}$/.test(value))) {
    throw new ImageOperationError(400, "image_idempotency_key_invalid");
  }
  if (supplied.some((value) => value !== supplied[0])) {
    throw new ImageOperationError(409, "image_idempotency_conflict");
  }
  return supplied[0] as string;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonicalJson(item)]));
  }
  return value;
}

export async function hashImageOperationRequest(body: Record<string, unknown>): Promise<string> {
  const request = { ...body };
  delete request.idempotency_key;
  delete request.idempotencyKey;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonicalJson(request))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type ClaimInput = {
  userId: string;
  restaurantId: string;
  idempotencyKey: string;
  requestHash: string;
  creditUnits: number;
  generationSeed: string;
  model: string;
};

export type ImageOperationReply = {
  status: number;
  response: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pendingReply(operationId: string, state = "indeterminate"): ImageOperationReply {
  return {
    status: 409,
    response: { error: "image_operation_pending", operation_id: operationId, state, retry_safe: false },
  };
}

function existingReply(data: Record<string, unknown>): ImageOperationReply {
  const state = String(data.state || "indeterminate");
  const operationId = String(data.operation_id || "");
  if (state === "completed" && data.response && typeof data.response === "object") {
    return { status: 200, response: asRecord(data.response) };
  }
  if (state === "failed") {
    return {
      status: 502,
      response: { error: "image_generation_failed", operation_id: operationId, state, retry_safe: true },
    };
  }
  return pendingReply(operationId, state);
}

function claimArgs(input: ClaimInput): Record<string, unknown> {
  return {
    p_user_id: input.userId,
    p_restaurant_id: input.restaurantId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_credit_units: input.creditUnits,
    p_generation_seed: input.generationSeed,
    p_model: input.model,
  };
}

async function callRpc(rpc: ImageOperationRpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await rpc.rpc(name, args);
  if (result.error) {
    const message = result.error.message || "";
    if (message.includes("image_idempotency_conflict")) throw new ImageOperationError(409, "image_idempotency_conflict");
    if (message.includes("TOK credits exhausted")) throw new ImageOperationError(402, "tok_credits_exhausted");
    if (message.includes("image_operation_not_owned") || message.includes("image_operation_forbidden")) {
      throw new ImageOperationError(403, "image_operation_forbidden");
    }
    throw new ImageOperationError(503, "image_operation_persistence_unavailable");
  }
  return result.data;
}

export class AiImageOperation {
  readonly id: string;
  readonly assetId: string;
  readonly usageId: string;
  readonly generationSeed: string;
  readonly availableCreditsBefore: number;
  readonly creditUnits: number;
  providerRequestId: string | null = null;
  // Set before upload, cleared only after both uploads report success. A lost
  // upload response can leave a writer in flight even after a successful DELETE.
  storageOutcomeUnknown = false;
  private readonly workerToken: string;
  private providerStarted = false;
  private providerOutcome: "not_started" | "unknown" | "rejected" | "success" = "not_started";
  private providerAttempt = 0;
  private finalizationAttempted = false;

  private constructor(private rpc: ImageOperationRpc, private input: ClaimInput, claim: Record<string, unknown>) {
    this.id = String(claim.operation_id);
    this.assetId = String(claim.asset_id);
    this.usageId = String(claim.usage_id);
    this.workerToken = String(claim.worker_token);
    this.generationSeed = String(claim.generation_seed);
    this.availableCreditsBefore = Number(claim.available_credits_before);
    this.creditUnits = input.creditUnits;
  }

  static async claim(rpc: ImageOperationRpc, input: ClaimInput): Promise<AiImageOperation | ImageOperationReply> {
    const result = asRecord(await callRpc(rpc, "claim_ai_image_operation", claimArgs(input)));
    if (result.claimed !== true) return existingReply(result);
    if (!["operation_id", "asset_id", "usage_id", "worker_token", "generation_seed"].every((key) => typeof result[key] === "string")) {
      throw new ImageOperationError(503, "image_operation_persistence_unavailable");
    }
    return new AiImageOperation(rpc, input, result);
  }

  get providerClientRequestId() { return `tok-image-${this.id}-${this.providerAttempt}`; }

  private async advance(transition: string, reason?: string) {
    return await callRpc(this.rpc, "advance_ai_image_operation", {
      p_operation_id: this.id, p_worker_token: this.workerToken,
      p_transition: transition, p_reason: reason?.slice(0, 200) || null,
    });
  }

  /** Only an explicit provider rejection can admit another attempt in this
   * worker. There is no automatic retry after timeout, 5xx, or truncated body. */
  async beforeProvider(): Promise<void> {
    if (this.providerAttempt >= 3 || (this.providerStarted && this.providerOutcome !== "rejected")) {
      throw new ImageOperationError(409, "image_operation_pending");
    }
    if (!this.providerStarted) {
      await this.advance("provider_started");
      this.providerStarted = true;
    }
    this.providerAttempt += 1;
    this.providerRequestId = null;
    this.providerOutcome = "unknown";
  }

  observeProviderResponse(status: number, requestId?: string | null) {
    this.providerRequestId = requestId?.slice(0, 200) || null;
    this.providerOutcome = [400, 401, 402, 403, 404, 413, 422, 429].includes(status) ? "rejected" : "unknown";
  }

  observeProviderSuccess() { this.providerOutcome = "success"; }

  async finalize(
    asset: Record<string, unknown>, usage: Record<string, unknown>,
    metadata: Record<string, unknown>, response: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.finalizationAttempted = true;
    return asRecord(await callRpc(this.rpc, "finalize_ai_image_operation", {
      p_operation_id: this.id, p_worker_token: this.workerToken,
      p_asset: asset, p_usage: usage, p_metadata: metadata, p_response: response,
    }));
  }

  async handleFailure(reason: string, cleanup: () => Promise<void>): Promise<ImageOperationReply> {
    // A successful transaction whose HTTP response was lost must be replayed
    // before deleting its assets. If the read fails, keep the hold untouched.
    if (this.finalizationAttempted) {
      try {
        const persisted = asRecord(await callRpc(this.rpc, "claim_ai_image_operation", claimArgs(this.input)));
        if (persisted.state === "completed" || persisted.state === "failed") return existingReply(persisted);
      } catch { return pendingReply(this.id); }
    }
    if (this.providerOutcome === "unknown" || this.finalizationAttempted) {
      try { await this.advance("indeterminate", reason); } catch { /* Keep the durable hold. */ }
      return pendingReply(this.id);
    }
    try {
      await this.advance("cleanup_pending", reason);
      await cleanup();
      if (this.storageOutcomeUnknown) return pendingReply(this.id, "cleanup_pending");
      const response = asRecord(await callRpc(this.rpc, "release_ai_image_operation", {
        p_operation_id: this.id, p_worker_token: this.workerToken, p_reason: reason.slice(0, 200),
      }));
      return { status: 502, response };
    } catch {
      return pendingReply(this.id, "cleanup_pending");
    }
  }
}
