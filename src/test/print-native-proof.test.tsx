import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrintProof from "@/components/dashboard/marketing-print/PrintProof";
import { createMarketingPrintDocument, type PrintProductSpec } from "@/lib/print/document";
const product: PrintProductSpec = { productId: "a6", providerProductId: "variant", providerReference: "a6", displayName: "A6", widthMm: 105, heightMm: 148, bleedMm: 3, safeMarginMm: 5, printableSides: 1, orientation: "portrait", printTechnology: "Digital Toner", minimumQuantity: 1, quantityStep: 1, options: [] };
const document = createMarketingPrintDocument({ title: "Metadata", background: { url: "https://image.test/original.png", mimeType: "image/png", widthPx: 1776, heightPx: 2464 } });
afterEach(cleanup);
describe("unmodified native proof", () => {
  it("places trim/safety independently on both full-bleed axes and never draws document overlays", () => {
    render(<PrintProof product={product} document={{ ...document, texts: [{ id: "injected", kind: "price", text: "INJECTED PRICE", x: .2, y: .2, width: .5, height: .1 }] }} />);
    expect(screen.queryByText("INJECTED PRICE")).toBeNull();
    expect(screen.getByRole("img")).toHaveClass("object-contain");
    const trim = screen.getByLabelText("Ligne de coupe");
    const safe = screen.getByLabelText("Zone de sécurité");
    expect(parseFloat(trim.style.left)).toBeCloseTo(3 / 111 * 100);
    expect(parseFloat(trim.style.top)).toBeCloseTo(3 / 154 * 100);
    expect(parseFloat(safe.style.left)).toBeCloseTo(8 / 111 * 100);
    expect(parseFloat(safe.style.top)).toBeCloseTo(8 / 154 * 100);
    fireEvent.click(screen.getByLabelText("Afficher les repères non imprimés"));
    expect(screen.queryByLabelText("Ligne de coupe")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe(document.background.url);
  });
});
