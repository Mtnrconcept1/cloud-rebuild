import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyPlatformBalanceDebit,
  reconcilePlatformBalanceDebits,
  TOK_PLATFORM_STRIPE_ACCOUNT_ID,
} from "../../supabase/functions/_shared/stripe-platform-balance-fees";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const created = Math.floor(Date.UTC(2026, 9, 14, 4, 49, 22) / 1000);
const now = Math.floor(Date.UTC(2026, 9, 15, 8, 0, 0) / 1000);
const climate = {
  id: "txn_climate2026",
  type: "contribution",
  reporting_category: "contribution",
  amount: -34,
  fee: 0,
  net: -34,
  currency: "chf",
  created,
};
const billing = {
  id: "txn_billing2026",
  type: "stripe_fee",
  reporting_category: "fee",
  amount: -48,
  fee: 4,
  net: -52,
  currency: "chf",
  created,
};

describe("Stripe platform balance-fee reconciliation", () => {
  it("recognizes the CHF 0.34 Climate balance debit separately from processing fees", () => {
    const journal = classifyPlatformBalanceDebit(climate);
    expect(journal?.expenseCents).toBe(34);
    expect(journal?.expenseAccount).toBe("stripe_climate_contribution_expense");
    expect(journal?.netCents).toBe(-34);
  });

  it("books CHF 0.52 Billing fee only once, including the extra 4 cents", () => {
    const journal = classifyPlatformBalanceDebit(billing);
    expect(journal?.sourceAmountCents).toBe(-48);
    expect(journal?.feeCents).toBe(4);
    expect(journal?.netCents).toBe(-52);
    expect(journal?.expenseCents).toBe(52);
    expect(journal?.expenseAccount).toBe("stripe_platform_fee_expense");
  });

  it("never books charge fees already handled by the invoice or checkout webhook", () => {
    expect(classifyPlatformBalanceDebit({
      ...billing, type: "charge", reporting_category: "charge", amount: 6900, fee: 230, net: 6670,
    })).toBeNull();
  });

  it("rejects malformed, unsupported or tampered standalone debits", () => {
    expect(() => classifyPlatformBalanceDebit({ ...billing, currency: "eur" })).toThrow(/INVALID/);
    expect(() => classifyPlatformBalanceDebit({ ...billing, fee: 12, net: -52 })).toThrow(/INVALID/);
    expect(() => classifyPlatformBalanceDebit({ ...billing, net: 48, amount: 48, fee: 0 })).toThrow(/INVALID/);
    expect(() => classifyPlatformBalanceDebit({ ...climate, reporting_category: "charge" })).toThrow(/INVALID/);
    expect(() => classifyPlatformBalanceDebit({ ...billing, id: "bad" })).toThrow(/INVALID/);
  });

  it("fails closed when worker points to another Stripe account", async () => {
    await expect(reconcilePlatformBalanceDebits({
      stripe: { balanceTransactions: { list: async () => { throw new Error("should not be called"); } } },
      adminClient: { rpc: async () => { throw new Error("should not be called"); } },
      verifiedAccountId: "acct_other",
      now,
    })).rejects.toThrow(/ACCOUNT_MISMATCH/);
  });

  it("visits separate fee categories and calls only the server-authorized ledger RPC", async () => {
    const posted: Array<{ name: string; params: Record<string, unknown> }> = [];
    const reconciled = await reconcilePlatformBalanceDebits({
      stripe: {
        balanceTransactions: {
          list: async ({ type }) => ({
            data: type === "stripe_fee" ? [billing] : [climate],
            has_more: false,
          }),
        },
      },
      adminClient: {
        rpc: async (name, params) => {
          posted.push({ name, params });
          return { data: true, error: null };
        },
      },
      verifiedAccountId: TOK_PLATFORM_STRIPE_ACCOUNT_ID,
      now,
    });
    expect(reconciled).toMatchObject({ examined: 2, booked: 2, alreadyRecorded: 0 });
    expect(posted.map((call) => call.name)).toEqual([
      "record_stripe_platform_balance_debit",
      "record_stripe_platform_balance_debit",
    ]);
    expect(posted.map((call) => call.params.p_net_cents)).toEqual([-52, -34]);
    expect(posted.every((call) => call.params.p_stripe_account_id === TOK_PLATFORM_STRIPE_ACCOUNT_ID)).toBe(true);
  });

  it("recognizes idempotent replays and refuses incomplete pagination or a failed RPC", async () => {
    const existing = await reconcilePlatformBalanceDebits({
      stripe: { balanceTransactions: { list: async ({ type }) => ({
        data: type === "stripe_fee" ? [billing] : [climate], has_more: false,
      }) } },
      adminClient: { rpc: async () => ({ data: false, error: null }) },
      verifiedAccountId: TOK_PLATFORM_STRIPE_ACCOUNT_ID,
      now,
    });
    expect(existing).toMatchObject({ booked: 0, alreadyRecorded: 2 });

    await expect(reconcilePlatformBalanceDebits({
      stripe: { balanceTransactions: { list: async () => ({ data: [], has_more: true }) } },
      adminClient: { rpc: async () => ({ data: true, error: null }) },
      verifiedAccountId: TOK_PLATFORM_STRIPE_ACCOUNT_ID,
      now,
    })).rejects.toThrow(/PAGINATION_INVALID/);

    await expect(reconcilePlatformBalanceDebits({
      stripe: { balanceTransactions: { list: async ({ type }) => ({
        data: type === "stripe_fee" ? [billing] : [], has_more: false,
      }) } },
      adminClient: { rpc: async () => ({ data: null, error: { message: "Database unavailable" } }) },
      verifiedAccountId: TOK_PLATFORM_STRIPE_ACCOUNT_ID,
      now,
    })).rejects.toThrow(/LEDGER_FAILED/);
  });

  it("limits access, uses append-only double-entry, and includes the costs in admin reports", () => {
    const migration = read("supabase/migrations/20261015072500_stripe_platform_balance_debits.sql");
    const schedule = read("supabase/migrations/20261015073000_schedule_stripe_balance_fees.sql");
    const worker = read("supabase/functions/stripe-worker/index.ts");
    const cleanup = read("supabase/migrations/20261015073500_expire_failed_free_zero_attente_attempts.sql");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.record_stripe_platform_balance_debit");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("stripe_platform_balance_idempotency_conflict");
    expect(migration).toContain("'payment_asset', 'credit'");
    expect(migration).toContain("platform_cost_entries");
    expect(migration).toContain("ux_platform_cost_entries_stripe_balance_transaction");
    expect(schedule).toContain("vault.decrypted_secrets");
    expect(schedule).toContain("tok-stripe-platform-balance-fees");
    expect(worker).toContain('if (!actor.isServiceRole)');
    expect(worker).toContain('if (action === "reconcile-platform-fees")');
    expect(worker).toContain("TOK_PLATFORM_STRIPE_ACCOUNT_ID");
    expect(cleanup).toContain("stripe_checkout_session_id IS NULL");
    expect(cleanup).toContain("stripe_payment_intent_id IS NULL");
    expect(cleanup).toContain("last_error_message ILIKE");
  });
});
