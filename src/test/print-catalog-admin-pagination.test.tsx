import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), mapError: false }));
vi.mock("@/lib/session", () => ({ invokeSupabaseFunction: state.invoke }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
// Native select keeps this test focused on the admin data flow, not Radix portals.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: any) => <select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
import AdminPrintOrders from "@/pages/admin/AdminPrintOrders";

beforeEach(() => {
  state.mapError = false; state.toast.mockReset(); state.invoke.mockReset();
  state.invoke.mockImplementation(async (name: string, { body }: any) => {
    if (name === "print-admin") return { data: body.action === "list" ? { orders: [] } : { settings: null }, error: null };
    if (body.action === "map") return state.mapError
      ? { data: null, error: new Error("PRINT_MAPPING_GEOMETRY_MISMATCH") }
      : { data: { ok: true }, error: null };
    return { data: {
      mappings: [{ id: `mapping-${body.offset}`, provider_reference: `provider-${body.offset}`, provider_name: `Format ${body.offset}`, print_product_id: null, active: false }],
      logicalProducts: [{ id: "logical-a4", display_name: "Affiche A4", slug: "poster-a4" }],
      nextOffset: body.offset === 0 ? 50 : null,
    }, error: null };
  });
});
afterEach(cleanup);

describe("admin print provider catalogue", () => {
  it("loads next and previous server pages without truncating the available catalogue", async () => {
    render(<AdminPrintOrders />);
    await screen.findByText("Format 0");
    expect(screen.getByRole("button", { name: "Page précédente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    await screen.findByText("Format 50");
    expect(screen.queryByText("Format 0")).toBeNull();
    expect(screen.getByText("Page 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeDisabled();
    expect(state.invoke).toHaveBeenCalledWith("print-catalog", { body: { action: "admin_mappings", offset: 50, limit: 50 } });
    fireEvent.click(screen.getByRole("button", { name: "Page précédente" }));
    await screen.findByText("Format 0");
  });
  it.each([false, true])("sends mappings through validated catalogue endpoint (rejected=%s)", async (rejected) => {
    state.mapError = rejected;
    render(<AdminPrintOrders />);
    await screen.findByText("Format 0");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "logical-a4" } });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith("print-catalog", {
      body: { action: "map", reference: "provider-0", productId: "logical-a4", active: true },
    }));
    expect(state.invoke.mock.calls.some(([name, { body }]) => name === "print-admin" && body.action === "map_product")).toBe(false);
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: rejected ? "Mapping impossible" : "Produit Print activé" })));
    if (rejected) expect(screen.getByText("Inactif")).toBeTruthy();
  });
});
