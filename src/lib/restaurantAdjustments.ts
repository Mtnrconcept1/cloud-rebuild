import { invokeSupabaseFunction } from "@/lib/session";

export type RestaurantAdjustmentReason =
  | "subscription_issue"
  | "duplicate_topup"
  | "commission_overpayment"
  | "billing_error"
  | "commercial_gesture"
  | "other";

export const RESTAURANT_ADJUSTMENT_REASONS: Array<{ value: RestaurantAdjustmentReason; label: string }> = [
  { value: "subscription_issue", label: "Problème d’abonnement" },
  { value: "duplicate_topup", label: "Recharge facturée à double" },
  { value: "commission_overpayment", label: "Commission payée en trop" },
  { value: "billing_error", label: "Erreur de facturation" },
  { value: "commercial_gesture", label: "Geste commercial" },
  { value: "other", label: "Autre correction" },
];

type AdjustmentResponse = {
  ok?: boolean;
  error?: string;
  adjustment_id?: string;
  stripe_transfer_id?: string;
  status?: string;
};

export async function createRestaurantStripeAdjustment(input: {
  restaurantId: string;
  amountChf: number;
  reasonCode: RestaurantAdjustmentReason;
  reasonDetails: string;
  idempotencyKey: string;
}) {
  const { data, error } = await invokeSupabaseFunction<AdjustmentResponse>("admin-restaurant-adjustment", {
    body: {
      restaurant_id: input.restaurantId,
      amount_chf: input.amountChf,
      reason_code: input.reasonCode,
      reason_details: input.reasonDetails,
      idempotency_key: input.idempotencyKey,
    },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Le versement Stripe n’a pas abouti.");
  return data;
}
