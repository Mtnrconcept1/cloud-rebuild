export type PaymentMethodId =
  | "card"
  | "twint"
  | "postfinance_card"
  | "postfinance_efinance"
  | "cash";

export const ALL_PAYMENT_METHODS: PaymentMethodId[] = [
  "card",
  "twint",
  "postfinance_card",
  "postfinance_efinance",
  "cash",
];

export const PAYMENT_METHOD_FEATURE_MAP: Record<PaymentMethodId, string> = {
  card: "payment-card",
  twint: "payment-twint",
  postfinance_card: "payment-postfinance-card",
  postfinance_efinance: "payment-postfinance-efinance",
  cash: "payment-cash",
};

const STRIPE_CHECKOUT_UNSUPPORTED_METHODS = new Set<PaymentMethodId>([
  "postfinance_card",
  "postfinance_efinance",
]);

function filterCheckoutCompatibleMethods(methods: PaymentMethodId[]): PaymentMethodId[] {
  return methods.filter((method) => !STRIPE_CHECKOUT_UNSUPPORTED_METHODS.has(method));
}

export function getGloballyEnabledPaymentMethods(activeFeatures: Set<string>): PaymentMethodId[] {
  return ALL_PAYMENT_METHODS.filter((method) => activeFeatures.has(PAYMENT_METHOD_FEATURE_MAP[method]));
}

export function getAllowedPaymentMethods(
  activeFeatures: Set<string>,
  disabledPaymentMethods: string[] | null | undefined = [],
): PaymentMethodId[] {
  const globallyEnabled = getGloballyEnabledPaymentMethods(activeFeatures);
  const disabled = new Set((disabledPaymentMethods || []).map((method) => String(method)));
  return filterCheckoutCompatibleMethods(globallyEnabled.filter((method) => !disabled.has(method)));
}

export function getFirstAvailablePaymentMethod(
  activeFeatures: Set<string>,
  disabledPaymentMethods: string[] | null | undefined = [],
  fallback: PaymentMethodId = "card",
): PaymentMethodId | null {
  const allowed = getAllowedPaymentMethods(activeFeatures, disabledPaymentMethods);
  if (allowed.length > 0) return allowed[0];

  const globallyEnabled = filterCheckoutCompatibleMethods(getGloballyEnabledPaymentMethods(activeFeatures));
  if (globallyEnabled.length > 0) return globallyEnabled[0];

  return STRIPE_CHECKOUT_UNSUPPORTED_METHODS.has(fallback)
    ? null
    : (ALL_PAYMENT_METHODS.includes(fallback) ? fallback : null);
}
