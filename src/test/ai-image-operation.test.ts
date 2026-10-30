import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  AiImageOperation, hashImageOperationRequest, ImageOperationError, requireImageIdempotencyKey,
  type ImageOperationRpc,
} from "../../supabase/functions/_shared/ai-image-operation";

const input = {
  userId: "fixture-user", restaurantId: "fixture-restaurant", idempotencyKey: "fixture-image-intention",
  requestHash: "a".repeat(64), creditUnits: 6, generationSeed: "fixture-seed", model: "gpt-image-2",
};

function ledger() {
  let state = "";
  let result: Record<string, unknown> | null = null;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const errors = new Map<string, string>();
  let loseFinalizeResponse = false;
  const rpc: ImageOperationRpc = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (errors.has(name)) return { data: null, error: { message: errors.get(name) } };
      if (name === "claim_ai_image_operation") {
        if (state) return { data: { claimed: false, operation_id: "operation-1", state, response: result }, error: null };
        state = "reserved";
        return { data: { claimed: true, operation_id: "operation-1", state, worker_token: "private-worker",
          asset_id: "asset-1", usage_id: "usage-1", generation_seed: input.generationSeed, available_credits_before: 6 }, error: null };
      }
      if (name === "advance_ai_image_operation") {
        if (args.p_transition === "provider_started" && state !== "reserved") return { data: null, error: { message: "invalid transition" } };
        state = String(args.p_transition);
        return { data: state, error: null };
      }
      if (name === "finalize_ai_image_operation") {
        state = "completed"; result = args.p_response as Record<string, unknown>;
        if (loseFinalizeResponse) throw new Error("connection lost after COMMIT");
        return { data: result, error: null };
      }
      if (name === "release_ai_image_operation") {
        state = "failed";
        result = { error: "image_generation_failed", operation_id: "operation-1", state, retry_safe: true };
        return { data: result, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { rpc, calls, errors, state: () => state, loseFinalize: () => { loseFinalizeResponse = true; } };
}

async function owned(store = ledger()) {
  const operation = await AiImageOperation.claim(store.rpc, input);
  expect(operation).toBeInstanceOf(AiImageOperation);
  return { store, operation: operation as AiImageOperation };
}

describe("AI image intention admission and financial outcome", () => {
  it("requires a stable key on every native mutation", () => {
    expect(() => requireImageIdempotencyKey(new Headers(), {})).toThrow("image_idempotency_key_required");
    expect(requireImageIdempotencyKey(new Headers(), { idempotency_key: input.idempotencyKey })).toBe(input.idempotencyKey);
    expect(requireImageIdempotencyKey(new Headers({ "Idempotency-Key": input.idempotencyKey }), {})).toBe(input.idempotencyKey);
    expect(() => requireImageIdempotencyKey(new Headers({ "Idempotency-Key": input.idempotencyKey }), { idempotency_key: "different-key" })).toThrow("image_idempotency_conflict");
  });
  it.each(["short", "x".repeat(201), "with space key", "x\ninvalid", 123, {}, ""])("rejects invalid key %s", key => {
    expect(() => requireImageIdempotencyKey(new Headers(), { idempotency_key: key })).toThrow("image_idempotency_key_invalid");
  });
  it("hashes the same request independent of object order and transport key field", async () => {
    const a = await hashImageOperationRequest({ prompt: "same", nested: { b: 1, a: 2 }, idempotency_key: "key-first" });
    const b = await hashImageOperationRequest({ nested: { a: 2, b: 1 }, prompt: "same", idempotencyKey: "key-second" });
    expect(a).toBe(b);
    expect(await hashImageOperationRequest({ prompt: "changed", nested: { a: 2, b: 1 } })).not.toBe(a);
    expect(await hashImageOperationRequest({ refs: [1,2] })).not.toBe(await hashImageOperationRequest({ refs: [2,1] }));
  });
  it("returns one owned operation and pending replays under duplicate admission", async () => {
    const store = ledger();
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => AiImageOperation.claim(store.rpc, input)));
    expect(outcomes.filter(value => value instanceof AiImageOperation)).toHaveLength(1);
    expect(outcomes.filter(value => !(value instanceof AiImageOperation))).toHaveLength(11);
    for (const value of outcomes) if (!(value instanceof AiImageOperation)) {
      expect(value.status).toBe(409);
      expect(value.response).toMatchObject({ state: "reserved", retry_safe: false });
      expect(JSON.stringify(value.response)).not.toContain("private-worker");
    }
  });
  it("maps a native refusal before provider admission without creating a worker", async () => {
    const store = ledger();
    store.errors.set("claim_ai_image_operation", "TOK credits exhausted");
    await expect(AiImageOperation.claim(store.rpc, input)).rejects.toMatchObject({ status: 402 });
    expect(store.calls.map(call => call.name)).toEqual(["claim_ai_image_operation"]);
  });
  it("persists provider_started before an external call is admitted", async () => {
    const { store, operation } = await owned();
    await operation.beforeProvider();
    expect(store.state()).toBe("provider_started");
    expect(operation.providerClientRequestId).toBe("tok-image-operation-1-1");
    await expect(operation.beforeProvider()).rejects.toBeInstanceOf(ImageOperationError);
  });
  it("does not admit provider work when persisting its start fails", async () => {
    const { store, operation } = await owned();
    store.errors.set("advance_ai_image_operation", "temporary database failure");
    await expect(operation.beforeProvider()).rejects.toMatchObject({ status: 503 });
    expect(store.state()).toBe("reserved");
  });
  it("admits at most three explicitly rejected attempts with separate trace IDs", async () => {
    const { store, operation } = await owned();
    for (let n=1;n<=3;n+=1) {
      await operation.beforeProvider();
      expect(operation.providerClientRequestId).toBe(`tok-image-operation-1-${n}`);
      operation.observeProviderResponse(400, `provider-${n}`);
    }
    await expect(operation.beforeProvider()).rejects.toThrow("image_operation_pending");
    expect(store.calls.filter(call => call.name === "advance_ai_image_operation")).toHaveLength(1);
  });
  it.each([200, 500, 502, 503, 504, 408])( "holds the reservation after ambiguous status %s", async status => {
    const { store, operation } = await owned();
    await operation.beforeProvider(); operation.observeProviderResponse(status, "provider-unknown");
    const cleanup = vi.fn(async () => {});
    const reply = await operation.handleFailure("body lost or timeout", cleanup);
    expect(reply).toMatchObject({ status: 409, response: { state: "indeterminate", retry_safe: false } });
    expect(cleanup).not.toHaveBeenCalled();
    expect(store.state()).toBe("indeterminate");
    expect(store.calls.some(call => call.name === "release_ai_image_operation")).toBe(false);
    await expect(operation.beforeProvider()).rejects.toThrow("image_operation_pending");
  });
  it("never reclaims a provider request whose response did not arrive", async () => {
    const { store, operation } = await owned();
    await operation.beforeProvider();
    await operation.handleFailure("image_generation_timeout", vi.fn());
    const replay = await AiImageOperation.claim(store.rpc, input);
    expect(replay).toMatchObject({ status: 409, response: { retry_safe: false } });
  });
  it.each([400,401,402,403,404,413,422,429])("releases a definite %s rejection only after cleanup", async status => {
    const { store, operation } = await owned();
    await operation.beforeProvider(); operation.observeProviderResponse(status);
    const cleanup = vi.fn(async () => { expect(store.state()).toBe("cleanup_pending"); });
    const reply = await operation.handleFailure("provider rejected", cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(reply).toMatchObject({ status: 502, response: { error: "image_generation_failed", state: "failed", retry_safe: true } });
    expect(store.state()).toBe("failed");
  });
  it("releases a pre-provider reference failure without any paid attempt", async () => {
    const { store, operation } = await owned();
    await operation.handleFailure("source_image_unsafe_url", async () => {});
    expect(store.state()).toBe("failed");
    expect(store.calls.some(call => call.args.p_transition === "provider_started")).toBe(false);
  });
  it("holds funds when deleting partial assets fails", async () => {
    const { store, operation } = await owned();
    const reply = await operation.handleFailure("upload error", async () => { throw new Error("storage unavailable"); });
    expect(reply.response).toMatchObject({ state: "cleanup_pending", retry_safe: false });
    expect(store.state()).toBe("cleanup_pending");
    expect(store.calls.some(call => call.name === "release_ai_image_operation")).toBe(false);
  });
  it("does not refund an ambiguous upload after DELETE while a late writer could remain", async () => {
    const { store, operation } = await owned();
    await operation.beforeProvider(); operation.observeProviderSuccess(); operation.storageOutcomeUnknown = true;
    const reply = await operation.handleFailure("upload response lost", async () => {});
    expect(reply.response).toMatchObject({ state: "cleanup_pending", retry_safe: false });
    expect(store.calls.some(call => call.name === "release_ai_image_operation")).toBe(false);
  });
  it("replays a committed result after the finalization response is lost, without deleting assets", async () => {
    const { store, operation } = await owned();
    await operation.beforeProvider(); operation.observeProviderSuccess(); store.loseFinalize();
    const response = { assetId: operation.assetId, status: "stored", credit_units: 6 };
    await expect(operation.finalize({}, {}, {}, response)).rejects.toThrow("connection lost");
    const cleanup = vi.fn();
    expect(await operation.handleFailure("connection lost", cleanup)).toEqual({ status: 200, response });
    expect(cleanup).not.toHaveBeenCalled();
    expect(store.calls.some(call => call.name === "release_ai_image_operation")).toBe(false);
  });
  it("keeps uncertain finalization immutable when its follow-up read is unavailable", async () => {
    const { store, operation } = await owned();
    await operation.beforeProvider(); operation.observeProviderSuccess();
    store.errors.set("finalize_ai_image_operation", "database unavailable");
    await expect(operation.finalize({}, {}, {}, {})).rejects.toThrow();
    store.errors.set("claim_ai_image_operation", "database unavailable");
    const cleanup = vi.fn();
    expect((await operation.handleFailure("database unavailable", cleanup)).response.retry_safe).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("retains a failed key as a terminal replay instead of admitting another paid call", async () => {
    const { store, operation } = await owned();
    await operation.handleFailure("invalid reference", async () => {});
    const replay = await AiImageOperation.claim(store.rpc, input);
    expect(replay).toMatchObject({ status: 502, response: { error: "image_generation_failed", retry_safe: true } });
    expect(replay).not.toBeInstanceOf(AiImageOperation);
  });
  it("binds native handler provider and storage paths to the admitted operation", () => {
    const source = readFileSync("supabase/functions/ai-image-enhance/index.ts", "utf8");
    expect(source.indexOf("const marketingReferences = marketingAssetMode")).toBeLessThan(source.indexOf("AiImageOperation.claim(actor.adminClient"));
    expect(source).toContain("const imageOptions = { ...generatedImageOptions, operation }");
    expect(source).toContain('"X-Client-Request-Id": options.operation.providerClientRequestId');
    expect(source).toContain("await options.operation.beforeProvider()");
    expect(source).toContain("await operation.finalize(assetPayload");
    expect(source).not.toContain("insertGeneratedAsset");
    expect(source).not.toContain('status: "success",\n      restaurantId,');
    expect(source).toContain("operation.storageOutcomeUnknown = true");
    expect(source).toContain("operation.storageOutcomeUnknown = false");
    expect(source).not.toContain("if (isImageTimeoutError(error)) return true");
  });
});
