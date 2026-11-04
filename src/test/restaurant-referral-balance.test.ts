import { describe, expect, it, vi } from "vitest";
import {
  findExistingCredit,
  type ReferralBalanceTransaction,
} from "../../supabase/functions/_shared/restaurant-referral-balance";

const credit = (
  id: string,
  referralId: string,
  amount = -12900,
  currency = "chf",
): ReferralBalanceTransaction => ({
  id,
  amount,
  currency,
  metadata: { tok_restaurant_referral_id: referralId },
});

describe("restaurant referral Stripe balance reconciliation", () => {
  it("returns null only when the complete Stripe history contains no matching credit", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [credit("cbt_other", "other-referral")],
      has_more: false,
    });

    await expect(findExistingCredit(list, "referral-1", 12900)).resolves.toBeNull();
    expect(list).toHaveBeenCalledExactlyOnceWith({ limit: 100 });
  });

  it("detects an already issued credit across pages and never treats it as new", async () => {
    const existing = credit("cbt_existing", "referral-1");
    const list = vi.fn()
      .mockResolvedValueOnce({
        data: [credit("cbt_first", "other-referral")],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [existing], has_more: false });

    await expect(findExistingCredit(list, "referral-1", 12900)).resolves.toEqual(existing);
    expect(list).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(list).toHaveBeenNthCalledWith(2, {
      limit: 100,
      starting_after: "cbt_first",
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["amount", -6900, "chf"],
    ["currency", -12900, "eur"],
  ])("refuses an existing referral credit with mismatched %s", async (_field, amount, currency) => {
    const list = vi.fn().mockResolvedValue({
      data: [credit("cbt_bad", "referral-1", amount, currency)],
      has_more: false,
    });

    await expect(findExistingCredit(list, "referral-1", 12900))
      .rejects.toThrow("existing_referral_credit_mismatch");
  });

  it("fails closed on an incomplete paginated history", async () => {
    const list = vi.fn().mockResolvedValue({ data: [], has_more: true });

    await expect(findExistingCredit(list, "referral-1", 12900))
      .rejects.toThrow("stripe_balance_history_incomplete");
  });

  it("fails closed when the history exceeds the maximum pagination depth", async () => {
    let page = 0;
    const list = vi.fn().mockImplementation(async () => {
      page += 1;
      return {
        data: [credit("cbt_" + page, "other-referral")],
        has_more: true,
      };
    });

    await expect(findExistingCredit(list, "referral-1", 12900))
      .rejects.toThrow("stripe_balance_history_limit");
    expect(list).toHaveBeenCalledTimes(40);
  });

  it("propagates Stripe API failures without assuming that no credit exists", async () => {
    const list = vi.fn().mockRejectedValue(new Error("stripe_unavailable"));

    await expect(findExistingCredit(list, "referral-1", 12900))
      .rejects.toThrow("stripe_unavailable");
  });
});
