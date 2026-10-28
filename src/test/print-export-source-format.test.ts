import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNativePrintTemplate } from "../../supabase/functions/_shared/print/artwork";
const state = vi.hoisted(() => ({ source: null as any, pdf: vi.fn(), audit: vi.fn(), sign: vi.fn(), rate: vi.fn(), existing: null as any, updates: vi.fn(), filters: [] as unknown[][] }));
const id = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
vi.mock("../../supabase/functions/_shared/print/pdf.ts", () => ({ buildPrintPdf: state.pdf }));
vi.mock("../../supabase/functions/_shared/rate-limit.ts", () => ({ createRateLimiter: () => ({ consume: state.rate }) }));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({ buildCorsHeaders: () => ({}), handleCorsPreflight: () => null }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { HttpError, authenticateRequest: async () => ({ userId: "user" }), requireRole: () => {},
    requireRestaurantAccess: async () => {}, assertProductionFlowAllowed: async () => {}, writeAuditLog: state.audit,
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    createAdminClient: () => ({ storage: { from: (bucket: string) => ({ createSignedUrl: (path: string, seconds: number) => state.sign(bucket, path, seconds) }) },
      from: (table: string) => {
        const query: any = {};
        for (const method of ["select", "eq", "not", "in"]) query[method] = (...args: unknown[]) => { state.filters.push([table, method, ...args]); return query; };
        query.update = (patch: unknown) => { state.updates(patch); return query; };
        query.single = async () => ({ error: null, data: { ...state.existing, status: "approved" } });
        query.maybeSingle = async () => ({ error: null, data: table === "ai_generated_assets" ? state.source : table === "print_exports" ? state.existing : {
          id: "11111111-1111-4111-8111-111111111111", provider_reference: "card_flat_210x297_mm_single_fc_tnr", print_technology: "Digital Toner", width_mm: 210, height_mm: 297, bleed_mm: 3, safe_margin_mm: null, printable_sides: 1,
        } });
        return query;
      },
    }),
  };
});
let handler: (req: Request) => Promise<Response>;
const geometry = { widthMm: 210, heightMm: 297, bleedMm: 3, safeMarginMm: 3 };
const format = () => ({ destination: "print", providerProductId: id, ...geometry, ...buildNativePrintTemplate(geometry).contract, sourceSha256: "a".repeat(64) });
const original = () => ({ title: "Original", storage_bucket: "ai-generated-assets", storage_path: `ai-generated/${id}/${sourceId}.png`, metadata: { marketing_output_target: format() } });
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; } });
  state.pdf.mockReset().mockRejectedValue(new Error("PDF_REACHED"));
  state.audit.mockReset(); state.updates.mockReset(); state.rate.mockReset().mockResolvedValue(undefined); state.filters = [];
  state.sign.mockReset().mockResolvedValue({ data: { signedUrl: "https://storage.example.test/storage/v1/object/sign/ai-generated-assets/original.png?token=opaque" }, error: null });
  state.source = original(); state.existing = null;
  await import("../../supabase/functions/print-export/index.ts");
});
afterEach(() => vi.unstubAllGlobals());
const request = (patch: Record<string, unknown> = {}) => new Request("https://example.test/print-export", { method: "POST", body: JSON.stringify({
  restaurantId: id, providerProductId: id, document: { sourceGenerationId: sourceId, background: { url: "https://attacker.invalid/upscaled.png", widthPx: 9999, heightPx: 9999 } }, ...patch,
}) });
describe("server enforcement of generated native print format", () => {
  it.each([null, {}, { destination: "digital" }, { ...format(), widthMm: 148, heightMm: 210 }, { ...format(), widthMm: 297, heightMm: 210 },
    { ...format(), nativeArtworkVersion: undefined }, { ...format(), safeMarginMm: 0 }, { ...format(), sourceSha256: undefined }])("rejects unsupported/stale/legacy source before PDF (%j)", async (f) => {
    state.source.metadata.marketing_output_target = f;
    expect((await handler(request())).status).toBe(409);
    expect(state.pdf).not.toHaveBeenCalled();
    expect(state.rate).not.toHaveBeenCalled();
  });
  it("uses only the stored original, defaults null safe margin to 3mm and ignores browser URLs/DPI", async () => {
    await handler(request());
    expect(state.pdf).toHaveBeenCalledOnce();
    const call = state.pdf.mock.calls[0][0];
    expect(call.spec.safeMarginMm).toBe(3);
    expect(call.expectedSourceSha256).toBe("a".repeat(64));
    expect(call.document.background.url).toContain("/original.png?");
    expect(call.document.background.widthPx).not.toBe(9999);
    expect(call.document.texts).toEqual([]);
    expect(state.sign).toHaveBeenCalledWith("ai-generated-assets", `ai-generated/${id}/${sourceId}.png`, 120);
    expect(state.filters).toContainEqual(["ai_generated_assets", "eq", "restaurant_id", id]);
    expect(state.rate).toHaveBeenCalledTimes(2);
  });
  it.each([{ texts: [{ text: "Injected price" }] }, { logo: {} }, { qr: {} }, { layout: { overlayOpacity: 1 } }])("blocks crafted overlays before visual cost %j", async (patch) => {
    expect((await handler(request({ document: { sourceGenerationId: sourceId, ...patch } }))).status).toBe(422);
    expect(state.pdf).not.toHaveBeenCalled();
    expect(state.rate).not.toHaveBeenCalled();
  });
  it("rejects a foreign original path even if the generated format matches", async () => {
    state.source.storage_path = `ai-generated/${sourceId}/${id}.png`;
    expect((await handler(request())).status).toBe(409);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("rejects a missing stored source without guessing its format", async () => {
    state.source = null;
    expect((await handler(request())).status).toBe(409);
    expect(state.pdf).not.toHaveBeenCalled();
  });
});
describe("explicit approval of the checked native PDF only", () => {
  const approve = (proofAcknowledged?: boolean) => request({ action: "approve", exportId: id, proofAcknowledged });
  beforeEach(() => { state.existing = { id, status: "ready", production_storage_path: "proof.pdf", preflight: { ready: true, nativeArtworkVersion: 1, sourceSha256: "a".repeat(64), artworkReview: { ready: true } } }; });
  it("requires explicit review acknowledgement", async () => {
    expect((await handler(approve())).status).toBe(400);
    expect(state.updates).not.toHaveBeenCalled();
  });
  it.each([{ ready: true }, { ready: true, nativeArtworkVersion: 1, artworkReview: { ready: false } }])("rejects legacy/incomplete preflight %j", async (preflight) => {
    state.existing.preflight = preflight;
    expect((await handler(approve(true))).status).toBe(409);
    expect(state.updates).not.toHaveBeenCalled();
  });
  it("cannot reapprove a cancelled export", async () => {
    state.existing.status = "cancelled";
    expect((await handler(approve(true))).status).toBe(409);
    expect(state.updates).not.toHaveBeenCalled();
  });
  it("approves a checked immutable proof under the restaurant and status guards", async () => {
    expect((await handler(approve(true))).status).toBe(200);
    expect(state.updates).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", approved_by: "user" }));
    expect(state.filters).toContainEqual(["print_exports", "in", "status", ["ready", "approved"]]);
  });
});
