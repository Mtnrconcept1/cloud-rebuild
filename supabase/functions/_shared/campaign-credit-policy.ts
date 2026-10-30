/** Campaigns may only spend credits that the ledger marks as advertising-eligible.
 * Promotional and preactivation AI credits are deliberately excluded. */
export const TOK_CREDITS_PER_CAMPAIGN_CHF = 15;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function nonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

/** The same campaign_spendable_balance field is enforced by database triggers.
 * When that field is present, tok_credits.balance is NOT a spendable fallback. */
export function getCampaignSpendableChf(usage: unknown): number {
  const credits = record(usage)?.credits;
  const rows = Array.isArray(credits) ? credits.map(record).filter(
    (entry): entry is Record<string, unknown> => entry !== null,
  ) : [];

  const tokCredit = rows.find((entry) => entry.kind === "tok_credits");
  if (tokCredit) {
    const metadata = record(tokCredit.metadata);
    const hasCampaignPolicy = metadata
      && Object.prototype.hasOwnProperty.call(metadata, "campaign_spendable_balance");
    const spendableCredits = hasCampaignPolicy
      ? metadata.campaign_spendable_balance
      : metadata?.preactivation === true ? 0 : tokCredit.balance;
    return nonNegative(spendableCredits) / TOK_CREDITS_PER_CAMPAIGN_CHF;
  }

  const campaignCredit = rows.find((entry) => entry.kind === "campaign");
  return nonNegative(campaignCredit?.balance);
}

/** Reusing a paid campaign must include every budget field checked by the
 * database trigger, so an unchanged already-funded campaign stays editable. */
export function getCreditCommittedAmount(campaign: unknown): number {
  const entry = record(campaign);
  if (!entry || String(entry.payment_method || "").toLowerCase() !== "credits"
    || String(entry.payment_status || "").toLowerCase() !== "paid") return 0;

  return Math.max(
    nonNegative(entry.total_budget),
    nonNegative(entry.spent),
    nonNegative(entry.paid_amount),
  );
}

/** Only the known insufficient-credit trigger is translated into a 402.
 * All other PostgREST errors remain errors and are never treated as paid. */
export function isCampaignCreditExhausted(error: unknown): boolean {
  const message = record(error)?.message;
  return typeof message === "string" && message.includes("TOK credits exhausted");
}
