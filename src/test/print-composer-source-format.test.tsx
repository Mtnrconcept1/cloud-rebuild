import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ assets: [] as any[], catalog: [] as any[], exportCall: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({
  from: (table: string) => {
    const query: any = {};
    for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
    query.limit = () => Promise.resolve({ data: table === "ai_generated_assets" ? fixtures.assets : [], error: null });
    query.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return query;
  },
  storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://images.example/${path}` } }) }) },
}) }));
vi.mock("@/lib/print/client", () => ({ getPrintCatalog: async () => ({ products: fixtures.catalog }),
  createPrintExport: fixtures.exportCall, approvePrintExport: vi.fn(), createPrintQuote: vi.fn() }));
vi.mock("@/lib/print/checkout", () => ({ createPrintCheckout: vi.fn() }));
vi.mock("@/components/dashboard/marketing-print/PrintProof", () => ({ default: () => <div>BAT</div> }));
import PrintComposerDialog from "@/components/dashboard/marketing-print/PrintComposerDialog";

const a4 = { productId: "flyer", providerProductId: "11111111-1111-4111-8111-111111111111", providerReference: "a4",
  displayName: "A4", widthMm: 210, heightMm: 297, bleedMm: 3, safeMarginMm: 5, printableSides: 1,
  minimumQuantity: 1, quantityStep: 1, options: [], specifications: {} };
const a5 = { ...a4, providerProductId: "22222222-2222-4222-8222-222222222222", displayName: "A5", widthMm: 148, heightMm: 210 };
const asset = (id: string, target: unknown) => ({ id, asset_url: `https://images.example/${id}.png`, title: id,
  asset_type: "campaign_visual", storage_bucket: "restaurant-images", storage_path: `${id}.png`,
  created_at: "2026-10-08T12:00:00Z", metadata: { marketing_output_target: target } });

beforeEach(() => {
  fixtures.catalog = [{ id: "flyer", slug: "flyer", displayName: "Flyer", category: "flyer", variants: [a5, a4] }];
  fixtures.assets = [];
  vi.stubGlobal("Image", class {
    naturalWidth = 2048; naturalHeight = 3072; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("print composer follows the generated creation", () => {
  it("selects A4 portrait automatically even if A5 is first in the catalogue", async () => {
    fixtures.assets = [asset("other", { destination: "print", ...a5 }), asset("selected", { destination: "print", ...a4 })];
    render(<PrintComposerDialog restaurantId="restaurant" initialSourceGenerationId="selected" open showTrigger={false} />);
    await screen.findByText("Format et orientation verrouillés sur la création générée.");
    expect(screen.getByText("Flyer · 210 × 297 mm")).toBeTruthy();
    expect(screen.queryByText("Flyer · 148 × 210 mm")).toBeNull();
    expect(screen.getAllByRole("combobox")).toHaveLength(1); // Creation picker only; no format selector.
    expect(screen.getByRole("combobox").textContent).toContain("selected");
  });
  it.each([null, { destination: "digital" }, { destination: "print", ...a4, widthMm: 297, heightMm: 210 }])( "blocks an unknown, digital or incompatible source (%j)", async (format) => {
      fixtures.assets = [asset("selected", format)];
      render(<PrintComposerDialog restaurantId="restaurant" initialSourceGenerationId="selected" open showTrigger={false} />);
      await screen.findByText(/Aucune création avec un format d’impression compatible/);
      expect(screen.queryByRole("button", { name: /générer le BAT/ })).toBeNull();
      expect(fixtures.exportCall).not.toHaveBeenCalled();
    });
});
