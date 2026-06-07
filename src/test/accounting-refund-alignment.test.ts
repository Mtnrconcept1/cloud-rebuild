import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("accounting refund alignment guards", () => {
  it("keeps SQL invoice generation on the same net base as frontend ledgers", () => {
    const sql = read("supabase/migrations/20260607150000_accounting_refund_aligned_invoice_calculations.sql");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.generate_tok_payable_invoice");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_payout_invoice_lines");
    expect(sql).toMatch(/COALESCE\(o\.total_amount,\s*0\)[\s\S]*- COALESCE\(o\.refunded_amount_chf,\s*0\)/);
    expect(sql).toContain("(o.metadata ->> 'points_discount')::numeric");
    expect(sql).toMatch(/COALESCE\(r\.total_amount,\s*0\) - COALESCE\(r\.refunded_amount_chf,\s*0\)/);
    expect(sql).toContain("ROUND(a.net_amount * 0.10, 2)");
    expect(sql).toContain("ROUND(a.net_amount * 0.90, 2)");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM authenticated");
  });

  it("labels payout detail amounts as the net base after refund adjustments", () => {
    const table = read("src/components/invoices/InvoiceLineTable.tsx");

    expect(table).toContain('AmountDetail label="Base nette"');
    expect(table).not.toContain('AmountDetail label="Montant brut"');
  });
});
