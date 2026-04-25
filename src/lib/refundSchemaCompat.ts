type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type RefundCompatFields = {
  refunded_amount_chf: number | string | null;
  refund_status: string | null;
  refunded_at: string | null;
};

function getErrorText(error: PostgrestLikeError) {
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

export function isRefundColumnsMissingError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgrestError = error as PostgrestLikeError;
  return postgrestError.code === "42703"
    && /(refunded_amount_chf|refund_status|refunded_at)/i.test(getErrorText(postgrestError));
}

export function withDefaultRefundFields<T extends Record<string, unknown>>(rows: readonly T[]) {
  return rows.map((row) => ({
    ...row,
    refunded_amount_chf: row.refunded_amount_chf ?? null,
    refund_status: typeof row.refund_status === "string" ? row.refund_status : null,
    refunded_at: typeof row.refunded_at === "string" ? row.refunded_at : null,
  })) as Array<T & RefundCompatFields>;
}
