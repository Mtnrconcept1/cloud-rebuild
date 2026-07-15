import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

const formulesSource = readFileSync("src/pages/dashboard/DashboardFormules.tsx", "utf8");
const promotionsSource = readFileSync("src/pages/dashboard/DashboardPromotions.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker?: string) {
  const start = source.indexOf(startMarker);
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  expect(end, `missing source marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function expectBefore(source: string, guard: string, productionCall: string) {
  const guardIndex = source.indexOf(guard);
  const productionCallIndex = source.indexOf(productionCall);
  expect(guardIndex, `missing guard: ${guard}`).toBeGreaterThanOrEqual(0);
  expect(productionCallIndex, `missing production call: ${productionCall}`).toBeGreaterThanOrEqual(0);
  expect(guardIndex).toBeLessThan(productionCallIndex);
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commercial demo formulas and promotions isolation", () => {
  it("keeps tool state separated by session and tool", () => {
    vi.stubGlobal("window", { sessionStorage: new MemoryStorage() });

    const formula = [{ id: "formula-a", is_active: true }];
    const promotion = [{ id: "promotion-a", active: true }];
    writeCommercialDemoToolState("session-a", "formulas", formula);
    writeCommercialDemoToolState("session-a", "promotions", promotion);

    expect(readCommercialDemoToolState("session-a", "formulas", [])).toEqual(formula);
    expect(readCommercialDemoToolState("session-a", "promotions", [])).toEqual(promotion);
    expect(readCommercialDemoToolState("session-b", "formulas", [{ id: "fallback" }]))
      .toEqual([{ id: "fallback" }]);
  });

  it("routes formula and progressive-offer reads to session storage before Supabase", () => {
    const dashboard = sourceBetween(
      formulesSource,
      "export default function DashboardFormules()",
      "function PresetFormulaCard(",
    );
    const formulaQuery = sourceBetween(dashboard, 'queryKey: formulasQueryKey', 'queryKey: progressiveOffersQueryKey');
    const progressiveQuery = sourceBetween(dashboard, 'queryKey: progressiveOffersQueryKey', 'const formulaMap = useMemo');

    expectBefore(formulaQuery, "if (demoSessionId)", '.from("meal_formulas")');
    expectBefore(progressiveQuery, "if (demoSessionId)", 'supabase.from("reservation_progressive_offers"');
    expect(formulaQuery).toContain("readCommercialDemoToolState<any[]>");
    expect(progressiveQuery).toContain("COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL");
  });

  it("returns from every progressive-offer mutation before live table or RPC access", () => {
    const manager = sourceBetween(formulesSource, "function ProgressiveOfferManager(", "export default function DashboardFormules()");
    const save = sourceBetween(manager, "const save = async () => {", "const finalizeOffer = async");
    const finalize = sourceBetween(manager, "const finalizeOffer = async", "const updateOfferStatus = async");
    const updateStatus = sourceBetween(manager, "const updateOfferStatus = async", "const previewOffer =");

    expectBefore(save, "if (demoSessionId)", 'supabase.from("reservation_progressive_offers"');
    expect(save).toContain("writeCommercialDemoToolState(");
    expect(save).toContain("return true;");
    expectBefore(finalize, "if (demoSessionId)", "supabase.rpc");
    expect(finalize).toContain("return;");
    expectBefore(updateStatus, "if (demoSessionId)", 'supabase.from("reservation_progressive_offers"');
    expect(updateStatus).toContain("writeCommercialDemoToolState(");
  });

  it("returns from formula saves before meal formula and category writes", () => {
    const card = sourceBetween(formulesSource, "function PresetFormulaCard(");
    const save = sourceBetween(card, "const save = async", "const handleToggle = async");

    expectBefore(save, "if (demoSessionId)", 'supabase.from("meal_formulas")');
    expectBefore(save, "if (demoSessionId)", 'supabase.from("meal_formula_categories")');
    expect(save).toContain("COMMERCIAL_DEMO_FORMULAS_TOOL");
    expect(save).toContain("onDemoFormulasChanged?.(next)");
  });

  it("keeps promotion reads and CRUD inside the commercial session", () => {
    const dashboard = sourceBetween(promotionsSource, "export default function DashboardPromotions()", "function PromoForm(");
    const query = sourceBetween(dashboard, "queryFn: async () => {", "const updateCommercialDemoPromotions");
    const toggle = sourceBetween(dashboard, "const toggleActive = async", "const deletePromo = async");
    const remove = sourceBetween(dashboard, "const deletePromo = async", "return (");
    const form = sourceBetween(promotionsSource, "function PromoForm(");
    const submit = sourceBetween(form, "const handleSubmit = async", "return (");

    expectBefore(query, "if (demoSessionId)", '.from("restaurant_promotions")');
    expect(dashboard).toContain("writeCommercialDemoToolState(demoSessionId, COMMERCIAL_DEMO_PROMOTIONS_TOOL, next)");
    expectBefore(toggle, "updateCommercialDemoPromotions", 'supabase.from("restaurant_promotions")');
    expect(toggle).toContain("return;");
    expectBefore(remove, "updateCommercialDemoPromotions", 'supabase.from("restaurant_promotions")');
    expect(remove).toContain("return;");
    expectBefore(submit, "if (demoSessionId)", 'supabase.from("restaurant_promotions")');
    expect(submit).toContain("if (saved) onSaved()");
    expect(submit).toContain("return;");
  });
});
