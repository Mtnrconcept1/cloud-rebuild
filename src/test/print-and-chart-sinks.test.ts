import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildChartStyleCss,
  normalizeChartCssColor,
} from "@/lib/chartStyleSecurity";
import {
  assertSafePrintHtmlFragment,
  openSafeHtmlPrintDocument,
  openSafePrintWindow,
} from "@/lib/safePrintWindow";

describe("safe print windows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects active HTML fragments before opening a print document", () => {
    expect(() => assertSafePrintHtmlFragment("<script>alert(1)</script>", "body")).toThrow(
      /Unsafe body print HTML fragment/,
    );
    expect(() => assertSafePrintHtmlFragment('<img src=x onerror="alert(1)">', "body")).toThrow(
      /Unsafe body print HTML fragment/,
    );
    expect(() => assertSafePrintHtmlFragment('<a href="javascript:alert(1)">x</a>', "body")).toThrow(
      /Unsafe body print HTML fragment/,
    );
  });

  it("builds the print document through DOM APIs instead of document.write", () => {
    const printDocument = document.implementation.createHTMLDocument("print");
    const writeSpy = vi.spyOn(printDocument, "write");
    const nextWindow = {
      document: printDocument,
      focus: vi.fn(),
      print: vi.fn(),
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
    } as unknown as Window;

    vi.spyOn(window, "open").mockReturnValue(nextWindow);

    expect(openSafePrintWindow({
      title: "Facture <TOK>",
      headHtml: "<style>body{color:#111827}</style>",
      bodyHtml: '<main class="tok-print-shell">OK</main>',
      printDelayMs: 0,
    })).toBe(true);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(printDocument.title).toBe("Facture <TOK>");
    expect(printDocument.querySelector("main")?.textContent).toBe("OK");
  });

  it("falls back to an in-page print iframe when popup windows are blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(openSafeHtmlPrintDocument({
      title: "Contrat TOK",
      html: '<!doctype html><html lang="fr"><head><title>Contrat TOK</title></head><body><main>Contrat signé</main></body></html>',
      printDelayMs: 0,
    })).toBe(true);

    const iframe = document.querySelector('iframe[aria-hidden="true"]');
    expect(iframe).not.toBeNull();
    expect(iframe?.contentDocument?.querySelector("main")?.textContent).toBe("Contrat signé");
    iframe?.remove();
  });
});

describe("chart style sink hardening", () => {
  it("keeps safe chart colors and rejects CSS injection input", () => {
    expect(normalizeChartCssColor("hsl(var(--chart-1))")).toBe("hsl(var(--chart-1))");
    expect(normalizeChartCssColor("#ff6a00")).toBe("#ff6a00");
    expect(normalizeChartCssColor("red; background:url(javascript:alert(1))")).toBeNull();
  });

  it("sanitizes chart identifiers and variable names before CSS injection", () => {
    const css = buildChartStyleCss({
      id: "sales] { color:red }",
      config: {
        revenue: { color: "hsl(var(--chart-1))" },
        "bad;key": { color: "#ffffff" },
        evil: { color: "red; background:url(javascript:alert(1))" },
      },
    });

    expect(css).toContain("[data-chart=sales-color-red-]");
    expect(css).toContain("--color-revenue: hsl(var(--chart-1));");
    expect(css).not.toContain("bad;key");
    expect(css).not.toContain("javascript");
    expect(css).not.toContain("url(");
  });
});
