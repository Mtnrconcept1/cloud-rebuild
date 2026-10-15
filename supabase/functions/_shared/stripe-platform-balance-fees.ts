/**
 * Stripe platform balance debits that do not belong to an individual charge.
 * Never include charge.balance_transaction.fee here: it is already booked by
 * record_stripe_tax_fee_ledger and would double-count processing expenses.
 */
export const TOK_PLATFORM_STRIPE_ACCOUNT_ID = "acct_1SHGJ2GTQigE34su";

export type StripeStandaloneBalanceDebit = {
  id: string;
  type: string;
  reporting_category: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
};

export type PlatformBalanceDebitJournal = {
  balanceTransactionId: string;
  sourceType: "stripe_fee" | "contribution";
  reportingCategory: "fee" | "contribution";
  expenseAccount: "stripe_platform_fee_expense" | "stripe_climate_contribution_expense";
  sourceAmountCents: number;
  feeCents: number;
  netCents: number;
  expenseCents: number;
  effectiveAt: string;
};

export function classifyPlatformBalanceDebit(
  transaction: StripeStandaloneBalanceDebit,
): PlatformBalanceDebitJournal | null {
  if (transaction.type !== "stripe_fee" && transaction.type !== "contribution") return null;

  const expectedCategory = transaction.type === "stripe_fee" ? "fee" : "contribution";
  if (
    !/^txn_[a-zA-Z0-9]+$/.test(transaction.id) ||
    transaction.reporting_category !== expectedCategory ||
    transaction.currency !== "chf" ||
    !Number.isSafeInteger(transaction.amount) ||
    !Number.isSafeInteger(transaction.fee) ||
    !Number.isSafeInteger(transaction.net) ||
    !Number.isSafeInteger(transaction.created) ||
    transaction.created <= 0 ||
    transaction.created > Math.floor(Date.now() / 1000) + 3600 ||
    transaction.amount > 0 ||
    transaction.fee < 0 ||
    transaction.net >= 0 ||
    transaction.net !== transaction.amount - transaction.fee
  ) {
    throw new Error("STRIPE_PLATFORM_BALANCE_DEBIT_INVALID");
  }

  return {
    balanceTransactionId: transaction.id,
    sourceType: transaction.type,
    reportingCategory: expectedCategory,
    expenseAccount: transaction.type === "stripe_fee"
      ? "stripe_platform_fee_expense"
      : "stripe_climate_contribution_expense",
    sourceAmountCents: transaction.amount,
    feeCents: transaction.fee,
    netCents: transaction.net,
    // Stripe deducted the amount AND its fee. The ledger must match net,
    // not record -amount and -net as two different platform expenses.
    expenseCents: -transaction.net,
    effectiveAt: new Date(transaction.created * 1000).toISOString(),
  };
}

type StripeBalancePage = {
  data: StripeStandaloneBalanceDebit[];
  has_more: boolean;
};

type BalanceListing = {
  balanceTransactions: {
    list: (input: {
      limit: number;
      type: "stripe_fee" | "contribution";
      created: { gte: number; lt: number };
      starting_after?: string;
    }) => Promise<StripeBalancePage>;
  };
};

type LedgerClient = {
  rpc: (functionName: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export async function reconcilePlatformBalanceDebits(input: {
  stripe: BalanceListing;
  adminClient: LedgerClient;
  verifiedAccountId: string;
  days?: number;
  now?: number;
}) {
  if (input.verifiedAccountId !== TOK_PLATFORM_STRIPE_ACCOUNT_ID) {
    throw new Error("STRIPE_PLATFORM_ACCOUNT_MISMATCH");
  }
  const days = input.days ?? 30;
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new Error("STRIPE_PLATFORM_AUDIT_WINDOW_INVALID");
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const cutoff = now - 3600; // Do not race asynchronous Stripe reconciliation.
  const created = { gte: cutoff - days * 86400, lt: cutoff };
  let examined = 0;
  let booked = 0;
  let alreadyRecorded = 0;

  for (const type of ["stripe_fee", "contribution"] as const) {
    let cursor: string | undefined;
    let finished = false;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const page = await input.stripe.balanceTransactions.list({
        limit: 100,
        type,
        created,
        ...(cursor ? { starting_after: cursor } : {}),
      });
      if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") {
        throw new Error("STRIPE_PLATFORM_BALANCE_PAGE_INVALID");
      }
      if (page.data.length > 100 || (page.has_more && page.data.length === 0)) {
        throw new Error("STRIPE_PLATFORM_BALANCE_PAGINATION_INVALID");
      }
      for (const transaction of page.data) {
        if (transaction.type !== type) throw new Error("STRIPE_PLATFORM_BALANCE_TYPE_MISMATCH");
        const journal = classifyPlatformBalanceDebit(transaction);
        if (!journal) continue;
        examined++;
        const { data, error } = await input.adminClient.rpc("record_stripe_platform_balance_debit", {
          p_stripe_balance_transaction_id: journal.balanceTransactionId,
          p_stripe_account_id: input.verifiedAccountId,
          p_balance_type: journal.sourceType,
          p_reporting_category: journal.reportingCategory,
          p_amount_cents: journal.sourceAmountCents,
          p_fee_cents: journal.feeCents,
          p_net_cents: journal.netCents,
          p_currency: "CHF",
          p_effective_at: journal.effectiveAt,
        });
        if (error) throw new Error("STRIPE_PLATFORM_BALANCE_LEDGER_FAILED: " + error.message);
        if (data === true) booked++;
        else if (data === false) alreadyRecorded++;
        else throw new Error("STRIPE_PLATFORM_BALANCE_LEDGER_RESPONSE_INVALID");
      }
      if (!page.has_more) {
        finished = true;
        break;
      }
      const nextCursor = page.data[page.data.length - 1]?.id;
      if (!nextCursor || nextCursor === cursor) {
        throw new Error("STRIPE_PLATFORM_BALANCE_CURSOR_INVALID");
      }
      cursor = nextCursor;
    }
    if (!finished) throw new Error("STRIPE_PLATFORM_BALANCE_PAGINATION_LIMIT");
  }

  return { examined, booked, alreadyRecorded, windowDays: days };
}
