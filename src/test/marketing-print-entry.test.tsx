import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketingStudioPrintCatalogBridge from "@/components/dashboard/marketing-print/MarketingStudioPrintCatalogBridge";

afterEach(cleanup);
describe("marketing print entry", () => {
  it("exposes no print entry for a creation without a compatible recorded format", () => {
    const rootRef = createRef<HTMLDivElement>();
    const open = vi.fn();
    render(<><div ref={rootRef}><div><button>Générer</button></div></div>
      <MarketingStudioPrintCatalogBridge rootRef={rootRef} printEnabled printableCreation={false} onOpenPrintComposer={open} /></>);
    expect(screen.queryByRole("button", { name: "Imprimer une création" })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it("opens the composer for a compatible generated creation", () => {
    const rootRef = createRef<HTMLDivElement>();
    const open = vi.fn();
    render(<><div ref={rootRef}><div><button>Générer</button></div></div>
      <MarketingStudioPrintCatalogBridge rootRef={rootRef} printEnabled printableCreation onOpenPrintComposer={open} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer une création" }));
    expect(open).toHaveBeenCalledOnce();
  });
});
