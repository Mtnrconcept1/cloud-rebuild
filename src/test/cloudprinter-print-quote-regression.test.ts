import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getCloudprinterDefaultOptions } from "../../supabase/functions/_shared/print/options";
import { safeProviderMessage } from "../../supabase/functions/_shared/print/request";
import {
  isCloudprinterOrderQuantityValid,
  normalizeCloudprinterOrderQuantity,
} from "../../supabase/functions/_shared/print/quantity";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Cloudprinter quote regression", () => {
  it("does not turn a normal 250-copy print run into 251 for a 10-copy set", () => {
    expect(normalizeCloudprinterOrderQuantity(250, 1, 10)).toBe(250);
    expect(normalizeCloudprinterOrderQuantity(251, 1, 10)).toBe(260);
    expect(normalizeCloudprinterOrderQuantity(1, 1, 10)).toBe(1);
    expect(isCloudprinterOrderQuantityValid(250, 1, 10)).toBe(true);
    expect(isCloudprinterOrderQuantityValid(251, 1, 10)).toBe(false);
  });

  it("extracts a safe nested provider error instead of logging [object Object]", () => {
    expect(safeProviderMessage(400, {
      error: {
        code: "invalid_count",
        message: "Product count is invalid",
      },
    })).toBe("Product count is invalid");
  });

  it("selects only valid Cloudprinter default product options", () => {
    expect(getCloudprinterDefaultOptions({
      options: [
        { reference: "paper_250ecb", type: "type_product_material", default: 1 },
        { reference: "product_finish_gloss", type: "type_sheet_product_finish", default: true },
        { reference: "envelope_none", type: "type_card_addon", default: "1" },
        { reference: "right_angled_corners", type: "type_product_shape", default: 1 },
        { reference: "paper_400scb", type: "type_product_material", default: 0 },
        { reference: "", type: "type_product_shape", default: 1 },
      ],
    })).toEqual([
      { type: "paper_250ecb", count: 1 },
      { type: "product_finish_gloss", count: 1 },
      { type: "envelope_none", count: 1 },
      { type: "right_angled_corners", count: 1 },
    ]);
  });

  it("uses the same provider quantity and option contract in quote, checkout and fulfillment", () => {
    const quote = read("supabase/functions/print-quote/index.ts");
    const checkout = read("supabase/functions/print-checkout/index.ts");
    const orchestrator = read("supabase/functions/print-orchestrator/index.ts");
    const composer = read("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");

    expect(quote).toContain("isCloudprinterOrderQuantityValid");
    expect(quote).toContain("getCloudprinterDefaultOptions");
    expect(quote).toContain("options: providerOptions");
    expect(quote).toContain("CloudprinterError");
    expect(quote).toContain("providerStatus");

    expect(checkout).toContain("getCloudprinterDefaultOptions");
    expect(checkout).toContain("options: providerOptions");
    expect(checkout).not.toContain("options: []");

    expect(orchestrator).toContain("options: Array.isArray(input.item.options) ? input.item.options : []");
    expect(orchestrator).toContain("options: Array.isArray(item.options) ? item.options : []");

    expect(composer).toContain("normalizePrintOrderQuantity");
    expect(composer).not.toContain("const offset = current - selectedVariant.minimumQuantity");
  });
});
