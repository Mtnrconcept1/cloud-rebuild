import type { MarketingAutopilotMetric } from "@/marketing/autopilotTypes";

export type AnalyticsMetricGroup = "activity" | "delivery" | "attribution";

const ACTIVITY_KEYS = new Set(["campaigns_created", "items_created", "items_scheduled", "social_publications"]);
const DELIVERY_KEYS = new Set(["sent", "delivered", "clicks", "delivery_conversions"]);

const METRIC_LABELS: Record<string, string> = {
  items_scheduled: "En attente de diffusion",
  leads: "Prospects attribués",
  business_conversions: "Conversions métier",
  cac: "Coût par nouveau client",
  cpl: "Coût par prospect",
  cpa: "Coût par conversion",
  roas: "Revenu / dépenses",
};

export function analyticsMetricGroup(metric: MarketingAutopilotMetric): AnalyticsMetricGroup {
  if (metric.group) return metric.group;
  if (ACTIVITY_KEYS.has(metric.key)) return "activity";
  if (DELIVERY_KEYS.has(metric.key)) return "delivery";
  return "attribution";
}

export function analyticsMetricLabel(metric: MarketingAutopilotMetric) {
  return METRIC_LABELS[metric.key] || metric.label;
}

export function formatAnalyticsMetric(metric: MarketingAutopilotMetric) {
  if (metric.value === null || !Number.isFinite(metric.value)) return "Indisponible";
  if (metric.unit && /^[A-Z]{3}$/.test(metric.unit)) {
    return new Intl.NumberFormat("fr-CH", { style: "currency", currency: metric.unit, maximumFractionDigits: 2 }).format(metric.value);
  }
  if (metric.unit === "%") {
    return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(Math.abs(metric.value) <= 1 ? metric.value * 100 : metric.value)} %`;
  }
  if (metric.unit === "x") {
    return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(metric.value)}×`;
  }
  return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 }).format(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`;
}

export function formatAnalyticsRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return "Indisponible";
  return new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 }).format(numerator / denominator);
}

export function analyticsSourceLabel(source: string | null) {
  if (!source) return "Source non fournie";
  if (source.startsWith("marketing_event_facts") || source.startsWith("marketing_events")) return "Journal des envois et interactions";
  if (source.startsWith("marketing_attribution_facts")) return "Attribution vérifiée aux campagnes";
  if (source.startsWith("marketing_calendar_items")) return "Calendrier marketing";
  if (source.startsWith("marketing_campaigns")) return "Campagnes TOK";
  return source;
}

export function analyticsMetricUnavailableLabel(metric: MarketingAutopilotMetric) {
  if (/mixed.currenc|plusieurs devises/i.test(metric.unavailableReason || "")) {
    return "Plusieurs devises sont présentes ; aucun total commun n'est calculé.";
  }
  if (/devise|currenc/i.test(metric.unavailableReason || "")) {
    return "La devise de ce montant n'est pas confirmée.";
  }
  const labels: Record<string, string> = {
    sent: "Aucun envoi confirmé dans cette période.",
    delivered: "Aucune distribution confirmée dans cette période.",
    clicks: "Aucun clic confirmé dans cette période.",
    delivery_conversions: "Aucune conversion de diffusion confirmée.",
    leads: "Les prospects ne sont pas encore reliés aux campagnes.",
    business_conversions: "Aucune conversion métier attribuée dans cette période.",
    spend: "Aucune dépense vérifiée pour cette période.",
    revenue: "Aucun revenu attribué à une campagne pour cette période.",
    cac: "Dépenses et nouveaux clients attribués requis.",
    cpl: "Dépenses et prospects attribués requis.",
    cpa: "Dépenses et conversions attribuées requises.",
    roas: "Dépenses et revenus attribués requis.",
  };
  return labels[metric.key] || "La source n'a pas encore confirmé cette mesure.";
}

type AnalyticsIssue = { key: string; title: string; description: string };

const DELIVERY_REASONS = new Set([
  "delivery_events_unavailable", "sent_data_unavailable", "delivered_data_unavailable",
  "click_data_unavailable", "delivery_conversion_data_unavailable",
]);
const ATTRIBUTION_REASONS = new Set([
  "lead_data_unavailable", "conversion_data_unavailable", "customer_acquisition_data_unavailable",
  "cac_data_unavailable", "cpl_data_unavailable", "cpa_data_unavailable", "roas_data_unavailable",
]);
const CURRENCY_REASONS = new Set(["mixed_currencies", "currency_missing", "currency_unavailable", "currency_data_unavailable", "unconfirmed_currency"]);

export function analyticsIssues(reasons: string[]): AnalyticsIssue[] {
  const values = new Set(reasons);
  const issues: AnalyticsIssue[] = [];
  if (reasons.some((reason) => DELIVERY_REASONS.has(reason))) {
    issues.push({
      key: "delivery",
      title: "Suivi de diffusion incomplet",
      description: "Les envois, distributions, clics et conversions apparaissent après confirmation. Consultez la distribution pour vérifier les diffusions et leurs retours.",
    });
  }
  const missingSpend = values.has("spend_data_unavailable");
  const missingRevenue = values.has("revenue_data_unavailable");
  if (missingSpend || missingRevenue) {
    issues.push({
      key: "finance",
      title: missingSpend && missingRevenue ? "Dépenses et revenus à relier" : missingSpend ? "Dépenses à relier" : "Revenus à relier",
      description: "Reliez les coûts et les ventes vérifiés à leur campagne pour mesurer les résultats commerciaux. Un budget gratuit ne suffit pas à confirmer un coût nul.",
    });
  }
  if (reasons.some((reason) => ATTRIBUTION_REASONS.has(reason))) {
    issues.push({
      key: "attribution",
      title: "Attribution commerciale incomplète",
      description: "Les prospects, conversions et nouveaux clients doivent être associés à une campagne avant de calculer les coûts d'acquisition.",
    });
  }
  if (values.has("mixed_currencies")) {
    issues.push({
      key: "currency",
      title: "Plusieurs devises sont présentes",
      description: "Les montants de devises différentes ne sont pas additionnés. Les totaux et les ratios financiers restent indisponibles sans conversion vérifiée.",
    });
  } else if (reasons.some((reason) => CURRENCY_REASONS.has(reason))) {
    issues.push({
      key: "currency",
      title: "Devise à confirmer",
      description: "La devise doit être confirmée avant de présenter un montant ou un résultat financier.",
    });
  }
  const knownReasons = new Set([...DELIVERY_REASONS, ...ATTRIBUTION_REASONS, ...CURRENCY_REASONS, "spend_data_unavailable", "revenue_data_unavailable"]);
  if (reasons.some((reason) => !knownReasons.has(reason))) {
    issues.push({
      key: "other",
      title: "Certaines sources restent à vérifier",
      description: "Actualisez les indicateurs. Si des mesures restent indisponibles, vérifiez l'état des intégrations et la présence de résultats confirmés pour cette période.",
    });
  }
  return issues;
}
