import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("uses the same provider quantity rule in the quote API and the print composer", () => {
    const quote = read("supabase/functions/print-quote/index.ts");
    const composer = read("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");

    expect(quote).toContain("isCloudprinterOrderQuantityValid");
    expect(quote).toContain("CloudprinterError");
    expect(quote).toContain("providerStatus");
    expect(composer).toContain("normalizePrintOrderQuantity");
    expect(composer).not.toContain("const offset = current - selectedVariant.minimumQuantity");
  });
});
