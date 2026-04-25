import { invokeSupabaseFunction, invokeSupabaseRpc } from "@/lib/session";
import type { CancellationReasonCode } from "@/lib/reservationMutations";

type SafeMutationRow = {
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

type ProcessRefundResponse = {
  ok?: boolean;
  error?: string;
  target_type?: string;
  target_id?: string;
  refund_amount_chf?: number;
  remaining_amount_chf?: number;
  stripe_refund_id?: string | null;
  refund_status?: string | null;
};

export type RefundTargetType = "order" | "reservation";

export type MutationResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type ProcessRefundResult = MutationResult & {
  targetType?: RefundTargetType;
  targetId?: string;
  refundAmountChf?: number;
  remainingAmountChf?: number;
  stripeRefundId?: string | null;
  refundStatus?: string | null;
};

export type RefundQueueItem = {
  target_type: RefundTargetType;
  target_id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  customer_user_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  reference: string | null;
  item_label: string | null;
  feature: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  refund_status: string | null;
  refund_initiated_by: string | null;
  refund_reason: string | null;
  total_amount_chf: number | string | null;
  refunded_amount_chf: number | string | null;
  remaining_amount_chf: number | string | null;
  payment_status: string | null;
  payment_method: string | null;
};

const getFirstRow = <T>(data: T[] | T | null | undefined): T | null => {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

async function parseMutationResponse(promise: Promise<unknown>): Promise<MutationResult> {
  const data = await promise;
  const result = getFirstRow<SafeMutationRow>(data as SafeMutationRow[] | SafeMutationRow | null | undefined);

  if (!result) {
    throw new Error("Reponse serveur invalide.");
  }

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Operation impossible.",
    };
  }

  return { ok: true };
}

export async function cancelOrderByRestaurant(
  orderId: string,
  reasonCode: CancellationReasonCode,
  reasonDetails: string | null,
): Promise<MutationResult> {
  return parseMutationResponse(invokeSupabaseRpc("cancel_order_by_restaurant", {
    body: {
      p_order_id: orderId,
      p_reason_code: reasonCode,
      p_reason_details: reasonDetails,
    },
  }));
}

export async function markRefundApplied(input: {
  targetType: RefundTargetType;
  targetId: string;
  amountChf?: number | null;
  reason?: string | null;
}): Promise<MutationResult> {
  return parseMutationResponse(invokeSupabaseRpc("mark_refund_applied", {
    body: {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_actor: "admin",
      p_reason: input.reason ?? null,
      p_amount_chf: input.amountChf ?? null,
      p_stripe_refund_id: null,
    },
  }));
}

export async function processRefund(input: {
  targetType: RefundTargetType;
  targetId: string;
  reason?: string | null;
  amountChf?: number | null;
}): Promise<ProcessRefundResult> {
  const { data, error } = await invokeSupabaseFunction<ProcessRefundResponse>("process-refund", {
    body: {
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason ?? null,
      amount_chf: input.amountChf ?? null,
    },
  });

  if (error) {
    return {
      ok: false,
      errorMessage: error.message,
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      errorMessage: data?.error || "Remboursement impossible.",
    };
  }

  return {
    ok: true,
    targetType: data.target_type === "reservation" ? "reservation" : "order",
    targetId: data.target_id,
    refundAmountChf: data.refund_amount_chf,
    remainingAmountChf: data.remaining_amount_chf,
    stripeRefundId: data.stripe_refund_id ?? null,
    refundStatus: data.refund_status ?? null,
  };
}

export async function fetchAdminRefundQueue() {
  const data = await invokeSupabaseRpc<RefundQueueItem[]>("admin_get_refund_queue");
  return data || [];
}

export function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getRemainingRefundAmount(totalAmount: number | string | null | undefined, refundedAmount: number | string | null | undefined) {
  return Math.max(0, toAmount(totalAmount) - toAmount(refundedAmount));
}
