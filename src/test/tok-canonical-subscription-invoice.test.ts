import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPayableInvoiceDocumentData,
  isPayableInvoiceType,
} from "../lib/payableInvoice";

const read = (file: string) => readFileSync(file, "utf8");

describe("TOK unified subscription invoice document", () => {
  const sql = read("supabase/migrations/20261014093000_show_stripe_subscription_in_tok_invoice_document.sql");
  const dialog = read("src/components/invoices/TokPayableInvoiceDialog.tsx");
  const admin = read("src/pages/admin/adminComptaShared.ts");
  const restaurant = read("src/pages/dashboard/dashboardFacturesShared.ts");
  const adminList = read("src/pages/admin/AdminComptaInflow.tsx");
  const restaurantList = read("src/pages/dashboard/DashboardFacturesOutflow.tsx");
  const invoiceModel = read("src/lib/payableInvoice.ts");

  it("displays the same invoice type on restaurant and admin accounting surfaces", () => {
    expect(isPayableInvoiceType("subscription")).toBe(true);
    expect(isPayableInvoiceType("payable")).toBe(true);
    expect(isPayableInvoiceType("payout")).toBe(false);
    expect(admin).toContain('["payable", "reservation_fees", "subscription"]');
    expect(restaurant).toContain('invoice.invoice_type === "subscription"');
    expect(dialog).toContain('invoice.invoice_type === "payable" || invoice.invoice_type === "subscription"');
    expect(dialog).toContain('supabase.rpc("get_payable_invoice_lines"');
    expect(sql).toContain("NOT IN ('payable', 'subscription')");
    expect(sql).toContain("public.auth_owns_restaurant(v_invoice.restaurant_id)");
    expect(sql).toContain("public.auth_is_admin()");
    expect(sql).toContain("FROM PUBLIC, anon");
  });

  it("prints the canonical paid restaurant subscription invoice with TOK graphics, correct VAT and number", () => {
    const invoice = {
      id: "cd35d510-48bd-479a-a1e8-501dac1cbad1",
      restaurant_id: "ac197b4c-3a47-4fc8-bf66-414ee23f1c8b",
      invoice_type: "subscription" as const,
      invoice_number: "TOK-SUB-example",
      period_start: "2026-10-14",
      period_end: "2026-11-13",
      amount_ht: 63.83,
      amount_tva: 5.17,
      amount_ttc: 69,
      status: "paid",
      due_at: "2026-10-14T10:00:00.000Z",
      paid_at: "2026-10-14T10:00:00.000Z",
      created_at: "2026-10-14T10:00:00.000Z",
      pdf_url: null,
    };
    const result = buildPayableInvoiceDocumentData({
      invoice,
      lines: [{
        lineId: "line-test",
        itemKind: "restaurant_subscription",
        sourceTable: "signup_applications",
        sourceId: "signup-test",
        sourceLabel: "TOK Starter",
        occurredAt: invoice.created_at,
        quantity: 1,
        unitAmount: 69,
        baseAmount: 69,
        rateLabel: null,
        rateValue: null,
        amountHt: 63.83,
        amountTva: 5.17,
        amountTtc: 69,
        metadata: {},
      }],
      restaurant: { name: "La Gazelle d’Or", legal_name: null, address: "Genève", city: "Genève", phone: null },
      settings: null,
    });
    expect(result.invoice.invoice_number).toBe("TOK-SUB-example");
    expect(result.totalTtc).toBe(69);
    expect(result.totalHt).toBe(63.83);
    expect(result.totalTva).toBe(5.17);
    expect(result.groups[0]?.kind).toBe("restaurant_subscription");
    expect(result.groups[0]?.amountTtc).toBe(69);
    expect(result.logoUrl).toBeTruthy();
    expect(result.sender.website).toBe("www.thetok.ch");
    expect(result.sender.name).toBe("NEW DOG'S SERVICES Sàrl");
    expect(result.sender.addressLine1).toBe("Rue de Genève 6");
    expect(result.sender.enterpriseId).toBe("CHE-109.513.890");
    expect(result.sender.vatNumber).toBe("CHE-109.513.890 TVA");
    const pdf = read("src/components/invoices/TokPayableInvoiceDocument.tsx");
    expect(pdf).toContain("N° TVA : {data.sender.vatNumber}");
    expect(pdf).toContain("lg:grid-cols-[240px_minmax(0,1fr)_280px]");
    expect(pdf).toContain("block w-full min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]");
    expect(pdf).toContain("min-w-0 max-w-full whitespace-normal break-words font-semibold leading-snug text-slate-950");
    expect(pdf).toContain("shrink-0 whitespace-nowrap");
    expect(pdf).not.toContain("<p>TVA {data.sender.vatNumber}</p>");
    expect(invoiceModel).not.toContain("CHE-123.456.789");
    expect(invoiceModel).not.toContain("facturation@tok.app");
  });

  it("leaves subscription invoice payment status authoritative to Stripe, not manual UI", () => {
    expect(adminList).toContain('invoice.invoice_type !== "subscription"');
    expect(restaurantList).toContain('invoice.invoice_type !== "subscription"');
    expect(sql).not.toContain("CREATE TABLE");
    expect(sql).not.toContain("INSERT INTO");
    expect(sql).not.toContain("UPDATE public.restaurant_invoices");
  });
});
