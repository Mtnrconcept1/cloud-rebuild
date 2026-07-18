type FeatureDefinition = {
  defaultEnabled?: boolean;
  dependsOn?: string[];
  requiresAnyOf?: string[];
};

const FEATURE_DEFINITIONS: Record<string, FeatureDefinition> = {
  "payment-card": { defaultEnabled: true },
  "payment-twint": { defaultEnabled: true },
  "payment-postfinance-card": { defaultEnabled: true },
  "payment-postfinance-efinance": { defaultEnabled: true },
  "payment-cash": { defaultEnabled: true },
  "billing-fair-growth-annual": { defaultEnabled: false },
  livraison: { defaultEnabled: true },
  emporter: { defaultEnabled: true },
  "sur-place": { defaultEnabled: true },
  reservation: { defaultEnabled: true },
  commandes: { defaultEnabled: true, requiresAnyOf: ["livraison", "emporter"] },
  "anti-gaspi": { defaultEnabled: true, dependsOn: ["emporter"] },
  "ventes-flash": { defaultEnabled: true },
  "zero-attente": { defaultEnabled: true, dependsOn: ["reservation", "sur-place"] },
};

const PAYMENT_METHOD_FEATURES: Record<string, string> = {
  card: "payment-card",
  twint: "payment-twint",
  postfinance_card: "payment-postfinance-card",
  postfinance_efinance: "payment-postfinance-efinance",
  cash: "payment-cash",
};

type FeatureRow = {
  name?: string | null;
  is_active?: boolean | null;
};

function normalizePaymentMethod(paymentMethod: string | null | undefined) {
  return String(paymentMethod || "card").trim().toLowerCase();
}

function resolveFlagState(
  featureName: string,
  explicitStates: Map<string, boolean>,
  cache: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  if (cache.has(featureName)) return cache.get(featureName)!;
  if (visiting.has(featureName)) return false;

  visiting.add(featureName);
  const definition = FEATURE_DEFINITIONS[featureName];
  const explicitEnabled = explicitStates.get(featureName) ?? definition?.defaultEnabled ?? true;

  let enabled = explicitEnabled;
  if (enabled && definition?.dependsOn?.length) {
    enabled = definition.dependsOn.every((dependency) =>
      resolveFlagState(dependency, explicitStates, cache, visiting)
    );
  }
  if (enabled && definition?.requiresAnyOf?.length) {
    enabled = definition.requiresAnyOf.some((dependency) =>
      resolveFlagState(dependency, explicitStates, cache, visiting)
    );
  }

  visiting.delete(featureName);
  cache.set(featureName, enabled);
  return enabled;
}

export async function getEffectiveFeatureFlagSet(adminClient: any): Promise<Set<string>> {
  const { data, error } = await adminClient.from("feature_flags").select("name, is_active");
  if (error) throw new Error(error.message);

  const explicitStates = new Map<string, boolean>();
  for (const [featureName, definition] of Object.entries(FEATURE_DEFINITIONS)) {
    explicitStates.set(featureName, definition.defaultEnabled ?? true);
  }
  for (const row of (data || []) as FeatureRow[]) {
    const featureName = String(row.name || "").trim();
    if (!featureName) continue;
    explicitStates.set(featureName, Boolean(row.is_active));
  }

  const cache = new Map<string, boolean>();
  const activeFlags = new Set<string>();

  for (const featureName of explicitStates.keys()) {
    if (resolveFlagState(featureName, explicitStates, cache, new Set<string>())) {
      activeFlags.add(featureName);
    }
  }

  return activeFlags;
}

export function getPaymentFeatureName(paymentMethod: string | null | undefined) {
  return PAYMENT_METHOD_FEATURES[normalizePaymentMethod(paymentMethod)] || null;
}

export function assertPaymentMethodAllowed(input: {
  activeFlags: Set<string>;
  paymentMethod: string | null | undefined;
  disabledPaymentMethods?: string[] | null;
  cashAllowed?: boolean;
}) {
  const normalizedPaymentMethod = normalizePaymentMethod(input.paymentMethod);
  if (!input.cashAllowed && normalizedPaymentMethod === "cash") {
    throw new Error("Ce parcours n'accepte pas le paiement en especes.");
  }

  const paymentFeatureName = getPaymentFeatureName(normalizedPaymentMethod);
  if (paymentFeatureName && !input.activeFlags.has(paymentFeatureName)) {
    throw new Error("Ce moyen de paiement est desactive globalement.");
  }

  const disabledPaymentMethods = new Set((input.disabledPaymentMethods || []).map((method) => String(method).trim().toLowerCase()));
  if (disabledPaymentMethods.has(normalizedPaymentMethod)) {
    throw new Error("Ce moyen de paiement est desactive pour ce restaurant.");
  }
}
