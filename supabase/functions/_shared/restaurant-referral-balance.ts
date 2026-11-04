// Pure Stripe balance-history check shared by reconciliation and isolated tests.
// A failed or incomplete lookup must stop credit creation: Stripe idempotency keys
// alone are not a guarantee after their retention window.
export type ReferralBalanceTransaction = {
  id: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string> | null;
};

export type ReferralBalancePage<T extends ReferralBalanceTransaction> = {
  data: T[];
  has_more: boolean;
};

export type ListReferralBalances<T extends ReferralBalanceTransaction> = (
  options: { limit: number; starting_after?: string },
) => PromiseLike<ReferralBalancePage<T>>;

export async function findExistingCredit<T extends ReferralBalanceTransaction>(
  listTransactions: ListReferralBalances<T>,
  referralId: string,
  amountCents: number,
): Promise<T | null> {
  let startingAfter: string | undefined;
  for (let page = 0; page < 40; page += 1) {
    const history = await listTransactions({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const found = history.data.find((transaction) =>
      transaction.metadata?.tok_restaurant_referral_id === referralId
    );
    if (found) {
      if (found.amount !== -amountCents || found.currency !== "chf") {
        throw new Error("existing_referral_credit_mismatch");
      }
      return found;
    }
    if (!history.has_more) return null;
    const last = history.data[history.data.length - 1];
    if (!last) throw new Error("stripe_balance_history_incomplete");
    startingAfter = last.id;
  }
  throw new Error("stripe_balance_history_limit");
}
