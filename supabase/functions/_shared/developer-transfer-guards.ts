/** A safe, non-5xx rejection that must never result in a Stripe transfer. */
export class DeveloperTransferGuardError extends Error {
  readonly status = 409;
  constructor(code: string) {
    super(code);
    this.name = "DeveloperTransferGuardError";
  }
}

const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]+$/;
const STRIPE_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Never treat missing capability or KYC data as proof that transfers work. */
export function assertDeveloperConnectAccountReady(
  value: unknown,
  destinationAccountId: string,
): void {
  const account = object(value);
  const requirements = object(account?.requirements);
  const capabilities = object(account?.capabilities);
  if (account?.deleted === true) {
    throw new DeveloperTransferGuardError("DEVELOPER_CONNECT_ACCOUNT_DELETED");
  }

  if (
    !ACCOUNT_ID_PATTERN.test(destinationAccountId)
    || account?.id !== destinationAccountId
    || account?.details_submitted !== true
    || account?.payouts_enabled !== true
    || capabilities?.transfers !== "active"
    || !Array.isArray(requirements?.currently_due)
    || requirements.currently_due.length !== 0
    || Boolean(requirements.disabled_reason)
  ) {
    throw new DeveloperTransferGuardError("DEVELOPER_CONNECT_ACCOUNT_NOT_READY");
  }
}

export type DeveloperTransferExpected = {
  destinationAccountId: string;
  stripeMode: "test" | "live";
  amountCents: number;
  currency: string;
  idempotencyKey: string;
};

/**
 * Stripe only guarantees idempotency-key retention for at least 24 hours.
 * A retry after 23 hours could create a second transfer if the first request
 * succeeded but its response was lost. Stop it for manual reconciliation.
 */
export function assertDeveloperTransferRetrySafe(
  rawRecord: unknown,
  expected: DeveloperTransferExpected,
  nowMs = Date.now(),
): void {
  const record = object(rawRecord);
  const attempts = Number(record?.attempt_count);
  const timestamp = Date.parse(String(record?.created_at || ""));
  const elapsed = nowMs - timestamp;

  if (
    !record
    || !Number.isInteger(attempts) || attempts < 1
    || !Number.isFinite(timestamp) || elapsed < -5 * 60 * 1000
    || record.destination_account_id !== expected.destinationAccountId
    || record.stripe_mode !== expected.stripeMode
    || record.amount_cents !== expected.amountCents
    || record.currency !== expected.currency
    || record.idempotency_key !== expected.idempotencyKey
  ) {
    throw new DeveloperTransferGuardError("DEVELOPER_TRANSFER_SNAPSHOT_MISMATCH");
  }

  // An existing Stripe transfer ID must be reconciled, never duplicated.
  if (record.stripe_transfer_id) {
    throw new DeveloperTransferGuardError("DEVELOPER_TRANSFER_REQUIRES_MANUAL_RECONCILIATION");
  }
  if (attempts > 1 && elapsed >= STRIPE_IDEMPOTENCY_SAFETY_WINDOW_MS) {
    throw new DeveloperTransferGuardError("DEVELOPER_TRANSFER_REQUIRES_MANUAL_RECONCILIATION");
  }
}
