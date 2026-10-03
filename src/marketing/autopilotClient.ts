import {
  MARKETING_AUTOMATION_TEMPLATES,
  MARKETING_AUTOPILOT_MISSING_DECISIONS,
  type MarketingAssetInput,
  type MarketingAutomationSimulation,
  type MarketingAutomationTemplateKey,
  type MarketingAutonomyLevel,
  type MarketingAutopilotAnalytics,
  type MarketingAutopilotAsset,
  type MarketingAutopilotDashboard,
  type MarketingAutopilotMetric,
  type MarketingAutopilotProvider,
  type MarketingPreparedAutomationAction,
  type MarketingProviderControlInput,
  type MarketingProviderStatus,
} from "@/marketing/autopilotTypes";
import {
  MARKETING_BFF_ENDPOINTS,
  MarketingBffError,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";

type JsonRecord = Record<string, unknown>;

const METRIC_LABELS: Record<string, string> = {
  spend: "Dépenses",
  revenue: "Revenu attribué",
  leads: "Leads",
  conversions: "Conversions",
  cac: "CAC",
  cpa: "CPA",
  cpl: "CPL",
  roas: "ROAS",
  clicks: "Clics",
  reply_rate: "Taux de réponse",
  unsubscribe_rate: "Désinscriptions",
  complaint_rate: "Plaintes",
  time_saved_hours: "Temps économisé",
  referring_domains: "Domaines référents",
  backlinks: "Backlinks",
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return unwrap(value[0]);
  const item = record(value);
  if (!item) return value;
  if (item.data !== undefined) return unwrap(item.data);
  if (item.result !== undefined) return unwrap(item.result);
  if (item.dashboard !== undefined) return unwrap(item.dashboard);
  return item;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 500) : fallback;
}

function nullableString(value: unknown) {
  const normalized = stringValue(value);
  return normalized || null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function nonNegativeInteger(value: unknown) {
  const normalized = nullableNumber(value);
  return normalized === null ? 0 : Math.max(0, Math.trunc(normalized));
}

function stringList(value: unknown, maximum = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, maximum);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function autonomyLevel(value: unknown): MarketingAutonomyLevel {
  const normalized = nullableNumber(value);
  return normalized !== null && [0, 1, 2, 3, 4].includes(normalized)
    ? normalized as MarketingAutonomyLevel
    : 0;
}

function providerStatus(value: unknown): MarketingProviderStatus {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "ready") return "healthy";
  if (normalized === "invalid_configuration") return "blocked";
  if (normalized === "unconfigured") return "unconfirmed";
  return ["healthy", "configured", "degraded", "disconnected", "blocked"].includes(normalized)
    ? normalized as MarketingProviderStatus
    : "unconfirmed";
}

function normalizeProvider(value: unknown, index: number): MarketingAutopilotProvider | null {
  const item = record(value);
  if (!item) return null;
  const provider = stringValue(item.provider ?? item.provider_id ?? item.id);
  if (!provider) return null;
  const control = record(item.control) || item;
  const observedState = record(item.observed_state ?? item.observedState);
  const rawControlState = stringValue(control.control_state ?? control.controlState ?? control.status);
  return {
    provider,
    label: stringValue(item.label ?? item.name ?? item.display_name, provider.replace(/[_-]/g, " ")),
    category: stringValue(item.category ?? item.provider_kind, "Fournisseur"),
    status: rawControlState === "paused" ? "paused" : providerStatus(observedState?.status ?? observedState?.state ?? item.observed_state ?? item.observedState ?? item.status),
    statusReason: nullableString(observedState?.reason ?? item.status_reason ?? item.reason),
    accountLabel: nullableString(item.account_label ?? item.account),
    capabilities: stringList(item.capabilities, 30),
    scopes: stringList(item.scopes ?? item.granted_scopes, 30),
    lastCheckedAt: nullableString(item.last_checked_at ?? item.lastCheckedAt ?? item.last_probe_at),
    control: {
      status: rawControlState === "paused" ? "paused" : "unconfigured",
      autonomyLevel: autonomyLevel(control.autonomy_level ?? control.autonomyLevel),
      enabled: rawControlState !== "paused"
        && rawControlState !== "unconfigured"
        && control.enabled === true,
      externalActionsBlocked: true,
      reason: nullableString(control.control_reason ?? control.reason),
      updatedAt: nullableString(control.control_updated_at ?? control.updated_at ?? control.updatedAt),
    },
  };
}

function normalizeAsset(value: unknown, index: number): MarketingAutopilotAsset | null {
  const item = record(value);
  if (!item) return null;
  const id = stringValue(item.id ?? item.asset_id, `asset-${index + 1}`);
  return {
    id,
    name: stringValue(item.name ?? item.label, "Asset sans nom"),
    kind: stringValue(item.kind ?? item.asset_type, "inconnu"),
    approvalStatus: stringValue(item.approval_status ?? item.status, "unconfirmed"),
    rightsStatus: stringValue(item.rights_status ?? item.usage_rights_status, "unconfirmed"),
    updatedAt: nullableString(item.updated_at ?? item.updatedAt),
  };
}

function normalizeMetric(key: string, value: unknown): MarketingAutopilotMetric {
  const item = record(value);
  const metricValue = item ? nullableNumber(item.value) : nullableNumber(value);
  const freshness = stringValue(item?.freshness).toLowerCase();
  return {
    key,
    label: stringValue(item?.label, METRIC_LABELS[key] || key.replace(/_/g, " ")),
    value: metricValue,
    unit: nullableString(item?.unit),
    source: nullableString(item?.source ?? item?.provenance),
    observedAt: nullableString(item?.observed_at ?? item?.observedAt),
    freshness: freshness === "fresh" || freshness === "stale" ? freshness : "unknown",
    unavailableReason: nullableString(item?.unavailable_reason ?? item?.reason),
  };
}

function normalizeAnalytics(
  value: unknown,
  dashboardGeneratedAt: string | null,
  dashboardCompleteness: unknown,
  dashboardReasons: unknown,
): MarketingAutopilotAnalytics {
  const item = record(value);
  const unavailableReasons = stringList(item?.unavailable_reasons ?? item?.unavailableReasons ?? dashboardReasons, 50);
  const completenessLabel = stringValue(item?.completeness ?? dashboardCompleteness).toLowerCase();
  if (!item) {
    return {
      metrics: [],
      completeness: completenessLabel === "complete" ? 1 : 0,
      unavailableReasons: unavailableReasons.length ? unavailableReasons : ["Les analytics n'ont pas été fournis par le backend."],
      generatedAt: dashboardGeneratedAt,
    };
  }
  const rawMetrics = item.metrics;
  let metrics: MarketingAutopilotMetric[] = [];
  if (Array.isArray(rawMetrics)) {
    metrics = rawMetrics.flatMap((raw, index) => {
      const metric = record(raw);
      if (!metric) return [];
      const key = stringValue(metric.key ?? metric.metric, `metric_${index + 1}`);
      return [normalizeMetric(key, metric)];
    });
  } else {
    const metricRecord = record(rawMetrics) || item;
    metrics = Object.keys(METRIC_LABELS)
      .filter((key) => Object.prototype.hasOwnProperty.call(metricRecord, key))
      .map((key) => normalizeMetric(key, metricRecord[key]));
  }
  if (["delivery_conversions", "business_conversions", "spend_minor", "revenue_minor", "cac_minor", "cpl_minor", "cpa_minor"].some((key) => key in item)) {
    const currency = stringValue(item.currency, "CHF");
    const factMetric = (key: string, label: string, rawValue: unknown, source: string, unit: string | null = null, divisor = 1): MarketingAutopilotMetric => {
      const numeric = nullableNumber(rawValue);
      return {
        key,
        label,
        value: numeric === null ? null : numeric / divisor,
        unit,
        source,
        observedAt: dashboardGeneratedAt,
        freshness: "unknown",
        unavailableReason: numeric === null ? "Donnée non disponible pour la période." : null,
      };
    };
    metrics = [
      factMetric("sent", "Envois", item.sent, "marketing_event_facts"),
      factMetric("delivered", "Distribués", item.delivered, "marketing_event_facts"),
      factMetric("clicks", "Clics", item.clicked, "marketing_event_facts"),
      factMetric("delivery_conversions", "Conversions de diffusion", item.delivery_conversions, "marketing_event_facts"),
      factMetric("leads", "Leads", item.leads, "marketing_attribution_facts"),
      factMetric("business_conversions", "Conversions métier", item.business_conversions, "marketing_attribution_facts"),
      factMetric("spend", "Dépenses", item.spend_minor, "marketing_attribution_facts", currency, 100),
      factMetric("revenue", "Revenu attribué", item.revenue_minor, "marketing_attribution_facts", currency, 100),
      factMetric("cac", "CAC", item.cac_minor, "marketing_attribution_facts", currency, 100),
      factMetric("cpl", "CPL", item.cpl_minor, "marketing_attribution_facts", currency, 100),
      factMetric("cpa", "CPA", item.cpa_minor, "marketing_attribution_facts", currency, 100),
      factMetric("roas", "ROAS", item.roas, "marketing_attribution_facts", "x"),
    ];
  }
  const rawCompleteness = nullableNumber(item.completeness ?? dashboardCompleteness);
  const completeness = rawCompleteness === null
    ? completenessLabel === "complete"
      ? 1
      : completenessLabel === "partial"
        ? 0.5
        : 0
    : Math.min(1, Math.max(0, rawCompleteness > 1 ? rawCompleteness / 100 : rawCompleteness));
  return {
    metrics: metrics.slice(0, 50),
    completeness,
    unavailableReasons,
    generatedAt: nullableString(item.generated_at ?? item.generatedAt) || dashboardGeneratedAt,
  };
}

export function normalizeMarketingAutopilotDashboard(response: unknown): MarketingAutopilotDashboard {
  const item = record(unwrap(response));
  if (!item || !["generated_at", "generatedAt", "governance", "providers", "automations", "assets", "analytics"].some((key) => key in item)) {
    throw new Error("Le tableau de bord Autopilot retourné par le serveur est invalide.");
  }
  const generatedAt = nullableString(item.generated_at ?? item.generatedAt);
  const governance = record(item.governance) || {};
  const missingDecisionsSource = governance.missing_decisions ?? governance.missingDecisions;
  const missingDecisions = Array.isArray(missingDecisionsSource)
    ? stringList(missingDecisionsSource, 30)
    : [...MARKETING_AUTOPILOT_MISSING_DECISIONS];
  const rawAssets = item.assets;
  const assetRecord = record(rawAssets);
  const assetItems = asArray(assetRecord?.items ?? rawAssets)
    .map(normalizeAsset)
    .filter((asset): asset is MarketingAutopilotAsset => Boolean(asset))
    .slice(0, 100);
  const approvedAssets = assetItems.filter((asset) => asset.approvalStatus === "approved" && asset.rightsStatus === "confirmed").length;
  return {
    generatedAt,
    source: "backend",
    governance: {
      autonomyLevel: autonomyLevel(governance.autonomy_level ?? governance.autonomyLevel ?? governance.max_campaign_autonomy_level),
      globalPaused: governance.global_paused !== false && governance.globalPaused !== false,
      approvalRequired: governance.approval_required !== false && governance.approvalRequired !== false,
      externalActionsBlocked: true,
      featureEnabled: governance.feature_enabled === true || governance.featureEnabled === true,
      missingDecisions,
      policyVersion: nullableString(governance.policy_version ?? governance.policyVersion),
      reviewedAt: nullableString(governance.reviewed_at ?? governance.reviewedAt),
    },
    providers: asArray(item.providers)
      .map(normalizeProvider)
      .filter((provider): provider is MarketingAutopilotProvider => Boolean(provider))
      .slice(0, 100),
    automations: asArray(item.automations).flatMap((raw, index) => {
      const automation = record(raw);
      if (!automation) return [];
      const templateKey = stringValue(automation.template_key ?? automation.templateKey);
      const status = stringValue(automation.status).toLowerCase();
      return [{
        id: stringValue(automation.id ?? automation.automation_id, templateKey || `automation-${index + 1}`),
        templateKey,
        name: stringValue(automation.name, MARKETING_AUTOMATION_TEMPLATES.find((template) => template.key === templateKey)?.label || templateKey || "Automatisation"),
        status: ["draft", "paused", "blocked", "ready", "disabled"].includes(status) ? status as "draft" | "paused" | "blocked" | "ready" | "disabled" : "unknown" as const,
        blockedReasons: stringList(automation.blocked_reasons ?? automation.blockedReasons, 30),
        lastSimulationAt: nullableString(automation.last_simulation_at ?? automation.lastSimulationAt),
        updatedAt: nullableString(automation.updated_at ?? automation.updatedAt),
      }];
    }).slice(0, 100),
    assets: {
      total: nonNegativeInteger(assetRecord?.total ?? assetItems.length),
      approved: nonNegativeInteger(assetRecord?.approved ?? approvedAssets),
      withCurrentRights: nonNegativeInteger(assetRecord?.with_current_rights ?? approvedAssets),
      pendingRights: Math.max(0, nonNegativeInteger(assetRecord?.total ?? assetItems.length) - nonNegativeInteger(assetRecord?.with_current_rights ?? approvedAssets)),
      required: nonNegativeInteger(assetRecord?.required ?? 30) || 30,
      items: assetItems,
    },
    analytics: normalizeAnalytics(item.analytics, generatedAt, item.completeness, item.unavailable_reasons),
    warnings: stringList(item.warnings, 50),
  };
}

function normalizeSimulation(response: unknown, templateKey: MarketingAutomationTemplateKey, input: Record<string, unknown>): MarketingAutomationSimulation {
  const item = record(unwrap(response));
  if (!item) throw new Error("La simulation retournée par le serveur est invalide.");
  if (item.external_effect !== false && item.externalEffect !== false) {
    throw new Error("Simulation refusée : le backend n'a pas confirmé l'absence d'effet externe.");
  }
  const blockedReasons = stringList(item.blocked_reasons ?? item.blockedReasons, 30);
  const templateEnabled = item.template_enabled === true || item.templateEnabled === true;
  const simulationKey = stringValue(item.simulation_key ?? item.simulationKey ?? item.id);
  if (!/^[0-9a-f]{64}$/i.test(simulationKey)) {
    throw new Error("La simulation ne contient pas de reçu serveur valide.");
  }
  const warnings = stringList(item.warnings, 30);
  if (!templateEnabled) warnings.unshift("Modèle désactivé : le brouillon reste préparatoire et ne peut pas être exécuté.");
  return {
    id: simulationKey,
    templateKey: stringValue(item.automation_key ?? item.automationKey, templateKey),
    input,
    templateEnabled,
    automationStatus: stringValue(item.automation_status ?? item.automationStatus, "unknown"),
    actionType: nullableString(item.action_type ?? item.actionType),
    externalEffect: false,
    status: blockedReasons.length || item.status === "blocked" ? "blocked" : "simulated",
    eligibleCount: nullableNumber(item.eligible_count ?? item.eligibleCount),
    excludedCount: nullableNumber(item.excluded_count ?? item.excludedCount),
    estimatedCostChf: nullableNumber(item.estimated_cost_chf ?? item.estimatedCostChf),
    sampleOutputs: stringList(item.sample_outputs ?? item.sampleOutputs, 20),
    warnings,
    blockedReasons,
    expiresAt: nullableString(item.expires_at ?? item.expiresAt),
  };
}

export function createMarketingAutopilotClientRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Générateur d'identifiants sécurisés indisponible.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isRetryableMarketingAutopilotError(error: unknown) {
  if (!(error instanceof MarketingBffError)) return true;
  return [0, 408, 425, 429, 500, 502, 503, 504].includes(error.status);
}

async function invoke(operation: string, args: JsonRecord) {
  return marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.rpc, {
    body: { operation, args },
  });
}

export async function loadMarketingAutopilotDashboard() {
  return normalizeMarketingAutopilotDashboard(await invoke("admin_get_marketing_autopilot_dashboard", {}));
}

export async function simulateMarketingAutomation(templateKey: MarketingAutomationTemplateKey, input: Record<string, unknown> = {}) {
  const response = await invoke("admin_simulate_marketing_automation", {
    p_automation_key: templateKey,
    p_input: input,
  });
  return normalizeSimulation(response, templateKey, input);
}

export async function prepareMarketingAutomationAction(input: {
  automationKey: string;
  automationInput: Record<string, unknown>;
  simulationKey: string;
  clientRequestId: string;
  reason: string;
}) {
  if (!/^[0-9a-f]{64}$/i.test(input.simulationKey)) {
    throw new Error("Reçu de simulation invalide.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientRequestId)) {
    throw new Error("Identifiant idempotent invalide.");
  }
  const response = record(unwrap(await invoke("admin_prepare_marketing_automation_action", {
    p_automation_key: input.automationKey,
    p_input: input.automationInput,
    p_client_request_id: input.clientRequestId,
    p_simulation_key: input.simulationKey,
    p_reason: input.reason,
  })));
  if (!response) throw new Error("Le brouillon retourné par le serveur est invalide.");
  if (stringValue(response.status) !== "draft") {
    throw new Error("Action refusée : le backend n'a pas confirmé le statut brouillon.");
  }
  if (response.external_effect !== false && response.externalEffect !== false) {
    throw new Error("Action refusée : le backend n'a pas confirmé l'absence d'effet externe.");
  }
  return {
    id: stringValue(response.id ?? response.run_id),
    runId: nullableString(response.run_id),
    automationKey: input.automationKey,
    status: "draft",
    externalActionsBlocked: true,
    createdAt: nullableString(response.created_at ?? response.createdAt),
  } satisfies MarketingPreparedAutomationAction;
}

export async function upsertMarketingAsset(input: MarketingAssetInput, expectedUpdatedAt: string | null = null) {
  return unwrap(await invoke("admin_upsert_marketing_asset", {
    p_payload: input,
    p_expected_updated_at: expectedUpdatedAt,
  }));
}

export async function updateMarketingProviderControl(input: MarketingProviderControlInput) {
  return unwrap(await invoke("admin_update_marketing_provider_control", {
    p_provider: input.provider,
    p_control_state: input.status,
    p_reason: input.reason,
  }));
}
