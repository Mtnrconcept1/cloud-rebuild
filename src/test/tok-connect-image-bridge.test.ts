import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Execute the real bridge and its idempotency functions. Only external
// identity, database and HTTP boundaries are replaced with local fixtures.
const source = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const restaurantId = "12f4babe-9438-4fda-8892-20c26ea7f7bb";
const referenceId = "414bdcd2-dd02-45a5-bf0c-9fdbd7f0ef83";
const image = {
  capability: "restaurant.ai.image", confirmed_by_user: true,
  idempotency_key: "marketing-image-bridge-attempt-1",
  payload: {
    restaurantId, assetType: "campaign_visual", marketingAssetMode: true,
    prompt: "Un visuel fidèle aux références du restaurant", format: "square",
    referenceMediaIds: [referenceId], variantCount: 1, generateImage: true, imageOnly: true,
  },
};
const nativeSuccess = {
  ok: true, image_url: "https://tok.test/storage/v1/object/public/restaurant-images/visual.png",
  media_id: "12a6a324-50e2-4f6d-b56c-df4d3ee511f4", credits_used: 6,
};
type JsonRecord = Record<string, unknown>;
type IdempotencyRow = {
  user_id: string; idempotency_key: string; operation: string; request_hash: string;
  response_body?: JsonRecord; status_code?: number;
};

const realNetwork = vi.fn(async () => { throw new Error("real_network_forbidden_in_image_bridge_test"); });
beforeEach(() => {
  realNetwork.mockClear();
  vi.stubGlobal("fetch", realNetwork);
});
afterEach(() => {
  try { expect(realNetwork).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

function harness(options: {
  failure?: "fetch" | "body";
  nativeBody?: JsonRecord;
  nativeStatus?: number;
} = {}) {
  const records = new Map<string, IdempotencyRow>();
  const persistResult = vi.fn((key: string, patch: Partial<IdempotencyRow>) => {
    const row = records.get(key);
    if (!row) throw new Error("cannot_complete_unclaimed_request");
    records.set(key, structuredClone({ ...row, ...patch }));
  });
  const adminClient = {
    from: (table: string) => {
      if (table !== "tok_connect_mcp_action_idempotency") throw new Error(`unexpected_fixture_table:${table}`);
      const filters: Record<string, unknown> = {};
      let update: Partial<IdempotencyRow> | null = null;
      const key = () => `${filters.user_id}:${filters.idempotency_key}`;
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters[field] = value; return query; },
        maybeSingle: async () => ({ data: structuredClone(records.get(key()) || null), error: null }),
        insert: async (row: IdempotencyRow) => {
          const rowKey = `${row.user_id}:${row.idempotency_key}`;
          if (records.has(rowKey)) return { error: { code: "23505" } };
          records.set(rowKey, structuredClone(row));
          return { error: null };
        },
        update: (patch: Partial<IdempotencyRow>) => { update = patch; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (update) persistResult(key(), update);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
    if (options.failure === "fetch") throw new Error("fixture_sensitive_transport_detail");
    if (options.failure === "body") {
      return new Response(new ReadableStream({
        start(controller) { controller.error(new Error("fixture_sensitive_body_detail")); },
      }), { status: 200 });
    }
    return Response.json(options.nativeBody ?? nativeSuccess, { status: options.nativeStatus ?? 200 });
  });
  const dependencies = {
    HttpError, fetch, tokOAuthEdgeFetch: (_actor: unknown, url: string, init: RequestInit) => fetch(url, init),
    Deno: {
      env: { get: (name: string) => ({ SUPABASE_URL: "https://tok.test", SUPABASE_ANON_KEY: "publishable-fixture" })[name] },
      serve: () => {},
    },
    requireUserRole: (actor: { roles: string[] }, roles: string[]) => {
      if (!actor.roles.some((role) => roles.includes(role))) throw new HttpError(403, "forbidden");
    },
    sha256Base64Url: async (value: string) => createHash("sha256").update(value).digest("base64url"),
  };
  const invokeEdge = new Function(...Object.keys(dependencies), `${compiled};return invokeEdge;`)(...Object.values(dependencies));
  const actor = { userId: "restaurant-owner-fixture", roles: ["restaurateur"], adminClient };
  const request = new Request("https://tok.test", { headers: { authorization: "Bearer restaurant-fixture" } });
  return {
    actor, records, fetch, persistResult,
    generate: (body = image) => invokeEdge(request, actor, body),
    claim: () => records.get(`${actor.userId}:${image.idempotency_key}`),
  };
}

describe("TOK marketing image bridge transport and idempotency", () => {
  it.each(["fetch", "body"] as const)("keeps a %s failure indeterminate and the original claim pending", async (failure) => {
    const h = harness({ failure });
    await expect(h.generate()).rejects.toMatchObject({
      status: 503, message: "tok_marketing_visual_result_unconfirmed",
    });
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.records.size).toBe(1);
    expect(h.claim()).toMatchObject({
      user_id: h.actor.userId, idempotency_key: image.idempotency_key,
      operation: "edge:restaurant.ai.image", request_hash: expect.any(String),
    });
    expect(h.claim()?.response_body).toBeUndefined();
    expect(h.claim()?.status_code).toBeUndefined();
    expect(h.persistResult).not.toHaveBeenCalled();

    const pending = structuredClone(h.claim());
    await expect(h.generate()).rejects.toMatchObject({
      status: 409, message: "tok_connect_idempotency_request_in_progress",
    });
    await expect(h.generate({ ...image, payload: { ...image.payload, prompt: "Un autre visuel" } })).rejects.toMatchObject({
      status: 409, message: "tok_connect_idempotency_key_reused_with_different_body",
    });
    expect(h.claim()).toEqual(pending);
    expect(h.persistResult).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("forwards one authorized native image request and replays its exact saved result", async () => {
    const h = harness();
    const first = await h.generate();
    expect(first).toEqual({
      statusCode: 200,
      payload: {
        ok: true, mode: "edge", capability: "restaurant.ai.image",
        downstream_status: 200, data: nativeSuccess, replayed: false,
      },
    });
    expect(h.persistResult).toHaveBeenCalledOnce();
    expect(h.claim()?.response_body).toEqual(first.payload);
    const saved = structuredClone(h.claim());
    // A new object with the same values must use the durable stored response.
    expect(await h.generate(structuredClone(image))).toEqual({
      ...first, payload: { ...first.payload, replayed: true },
    });
    expect(h.claim()).toEqual(saved);
    expect(h.persistResult).toHaveBeenCalledOnce();
    expect(h.fetch).toHaveBeenCalledOnce();
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("https://tok.test/functions/v1/ai-image-enhance");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(image.payload);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer restaurant-fixture");
    expect(headers.get("apikey")).toBe("publishable-fixture");
    expect(headers.get("idempotency-key")).toBe(image.idempotency_key);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects different reference inputs with an already completed key before another paid request", async () => {
    const h = harness();
    await h.generate();
    const saved = structuredClone(h.claim());
    await expect(h.generate({ ...image, payload: { ...image.payload, referenceMediaIds: ["163d92a1-631a-415a-aa7b-290bc5390780"] } })).rejects.toMatchObject({
      status: 409, message: "tok_connect_idempotency_key_reused_with_different_body",
    });
    expect(h.claim()).toEqual(saved);
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.persistResult).toHaveBeenCalledOnce();
  });

  it.each([
    { nativeStatus: 409, nativeBody: { ok: false, error_code: "marketing_reference_mismatch" }, expectedStatus: 409 },
    { nativeStatus: 200, nativeBody: { ok: false, error_code: "insufficient_credits" }, expectedStatus: 422 },
  ])("persists and replays an explicit native refusal returned with HTTP $nativeStatus", async ({ nativeStatus, nativeBody, expectedStatus }) => {
    const h = harness({ nativeStatus, nativeBody });
    const first = await h.generate();
    expect(first).toEqual({
      statusCode: expectedStatus,
      payload: {
        ok: false, mode: "edge", capability: "restaurant.ai.image",
        downstream_status: nativeStatus, data: nativeBody, replayed: false,
      },
    });
    expect(h.claim()).toMatchObject({ status_code: expectedStatus, response_body: first.payload });
    expect(await h.generate()).toEqual({ ...first, payload: { ...first.payload, replayed: true } });
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.persistResult).toHaveBeenCalledOnce();
  });
});
