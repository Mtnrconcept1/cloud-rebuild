import { describe, expect, it, vi } from "vitest";

import {
  generateAdminTokPayableInvoices,
  markAdminRestaurantInvoicePaid,
  normalizeGeneratedInvoiceCount,
  type AdminComptaRpcClient,
} from "@/lib/adminComptaActions";

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as AdminComptaRpcClient,
    rpc,
  };
}

describe("admin compta actions", () => {
  it("normalizes generated invoice counts from RPC results", () => {
    expect(normalizeGeneratedInvoiceCount("3", false)).toBe(3);
    expect(normalizeGeneratedInvoiceCount(null, false)).toBe(0);
    expect(normalizeGeneratedInvoiceCount("invoice-id", true)).toBe(1);
    expect(normalizeGeneratedInvoiceCount(null, true)).toBe(0);
  });

  it("generates TOK payable invoices for all restaurants", async () => {
    const { client, rpc } = createRpcClient({ data: 2, error: null });

    await expect(
      generateAdminTokPayableInvoices(client, {
        restaurantId: "all",
        selectedMonth: "2026-06",
      }),
    ).resolves.toBe(2);

    expect(rpc).toHaveBeenCalledWith("admin_generate_tok_payable_invoices_all", {
      p_month: "2026-06-01",
    });
  });

  it("generates a TOK payable invoice for a selected restaurant", async () => {
    const { client, rpc } = createRpcClient({ data: "invoice-id", error: null });

    await expect(
      generateAdminTokPayableInvoices(client, {
        restaurantId: "restaurant-1",
        selectedMonth: "2026-06",
      }),
    ).resolves.toBe(1);

    expect(rpc).toHaveBeenCalledWith("admin_generate_tok_payable_invoice", {
      p_restaurant_id: "restaurant-1",
      p_month: "2026-06-01",
    });
  });

  it("throws RPC errors during invoice generation", async () => {
    const { client } = createRpcClient({ data: null, error: { message: "Accounting month is closed" } });

    await expect(
      generateAdminTokPayableInvoices(client, {
        restaurantId: "all",
        selectedMonth: "2026-06",
      }),
    ).rejects.toThrow("Accounting month is closed");
  });

  it("marks a restaurant invoice as paid through the audited RPC", async () => {
    const { client, rpc } = createRpcClient({ data: null, error: null });

    await markAdminRestaurantInvoicePaid(client, {
      invoiceId: "invoice-1",
      paidAt: "2026-06-05T10:00:00.000Z",
      reference: "admin reference",
    });

    expect(rpc).toHaveBeenCalledWith("admin_mark_restaurant_invoice_paid", {
      p_invoice_id: "invoice-1",
      p_paid_at: "2026-06-05T10:00:00.000Z",
      p_reference: "admin reference",
    });
  });
});
