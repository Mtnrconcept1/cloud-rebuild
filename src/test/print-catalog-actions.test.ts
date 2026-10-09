import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geometryMatchesLogicalProduct, isSinglePagePrintProduct } from "../../supabase/functions/_shared/print/catalog.ts";

const state = vi.hoisted(() => ({
  products: [] as any[], existing: [] as any[], variants: [] as any[], logical: null as any,
  details: null as any, error: null as any, admin: true,
  upsert: vi.fn(), getProducts: vi.fn(), getProduct: vi.fn(), audit: vi.fn(), range: vi.fn(), update: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/print/cloudprinter.ts", () => ({
  CloudprinterError: class extends Error {},
  getPrintProvider: () => ({ getProducts: state.getProducts, getProduct: state.getProduct }),
}));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({ buildCorsHeaders: () => ({}), handleCorsPreflight: () => null }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return {
    HttpError, authenticateRequest: async () => ({ isAdmin: state.admin, roles: state.admin ? ["admin"] : ["restaurateur"] }),
    requireRole: (_actor: unknown, roles: string[]) => { if (!state.admin && !roles.includes("restaurateur")) throw new HttpError(403, "Forbidden"); },
    requireRestaurantAccess: async () => {}, assertProductionFlowAllowed: async () => {}, writeAuditLog: state.audit,
    jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    createAdminClient: () => ({ from: (table: string) => {
      let selectingExisting = false;
      const query: any = {};
      query.select = (columns: string) => { selectingExisting = columns === "id, provider_reference, print_product_id, active"; return query; };
      for (const method of ["eq", "in", "order", "limit", "update"]) query[method] = () => query;
      query.range = (from: number, to: number) => { state.range(from, to); return query; };
      query.update = (patch: unknown) => { state.update(patch); return query; };
      query.upsert = (rows: unknown, options: unknown) => { state.upsert(rows, options); return query; };
      query.maybeSingle = async () => ({ data: table === "print_provider_products" ? { id: "mapping-id", provider_reference: "a4" } : state.logical, error: state.error });
      query.single = async () => ({ data: { id: "mapping-id" }, error: state.error });
      query.then = (resolve: (result: unknown) => void) => resolve({ error: state.error,
        data: table === "print_products" ? state.products : selectingExisting ? state.existing : state.variants });
      return query;
    } }),
  };
});

let handler: (req: Request) => Promise<Response>;
const productId = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => handler(new Request("https://example.test/print-catalog", { method: "POST", body: JSON.stringify(body) }));
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; } });
  state.admin = true; state.error = null; state.products = []; state.existing = []; state.variants = [];
  state.logical = { id: productId, active: true, category: "poster", default_width_mm: 210, default_height_mm: 297 };
  state.details = { reference: "a4", name: "A4", widthMm: 210, heightMm: 297, printableSides: 1, specifications: {}, options: [], raw: { private: "provider-data" } };
  state.upsert.mockReset(); state.audit.mockReset(); state.range.mockReset(); state.update.mockReset();
  state.getProduct.mockReset().mockImplementation(async () => state.details);
  state.getProducts.mockReset().mockResolvedValue([]);
  await import("../../supabase/functions/print-catalog/index.ts");
});
afterEach(() => vi.unstubAllGlobals());

describe("Cloudprinter catalogue administration", () => {
  it("paginates administrator mappings beyond the former 500-row cap", async () => {
    state.variants = Array.from({ length: 51 }, (_, i) => ({ id: `mapping-${500 + i}` }));
    const response = await request({ action: "admin_mappings", offset: 500, limit: 50 });
    const result = await response.json();
    expect(state.range).toHaveBeenCalledWith(500, 550);
    expect(result.mappings).toHaveLength(50);
    expect(result.mappings[0].id).toBe("mapping-500");
    expect(result.nextOffset).toBe(550);
    state.variants = [{ id: "last" }];
    expect((await (await request({ action: "admin_mappings", offset: 550, limit: 50 })).json()).nextOffset).toBeNull();
    expect((await request({ action: "admin_mappings", offset: -1 })).status).toBe(400);
  });
  it("discovers all unique references with bounded pagination and no raw provider data", async () => {
    state.getProducts.mockResolvedValue([{ reference: "b", name: "B", raw: { secret: "hidden" } }, { reference: "a", name: "A", raw: {} }, { reference: "a", name: "A", raw: {} }]);
    const response = await request({ action: "discover", limit: 1 });
    expect(await response.json()).toEqual({ products: [{ reference: "a", name: "A" }], total: 2, nextOffset: 1 });
    expect((await request({ action: "discover", limit: 101 })).status).toBe(400);
  });
  it.each(["discover", "map", "sync"])("requires admin for %s", async (action) => {
    state.admin = false;
    expect((await request({ action })).status).toBe(403);
    expect(state.getProducts).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("hydrates and audits a validated mapping", async () => {
    const response = await request({ action: "map", reference: "a4", productId, active: true });
    expect(response.status).toBe(200);
    expect(state.getProduct).toHaveBeenCalledWith("a4");
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ print_product_id: productId, active: true, width_mm: 210, height_mm: 297, printable_sides: 1 }), { onConflict: "provider,provider_reference" });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "map_cloudprinter", status: "success" }));
  });
  it.each([
    { widthMm: 297, heightMm: 210 }, { widthMm: null },
    { printableSides: 2 }, { specifications: { "number of printable pages": 12 } },
  ])("rejects rotated, unknown or multipage mapping %j", async (details) => {
    Object.assign(state.details, details);
    expect((await request({ action: "map", reference: "a4", productId, active: true })).status).toBe(409);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("permits storing a non-orderable mapping without activating it", async () => {
    state.details.printableSides = 2;
    expect((await request({ action: "map", reference: "a4", productId, active: false })).status).toBe(200);
  });
  it("deduplicates provider responses and batches upserts while preserving mappings", async () => {
    const products = Array.from({ length: 205 }, (_, i) => ({ reference: `p${i}`, name: `P${i}`, raw: {} }));
    state.getProducts.mockResolvedValue([...products, products[0]]);
    state.existing = [{ id: "stored", provider_reference: "p0", print_product_id: productId, active: true }];
    const response = await request({ action: "sync" });
    expect(response.status).toBe(200);
    expect(state.upsert.mock.calls.map(([rows]) => rows.length)).toEqual([100, 100, 5]);
    // Duplicate references in one PostgreSQL upsert trigger cardinality error 21000.
    const writtenReferences = state.upsert.mock.calls.flatMap(([rows]) => rows.map((row: any) => row.provider_reference));
    expect(new Set(writtenReferences).size).toBe(writtenReferences.length);
    expect(state.upsert.mock.calls[0][0][0]).toMatchObject({ print_product_id: productId, active: true });
    expect((await response.json()).discovered).toBe(205);
  });
  it("returns only neutral database diagnostics for plain PostgREST errors", async () => {
    state.getProducts.mockResolvedValue([{ reference: "a4", name: "A4", raw: {} }]);
    state.error = { code: "21000", message: "duplicate secret-key", details: "private row", hint: "private hint" };
    const response = await request({ action: "sync" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Erreur interne catalogue impression", databaseError: { code: "21000" } });
    expect(JSON.stringify(state.audit.mock.calls)).not.toMatch(/secret-key|private row|private hint/);
  });
});

describe("orderable generation catalogue", () => {
  it("excludes inactive, rotated, duplex and multipage variants", async () => {
    state.products = [state.logical];
    const variant = { id: "good", print_product_id: productId, provider_reference: "a4", width_mm: 210, height_mm: 297, printable_sides: 1, specifications: {}, active: true };
    state.variants = [variant, { ...variant, id: "inactive", active: false }, { ...variant, id: "rotated", width_mm: 297, height_mm: 210 }, { ...variant, id: "duplex", printable_sides: 2 }, { ...variant, id: "book", specifications: { "number of printable pages": 12 } }];
    for (const action of ["list", "generation_catalog"]) {
      const body = await (await request({ action, restaurantId: "restaurant" })).json();
      expect(body.products[0].variants.map((row: any) => row.providerProductId)).toEqual(["good"]);
    }
  });
  it.each(["calendar", "folded_leaflet", "book"])("rejects unsupported category %s even with one printable side", (category) => {
    expect(isSinglePagePrintProduct({ printable_sides: 1 }, { category })).toBe(false);
  });
  it("requires hydrated sides and dimensions", () => {
    expect(isSinglePagePrintProduct({})).toBe(false);
    expect(geometryMatchesLogicalProduct({}, { width_mm: 210, height_mm: 297 })).toBe(false);
  });
});

describe("legacy print-admin mapping activation", () => {
  beforeEach(async () => { await import("../../supabase/functions/print-admin/index.ts"); });
  it.each([
    { widthMm: 297, heightMm: 210 }, { widthMm: null }, { printableSides: 2 },
    { specifications: { "number of printable pages": 12 } },
  ])("cannot bypass geometry and one-page checks (%j)", async (details) => {
    Object.assign(state.details, details);
    expect((await request({ action: "map_product", providerProductId: "mapping-id", printProductId: productId })).status).toBe(409);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects folded products even when geometry and sides match", async () => {
    state.logical.category = "folded_leaflet";
    expect((await request({ action: "map_product", providerProductId: "mapping-id", printProductId: productId })).status).toBe(409);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("preserves the valid legacy activation contract and audit", async () => {
    expect((await request({ action: "map_product", providerProductId: "mapping-id", printProductId: productId })).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ active: true, print_product_id: productId }));
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "map_product", status: "success" }));
  });
  it("allows saving a duplex mapping inactive", async () => {
    state.details.printableSides = 2;
    expect((await request({ action: "map_product", providerProductId: "mapping-id", printProductId: productId, active: false })).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });
});
