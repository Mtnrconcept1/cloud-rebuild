import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(match, `No migration contains ${pattern}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, match || ""), "utf8");
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

  it("marks confirmed cash orders as paid so TOK payable commission invoices can bill them", () => {
    const validateOrder = read("supabase/functions/validate-order/index.ts");
    const migration = latestMigrationContaining(/Cash orders are paid directly to the restaurant/);

    expect(validateOrder).toContain('paymentMethod === "cash" ? "paid"');
    expect(migration).toContain("UPDATE public.orders o");
    expect(migration).toContain("SET payment_status = 'paid'");
    expect(migration).toContain("lower(COALESCE(o.metadata ->> 'payment_method', '')) IN ('cash', 'especes', 'cash_on_delivery', 'on_site', 'onsite')");
    expect(migration).toContain("lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'payment_failed', 'refused', 'pending', 'pending_payment')");
    expect(migration).toContain("COALESCE(o.total_amount, 0) > 0");
  });
});
