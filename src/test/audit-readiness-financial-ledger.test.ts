import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260709120000_financial_ledger_and_developer_statements.sql",
  "utf8",
);
const auditPlan = readFileSync("docs/security/audit-readiness-10-10.md", "utf8");

describe("audit 10/10 financial hardening", () => {
  it("creates an append-only ledger with integer money and Stripe traceability", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.financial_ledger");
    expect(migration).toContain("amount_cents integer NOT NULL CHECK (amount_cents > 0)");
    expect(migration).toContain("currency text NOT NULL DEFAULT 'CHF'");
    expect(migration).toContain("stripe_event_id text REFERENCES public.stripe_webhook_events(event_id)");
    expect(migration).toContain("reversal_of uuid REFERENCES public.financial_ledger(entry_id)");
    expect(migration).toContain("prevent_financial_ledger_update_delete");
    expect(migration).toContain("financial_ledger is append-only");
  });

  it("keeps sensitive financial tables behind RLS and service-role writes", () => {
    expect(migration).toContain("ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.developer_statements ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.financial_ledger FROM anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON public.developer_statements FROM anon, authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT ON public.financial_ledger TO service_role");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.developer_statements TO service_role");
    expect(migration).not.toContain("GRANT UPDATE ON public.financial_ledger");
    expect(migration).not.toContain("GRANT DELETE ON public.financial_ledger");
  });

  it("codifies developer revenue-share on Tok-owned revenue only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.developer_statements");
    expect(migration).toContain("developer_share_bps integer NOT NULL DEFAULT 1000");
    expect(migration).toContain("revenue_base_cents integer GENERATED ALWAYS AS");
    expect(migration).toContain("developer_amount_cents integer GENERATED ALWAYS AS");
    expect(auditPlan).toContain("exclut toujours les fonds appartenant aux restaurants");
    expect(auditPlan).toContain("Part developpeur = Revenu Tok * developer_share_bps / 10000");
  });
});
