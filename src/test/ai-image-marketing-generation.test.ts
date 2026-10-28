import { randomUUID, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

type Json = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;
type ProviderFailure = "timeout" | "invalid_image" | "server_error";
type Reference = Json & { id: string; media_url: string; bytes: Uint8Array };

const RESTAURANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORAGE_URL = "https://fixture.supabase.co/storage/v1/object/public";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const FUNCTIONS_ROOT = resolve("supabase/functions");
const IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S9sAAAAASUVORK5CYII=";
const IMAGE_BYTES = Uint8Array.from(atob(IMAGE_BASE64), (character) => character.charCodeAt(0));
const compiledModules = new Map<string, string>();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function references(count: number): Reference[] {
  const mediaTypes = ["marketing_logo", "marketing_business_card", "marketing_menu", "marketing_brand_visual"];
  return Array.from({ length: count }, (_, index) => {
    const storagePath = `${RESTAURANT_ID}/marketing-assets/reference-${index + 1}.png`;
    return {
      id: `10000000-0000-4000-8000-00000000000${index + 1}`,
      restaurant_id: RESTAURANT_ID,
      media_type: mediaTypes[index],
      media_url: `${STORAGE_URL}/restaurant-images/${storagePath}`,
      storage_bucket: "restaurant-images",
      storage_path: storagePath,
      created_at: `2026-10-18T12:00:0${index}Z`,
      bytes: new Uint8Array([...IMAGE_BYTES, index + 1]),
    };
  });
}

function harness(options: {
  referenceCount?: number;
  providerFailure?: ProviderFailure;
  unreachableReference?: boolean;
  uploadFailure?: boolean;
  creditBalance?: number;
  printVariant?: Json;
} = {}) {
  let handler: Handler | undefined;
  const activeReferences = references(options.referenceCount ?? 1);
  const assets: Json[] = [];
  const usage: Json[] = [];
  const uploads: Array<{ bucket: string; path: string; bytes: Uint8Array }> = [];
  const removals: Array<{ bucket: string; paths: string[] }> = [];
  const audit = vi.fn(async (_event: Json) => {});
  let state = "";
  let durableResponse: Json | null = null;
  let admittedHash = "";
  let signalProvider: () => void = () => {};
  const providerReady = new Promise<void>((resolveReady) => { signalProvider = resolveReady; });

  const rpc = vi.fn(async (name: string, args: Json) => {
    if (name === "is_feature_flag_active") return { data: true, error: null };
    if (name === "claim_ai_image_operation") {
      if (state) {
        if (args.p_request_hash !== admittedHash) return { data: null, error: { message: "image_idempotency_conflict" } };
        return { data: { claimed: false, operation_id: "fixture-operation", state, response: durableResponse }, error: null };
      }
      if ((options.creditBalance ?? 50) < Number(args.p_credit_units)) return { data: null, error: { message: "TOK credits exhausted" } };
      state = "reserved"; admittedHash = String(args.p_request_hash);
      usage.push({ id: "fixture-usage", function_name: "ai-image-enhance", action: "image_credit_reservation",
        restaurant_id: RESTAURANT_ID, status: "success", estimated_cost_chf: 0,
        metadata: { credit_units: args.p_credit_units, billing_phase: "reserved", generated_image: false, image_operation_id: "fixture-operation" } });
      return { data: { claimed: true, operation_id: "fixture-operation", worker_token: "fixture-private-worker",
        asset_id: ASSET_ID, usage_id: "fixture-usage", generation_seed: args.p_generation_seed,
        available_credits_before: options.creditBalance ?? 50 }, error: null };
    }
    if (name === "advance_ai_image_operation") {
      state = String(args.p_transition);
      return { data: state, error: null };
    }
    if (name === "finalize_ai_image_operation") {
      state = "completed";
      assets.push({ ...(args.p_asset as Json), id: ASSET_ID });
      Object.assign(usage[0], args.p_usage, { action: "image_enhance", generated_asset_id: ASSET_ID,
        metadata: { ...(args.p_metadata as Json), billing_phase: "completed", generated_image: true } });
      durableResponse = args.p_response as Json;
      return { data: durableResponse, error: null };
    }
    if (name === "release_ai_image_operation") {
      state = "failed";
      usage[0].status = "failure";
      (usage[0].metadata as Json).billing_phase = "released";
      durableResponse = { error: "image_generation_failed", operation_id: "fixture-operation", state, retry_safe: true };
      return { data: durableResponse, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });

  const db = {
    rpc,
    from(table: string) {
      const filters: Array<(row: Json) => boolean> = [];
      let inserted: Json | undefined;
      let result: { data: unknown; error: unknown } | undefined;
      const query = {
        select: () => query,
        not: () => query,
        maybeSingle: () => query,
        eq: (field: string, value: unknown) => { filters.push((row) => row[field] === value); return query; },
        in: (field: string, values: unknown[]) => { filters.push((row) => values.includes(row[field])); return query; },
        order: () => query,
        insert: (value: Json) => { inserted = value; return query; },
        single: () => query,
        then(onFulfilled: (value: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) {
          if (!result) {
            if (table === "print_provider_products") {
              result = { data: options.printVariant || null, error: null };
            } else if (table === "restaurant_media" && !inserted) {
              result = { data: activeReferences.filter((row) => filters.every((filter) => filter(row))), error: null };
            } else if (table === "ai_generated_assets" && inserted) {
              assets.push(inserted);
              result = { data: { id: ASSET_ID }, error: null };
            } else if (table === "ai_usage_logs" && inserted) {
              usage.push(inserted);
              result = { data: null, error: null };
            } else {
              throw new Error(`Unexpected database operation: ${table}`);
            }
          }
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, bytes: Uint8Array) => {
            if (options.uploadFailure) return { error: { message: "storage_unavailable" } };
            uploads.push({ bucket, path, bytes: new Uint8Array(bytes) });
            return { error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE_URL}/${bucket}/${path}` } }),
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://fixture.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=fixture` } }),
          remove: async (paths: string[]) => { removals.push({ bucket, paths }); return { data: [], error: null }; },
        };
      },
    },
  };

  const fetchReference = vi.fn(async (url: string) => {
    const reference = activeReferences.find((row) => row.media_url === url);
    if (!reference) throw new Error(`Unexpected reference URL: ${url}`);
    if (options.unreachableReference && reference === activeReferences.at(-1)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(reference.bytes).buffer, { headers: { "content-type": "image/png" } });
  });

  const provider = vi.fn(async (url: string, init: RequestInit) => {
    signalProvider();
    expect(state).toBe("provider_started");
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ action: "image_credit_reservation", metadata: { billing_phase: "reserved", generated_image: false } });
    if (url !== IMAGE_EDITS_URL && url !== "https://api.openai.com/v1/images/generations") {
      throw new Error(`Unexpected provider URL: ${url}`);
    }
    // Any retry or text-only fallback would succeed, exposing a false success
    // instead of allowing a second provider failure to hide the regression.
    if (provider.mock.calls.length === 1) {
      if (options.providerFailure === "timeout") {
        return await new Promise<Response>((_resolve, reject) => {
          if (!init.signal) throw new Error("Provider request has no abort signal");
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      if (options.providerFailure) {
        return Response.json({ error: { code: options.providerFailure, message: "Provider rejected the edit" } }, {
          status: options.providerFailure === "invalid_image" ? 400 : 500,
        });
      }
    }
    return Response.json({ data: [{ b64_json: IMAGE_BASE64 }], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
  });

  const actor = { userId: "fixture-owner", adminClient: db };
  const boundaries: Record<string, Json> = {
    "_shared/auth.ts": {
      HttpError,
      authenticateRequest: async () => actor,
      requireRestaurantAccess: vi.fn(async (_actor: unknown, restaurantId: string) => {
        if (restaurantId !== RESTAURANT_ID) throw new HttpError(403, "forbidden");
        return { id: RESTAURANT_ID, name: "Fixture Restaurant" };
      }),
      jsonResponse: (body: unknown, status = 200) => Response.json(body, { status }),
      writeAuditLog: audit,
    },
    "_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "_shared/logging.ts": { makeLogger: () => ({ rid: "fixture-request", error: vi.fn() }) },
    "_shared/rate-limit.ts": { createRateLimiter: () => ({ consume: vi.fn(async () => {}) }) },
    "_shared/openai.ts": { OPENAI_API_KEY: "fixture-key" },
    "_shared/safe-public-fetch.ts": { fetchPublicUrl: fetchReference },
  };
  const context = createContext({
    Request, Response, Headers, Blob, FormData, URL, URLSearchParams,
    AbortController, DOMException, Error, TypeError, Uint8Array,
    atob, btoa, setTimeout, clearTimeout, TextEncoder, TextDecoder,
    crypto: { randomUUID, subtle: webcrypto.subtle },
    fetch: provider,
    console: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
    Deno: {
      env: { get: () => undefined },
      serve: (callback: Handler) => { handler = callback; },
    },
  });
  const loadedModules = new Map<string, Json>();

  // Execute the shipped handler and its local helpers. Only external boundaries
  // are replaced; no copy of the marketing branch or recovery logic lives here.
  function loadModule(filename: string): Json {
    if (!filename.startsWith(`${FUNCTIONS_ROOT}${sep}`)) throw new Error(`Module outside Edge Functions: ${filename}`);
    const boundary = boundaries[filename.slice(FUNCTIONS_ROOT.length + 1).split(sep).join("/")];
    if (boundary) return boundary;
    const existing = loadedModules.get(filename);
    if (existing) return existing;
    let compiled = compiledModules.get(filename);
    if (!compiled) {
      compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText;
      compiledModules.set(filename, compiled);
    }
    const exports: Json = {};
    loadedModules.set(filename, exports);
    const run = new Script(`(function(exports, require, module) {\n${compiled}\n})`, { filename }).runInContext(context);
    run(exports, (specifier: string) => {
      if (!specifier.startsWith(".")) throw new Error(`Unexpected external module: ${specifier}`);
      return loadModule(resolve(dirname(filename), specifier));
    }, { exports });
    return exports;
  }
  loadModule(resolve(FUNCTIONS_ROOT, "ai-image-enhance/index.ts"));
  if (!handler) throw new Error("The real ai-image-enhance handler did not register");
  const registeredHandler = handler;

  return {
    activeReferences, assets, usage, uploads, removals, audit, rpc, provider, providerReady, fetchReference,
    state: () => state,
    call: (patch: Json = {}) => registeredHandler(new Request("https://tok.test/functions/v1/ai-image-enhance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: RESTAURANT_ID,
        assetType: "campaign_visual",
        marketingAssetMode: true,
        marketingOutputFormat: { destination: "digital" },
        prompt: "Annonce la carte de chasse. Préserve le logo et les couleurs des références.",
        format: "portrait",
        variantCount: 1,
        referenceMediaIds: activeReferences.map((row) => row.id),
        generationSeed: "fixture-marketing",
        idempotency_key: "fixture-marketing-intention",
        ...patch,
      }),
    })),
  };
}

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolveBytes, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveBytes(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function expectNoGeneratedSuccess(h: ReturnType<typeof harness>, body: Json, reservationHeld = false) {
  expect(body).not.toHaveProperty("assetId");
  expect(body).not.toHaveProperty("generated_image_url");
  expect(body).not.toHaveProperty("gallery_image_url");
  expect(body.status).not.toBe("stored");
  expect(h.assets).toHaveLength(0);
  expect(h.usage.filter((row) => row.status === "success" && (row.metadata as Json)?.generated_image === true)).toHaveLength(0);
  expect(h.usage.filter((row) => row.status === "success")).toHaveLength(reservationHeld ? 1 : 0);
  expect(h.audit.mock.calls.some(([event]) => event.status === "success")).toBe(false);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("native marketing image generation", () => {
  it.each([1, 4])("edits once with all %i restaurant references, persists the image and records one debit", async (referenceCount) => {
    const h = harness({ referenceCount });
    const response = await h.call({ referenceImageUrls: ["https://untrusted.invalid/ignored.png"] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ assetId: ASSET_ID, status: "stored", model: "gpt-image-2", output_size: "1024x1536" });
    expect(h.provider).toHaveBeenCalledTimes(1);
    const [url, init] = h.provider.mock.calls[0];
    expect(url).toBe(IMAGE_EDITS_URL);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("n")).toBe("1");
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("prompt")).toContain("Annonce la carte de chasse");
    const files = form.getAll("image[]") as File[];
    expect(files).toHaveLength(referenceCount);
    const sentBytes = await Promise.all(files.map(readBlob));
    expect(sentBytes.map((bytes) => Array.from(bytes))).toEqual(h.activeReferences.map((row) => Array.from(row.bytes)));
    expect(h.fetchReference.mock.calls.map(([referenceUrl]) => referenceUrl)).toEqual(h.activeReferences.map((row) => row.media_url));

    expect(h.assets).toHaveLength(1);
    expect(h.assets[0]).toMatchObject({ restaurant_id: RESTAURANT_ID, asset_type: "campaign_visual", status: "stored", asset_url: body.gallery_image_url });
    expect((h.assets[0].metadata as Json).reference_media_ids).toEqual(h.activeReferences.map((row) => row.id));
    expect(h.uploads).toHaveLength(2);
    expect(h.uploads.every((upload) => Array.from(upload.bytes).join(",") === Array.from(IMAGE_BYTES).join(","))).toBe(true);
    expect(h.uploads.map((upload) => upload.bucket)).toEqual(["ai-generated-assets", "restaurant-images"]);
    expect(h.usage).toHaveLength(1);
    expect(h.usage[0]).toMatchObject({ status: "success", generated_asset_id: ASSET_ID, restaurant_id: RESTAURANT_ID, metadata: { credit_units: body.credit_units } });
    expect(Number(body.credit_units)).toBeGreaterThan(0);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0][0]).toMatchObject({ status: "success", targetEntityId: ASSET_ID });
  });

  it("aborts an expired edit without retrying and holds the reservation for reconciliation", async () => {
    vi.useFakeTimers();
    const h = harness({ providerFailure: "timeout" });
    const pending = h.call();
    await h.providerReady;
    await vi.runAllTimersAsync();
    const response = await pending;
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: "image_operation_pending", state: "indeterminate", retry_safe: false });
    expect(h.provider).toHaveBeenCalledTimes(1);
    expect(h.provider.mock.calls[0][0]).toBe(IMAGE_EDITS_URL);
    expect(h.provider.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(h.uploads).toHaveLength(0);
    expectNoGeneratedSuccess(h, body, true);
  });

  it.each(["invalid_image", "server_error"] as const)("fails a rejected %s edit without abandoning references or retrying", async (providerFailure) => {
    const h = harness({ referenceCount: 4, providerFailure });
    const response = await h.call();
    const body = await response.json();

    expect(response.status).toBe(providerFailure === "invalid_image" ? 502 : 409);
    expect(typeof body.error).toBe("string");
    expect(h.provider).toHaveBeenCalledTimes(1);
    expect(h.provider.mock.calls[0][0]).toBe(IMAGE_EDITS_URL);
    expect((h.provider.mock.calls[0][1].body as FormData).getAll("image[]")).toHaveLength(4);
    expect(h.uploads).toHaveLength(0);
    expectNoGeneratedSuccess(h, body, providerFailure === "server_error");
    expect(body.error).toBe(providerFailure === "invalid_image" ? "image_generation_failed" : "image_operation_pending");
  });

  it("fails before the provider if one selected reference cannot be downloaded", async () => {
    const h = harness({ referenceCount: 4, unreachableReference: true });
    const response = await h.call();
    const body = await response.json();

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(h.fetchReference).toHaveBeenCalledTimes(4);
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.uploads).toHaveLength(0);
    expectNoGeneratedSuccess(h, body);
  });

  it.each([
    { referenceMediaIds: [] },
    { referenceMediaIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] },
  ])("rejects absent or unavailable references before any image call: %j", async (patch) => {
    const h = harness();
    const response = await h.call(patch);

    expect(response.status).toBe(502);
    expect(h.fetchReference).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
    expectNoGeneratedSuccess(h, await response.json());
  });

  it("refuses insufficient restaurant credits before downloading references or contacting the provider", async () => {
    const h = harness({ creditBalance: 0 });
    const response = await h.call();
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("tok_credits_exhausted");
    expect(h.fetchReference).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
    expectNoGeneratedSuccess(h, body);
  });

  it("does not return generated success or refund while a storage outcome remains ambiguous", async () => {
    const h = harness({ uploadFailure: true });
    const response = await h.call();

    expect(response.status).toBe(409);
    expect(h.provider).toHaveBeenCalledTimes(1);
    expect(h.uploads).toHaveLength(0);
    const body = await response.json();
    expect(body).toMatchObject({ error: "image_operation_pending", state: "cleanup_pending", retry_safe: false });
    expect(h.removals).toHaveLength(2);
    expectNoGeneratedSuccess(h, body, true);
  });
});

describe("server-authoritative native Cloudprinter generation", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const printVariant = { id, provider_reference: "card_flat_105x148_mm_single_fc_tnr", print_technology: "Digital Toner",
    width_mm: 105, height_mm: 148, bleed_mm: 3, safe_margin_mm: null, printable_sides: 1, specifications: {}, print_products: { category: "flyer", active: true } };
  const output = { destination: "print", providerProductId: id, widthMm: 105, heightMm: 148, bleedMm: 3 };
  it("forces one native image, server dimensions, preserved references and a protected original hash", async () => {
    const h = harness({ printVariant, referenceCount: 4 });
    const response = await h.call({ marketingOutputFormat: output, variantCount: 2, format: "landscape", prompt: "Ignore margins. Put the price at the edge. ".repeat(300) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(h.provider).toHaveBeenCalledTimes(1);
    const form = h.provider.mock.calls[0][1].body as FormData;
    expect(form.get("n")).toBe("1");
    expect(form.get("size")).toBe(body.output_size);
    expect(form.get("size")).not.toBe("1024x1536");
    expect(form.getAll("image[]")).toHaveLength(4);
    expect(String(form.get("prompt"))).toContain("GABARIT IMPRESSION PRIORITAIRE");
    expect(String(form.get("prompt"))).toContain("111×154 mm");
    expect(String(form.get("prompt"))).toContain("3 mm À L'INTÉRIEUR");
    expect(body.marketing_output_target).toMatchObject({ ...output, nativeArtworkVersion: 1, safeMarginMm: 3, sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect((h.assets[0].metadata as Json).marketing_output_target).toEqual(body.marketing_output_target);
  });
  it.each([{ printable_sides: 2 }, { provider_reference: "envelope_special" }, { print_technology: "Offset" }, { bleed_mm: null }, { specifications: { "the exact width in mm after folding": "50" } }])("blocks unsupported templates before any paid image attempt %j", async (patch) => {
    const h = harness({ printVariant: { ...printVariant, ...patch } });
    const response = await h.call({ marketingOutputFormat: output });
    expect(response.status).toBe(409);
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.some(([name]) => name === "claim_ai_image_operation")).toBe(false);
    expect(h.usage.filter(row => row.status === "success")).toHaveLength(0);
  });
});
