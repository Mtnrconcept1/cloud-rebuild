import type { FeatureFlag } from "@/lib/featureCatalog";

export type FeatureFlagKey = "delivery" | "orders" | "multiRestaurant";
export type FeatureFlagSource = FeatureFlag[] | Set<string> | Record<string, boolean> | null | undefined;

export function toActiveFeatureSet(source: FeatureFlagSource) {
  if (!source) return new Set<string>();
  if (source instanceof Set) return new Set(source);
  if (Array.isArray(source)) {
    return new Set(source.filter((flag) => flag.effectiveEnabled).map((flag) => flag.name));
  }
  return new Set(Object.entries(source).filter(([, enabled]) => enabled).map(([name]) => name));
}

export function getDisabledFeatureAssistantReply() {
  return "Information indisponible. Contactez le support.";
}
