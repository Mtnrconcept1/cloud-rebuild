type AccountingAiResultLike = {
  summary: string;
  anomalies: Array<{ label: string; severity: "low" | "medium" | "high"; evidence: string }>;
  unpaid_invoices: string[];
  risky_restaurants: string[];
  revenue_forecast: string;
  margin_notes: string[];
  recommended_actions: string[];
  export_markdown: string;
};

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SNAKE_CASE_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

const TECHNICAL_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpending_payment\b/gi, "paiement en attente"],
  [/\bpayment_pending\b/gi, "paiement en attente"],
  [/\bpreparing\b/gi, "en préparation"],
  [/\baccepted\b/gi, "acceptée"],
  [/\bcompleted\b/gi, "terminée"],
  [/\bdelivered\b/gi, "livrée"],
  [/\bcancelled\b/gi, "annulée"],
  [/\brefunded\b/gi, "remboursée"],
  [/\bdonn(?:ées|ees)\s+back[- ]?end\b/gi, "données disponibles"],
  [/\bbackend\b/gi, "données disponibles"],
  [/\bback-end\b/gi, "données disponibles"],
  [/\bSupabase\b/gi, "plateforme"],
  [/\bStripe\b/gi, "paiement"],
  [/\bcut[- ]off\b/gi, "clôture"],
  [/\bpayment_transactions\b/gi, "transactions de paiement"],
  [/\bai_usage_logs\b/gi, "consommation IA"],
  [/\borders\b/gi, "commandes"],
  [/\brestaurant_invoices\b/gi, "factures"],
];

function normalizeRestaurantName(restaurantName?: string | null) {
  return typeof restaurantName === "string" && restaurantName.trim()
    ? restaurantName.trim()
    : "le restaurant";
}

function replaceSnakeCaseToken(token: string) {
  return token
    .split("_")
    .filter(Boolean)
    .join(" ");
}

export function formatAccountingAiText(value: string | null | undefined, restaurantName?: string | null) {
  if (!value) return "";

  const displayName = normalizeRestaurantName(restaurantName);
  let text = String(value);

  text = text.replace(/\brestaurant[_\s-]?id\b\s*:?\s*/gi, "restaurant ");
  text = text.replace(UUID_PATTERN, displayName);

  for (const [pattern, replacement] of TECHNICAL_COPY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(SNAKE_CASE_PATTERN, replaceSnakeCaseToken);

  return text
    .replace(/\brestaurant\s+le restaurant\b/gi, "le restaurant")
    .replace(/\bpaiement\/paiement\b/gi, "paiement")
    .replace(/\s+([,.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatAccountingAiResultForDisplay<T extends AccountingAiResultLike>(
  result: T,
  restaurantName?: string | null,
): T {
  return {
    ...result,
    summary: formatAccountingAiText(result.summary, restaurantName),
    anomalies: result.anomalies.map((anomaly) => ({
      ...anomaly,
      label: formatAccountingAiText(anomaly.label, restaurantName),
      evidence: formatAccountingAiText(anomaly.evidence, restaurantName),
    })),
    unpaid_invoices: result.unpaid_invoices.map((item) => formatAccountingAiText(item, restaurantName)),
    risky_restaurants: result.risky_restaurants.map((item) => formatAccountingAiText(item, restaurantName)),
    revenue_forecast: formatAccountingAiText(result.revenue_forecast, restaurantName),
    margin_notes: result.margin_notes.map((item) => formatAccountingAiText(item, restaurantName)),
    recommended_actions: result.recommended_actions.map((item) => formatAccountingAiText(item, restaurantName)),
    export_markdown: formatAccountingAiText(result.export_markdown, restaurantName),
  };
}
