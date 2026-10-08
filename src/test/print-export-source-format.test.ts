import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ source: null as any, pdf: vi.fn(), audit: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
vi.mock("../../supabase/functions/_shared/print/pdf.ts", () => ({ buildPrintPdf: state.pdf }));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({ buildCorsHeaders: () => ({}), handleCorsPreflight: () => null }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { HttpError, authenticateRequest: async () => ({ userId: "user" }), requireRole: () => {},
    requireRestaurantAccess: async () => {}, assertProductionFlowAllowed: async () => {}, writeAuditLog: state.audit,
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    createAdminClient: () => ({ from: (table: string) => {
      const query: any = {};
      for (const method of ["select", "eq", "not"]) query[method] = () => query;
      query.maybeSingle = async () => ({ error: null, data: table === "ai_generated_assets" ? state.source : {
        id: "11111111-1111-4111-8111-111111111111", width_mm: 210, height_mm: 297, bleed_mm: 3, safe_margin_mm: 5,
      } });
      return query;
    } }),
  };
});
let handler: (req: Request) => Promise<Response>;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; } });
  state.pdf.mockReset().mockRejectedValue(new Error("PDF_REACHED"));
  state.audit.mockReset();
  await import("../../supabase/functions/print-export/index.ts");
});
afterEach(() => vi.unstubAllGlobals());
const request = () => new Request("https://example.test/print-export", { method: "POST", body: JSON.stringify({
  restaurantId: id, providerProductId: id, document: { sourceGenerationId: "22222222-2222-4222-8222-222222222222" },
}) });
describe("server enforcement of generated print format", () => {
  it.each([null, {}, { destination: "digital" }, { destination: "print", providerProductId: id, widthMm: 148, heightMm: 210, bleedMm: 3 },
    { destination: "print", providerProductId: id, widthMm: 297, heightMm: 210, bleedMm: 3 }])( "rejects unsupported source before preparing any PDF (%j)", async (format) => {
      state.source = { metadata: { marketing_output_target: format } };
      const response = await handler(request());
      expect(response.status).toBe(409);
      expect(state.pdf).not.toHaveBeenCalled();
    });
  it("allows the recorded A4 portrait format through to PDF preparation", async () => {
    state.source = { metadata: { marketing_output_target: { destination: "print", providerProductId: id, widthMm: 210, heightMm: 297, bleedMm: 3 } } };
    await handler(request());
    expect(state.pdf).toHaveBeenCalledOnce();
  });
  it("rejects a missing stored source instead of guessing its format", async () => {
    state.source = null;
    const response = await handler(request());
    expect(response.status).toBe(409);
    expect(state.pdf).not.toHaveBeenCalled();
  });
});
