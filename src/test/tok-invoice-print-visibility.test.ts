import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(name, "utf8");

describe("TOK invoice PDF print visibility", () => {
  const indexCss = read("src/index.css");
  const dialog = read("src/components/invoices/TokPayableInvoiceDialog.tsx");
  const shared = read("src/lib/safePrintWindow.ts");
  const admin = read("src/pages/admin/adminComptaShared.ts");

  it("overrides the legacy contract print rule hiding the entire body", () => {
    expect(indexCss).toContain("body * {\n    visibility: hidden;");
    expect(dialog).toContain(".tok-print-shell, .tok-print-shell * {");
    expect(dialog).toContain("visibility: visible !important;");
    expect(dialog).toContain("display: block !important;");
    expect(dialog).toContain("break-before: avoid;");
    expect(dialog).toContain("printDelayMs: 900");
  });

  it("prints the visible canonical TOK invoice with resolved logo URLs", () => {
    expect(dialog).toContain('const printable = printDocumentRef.current.cloneNode(true)');
    expect(dialog).toContain('printable.querySelectorAll("img")');
    expect(dialog).toContain('new URL(src, document.baseURI).href');
    expect(dialog).toContain("openPrintWindow(dialogTitle, printable.outerHTML)");
    expect(shared).toContain("assertSafePrintHtmlFragment");
    expect(dialog).toContain('class="tok-print-shell"');
  });

  it("shows a paid subscription in the October ledger even if its term ends in November", () => {
    expect(admin).toContain(".gte(\"period_start\", monthBounds.monthStart)");
    expect(admin).toContain(".lte(\"period_start\", monthBounds.monthEnd)");
    expect(admin).toContain('["payable", "reservation_fees", "subscription"]');
  });
});
