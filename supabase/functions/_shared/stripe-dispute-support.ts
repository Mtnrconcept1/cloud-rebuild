/**
 * Stripe dispute → support incident mapping.
 * UUIDv8 deterministically identifies one support case per Stripe dispute.
 * This identifier is not an authentication token or a substitute for webhook signature verification.
 */
export async function stripeDisputeSupportId(disputeId: string): Promise<string> {
  if (!/^dp_[A-Za-z0-9]+$/.test(disputeId)) {
    throw new Error("INVALID_STRIPE_DISPUTE_ID");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`tok:stripe-dispute-support:v1:${disputeId}`),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // RFC 9562 UUIDv8 (custom)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stripeDisputeSupportRow(input: {
  id: string;
  orderId: string;
  userId: string | null;
  restaurantId: string;
  disputeId: string;
  paymentIntentId: string;
  stripeEventId: string;
  stripeStatus: string;
  stripeReason: string | null;
  amountCents: number;
  currency: string;
}) {
  return {
    id: input.id,
    user_id: input.userId,
    restaurant_id: input.restaurantId,
    order_id: input.orderId,
    category: "payment_issue",
    priority: "urgent",
    status: "waiting_admin",
    subject: "Contestation bancaire Stripe à examiner",
    description: "Contestation de paiement à instruire. Vérifier les preuves et les délais dans Stripe avant toute décision.",
    metadata: {
      source: "stripe-dispute",
      stripe_dispute_id: input.disputeId,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_event_id: input.stripeEventId,
      stripe_dispute_status_at_opening: input.stripeStatus,
      stripe_dispute_reason: input.stripeReason,
      amount_cents: input.amountCents,
      currency: input.currency.toUpperCase(),
      financial_action_authorized: false,
    },
  };
}
