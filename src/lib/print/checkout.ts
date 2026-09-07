import { invokeSupabaseFunction } from "@/lib/session";

export const PRINT_PAYMENT_ATTEMPT_SCOPE = "marketing-print-order";

export type PrintCheckoutResult = {
  orderId: string;
  paymentAttemptId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
};

export async function createPrintCheckout(input: {
  restaurantId: string;
  quoteId: string;
  paymentAttemptId: string;
  shippingAddress: Record<string, string | null | undefined>;
  returnUrl: string;
}) {
  const { data, error } = await invokeSupabaseFunction<PrintCheckoutResult>("print-checkout", {
    body: input,
  });
  if (error) throw error;
  if (!data?.checkoutUrl) throw new Error("Paiement impression indisponible.");
  return data;
}
