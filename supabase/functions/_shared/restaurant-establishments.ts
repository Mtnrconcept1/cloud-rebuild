import { HttpError } from "./auth.ts";

// Keep independently billed contracts out of an existing Elite group.
export async function assertIndependentRestaurantContract(adminClient: any, restaurantId: string) {
  const { data, error } = await adminClient.from("restaurant_subscription_establishments")
    .select("subscription_id").eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw new HttpError(503, "Vérification du contrat indisponible");
  if (data) throw new HttpError(409, "Cet établissement dépend d’un contrat Elite. Gérez l’abonnement depuis l’établissement principal.");
}

export function stripeExtraEstablishmentQuantity(subscription: {
  status: string; items?: { data?: Array<{ metadata?: Record<string, string>; quantity?: number | null }> };
}) {
  if (!["active", "trialing"].includes(subscription.status)) return 0;
  return Math.min(17, Math.max(0, (subscription.items?.data || [])
    .filter(item => item.metadata?.tok_establishment_addon === "true")
    .reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity || 0)), 0)));
}
