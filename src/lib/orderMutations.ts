import { getSupabase } from "@/integrations/supabase/client";

type SafeOrderMutationRow = {
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

export type OrderMutationResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
};

const getFirstRow = <T>(data: T[] | T | null | undefined): T | null => {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

export async function cancelOrderByCustomer(
  orderId: string,
): Promise<OrderMutationResult> {
  const { data, error } = await (getSupabase().rpc as any)("cancel_order_by_customer", {
    p_order_id: orderId,
  });

  if (error) throw error;

  const result = getFirstRow<SafeOrderMutationRow>(data);
  if (!result) {
    throw new Error("Réponse serveur invalide.");
  }

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Annulation impossible.",
    };
  }

  return { ok: true };
}
