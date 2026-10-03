export const MARKETING_AUTOPILOT_OPERATION_NAMES = [
  "admin_get_marketing_autopilot_dashboard",
  "admin_simulate_marketing_automation",
  "admin_prepare_marketing_automation_action",
  "admin_upsert_marketing_asset",
  "admin_update_marketing_provider_control",
] as const;

export type MarketingAutopilotOperation = (typeof MARKETING_AUTOPILOT_OPERATION_NAMES)[number];

export const MARKETING_AUTOMATION_TEMPLATES = [
  {
    key: "tok.zero_attente",
    label: "Zéro attente",
    summary: "Prépare une relance bornée selon le seuil, la plage horaire et la fréquence autorisée.",
    accent: "orange",
  },
  {
    key: "tok.ventes_flash",
    label: "Vente flash",
    summary: "Transforme un inventaire confirmé en campagne limitée par le stock, la durée et le budget.",
    accent: "rose",
  },
  {
    key: "tok.anti_gaspillage",
    label: "Anti-gaspillage",
    summary: "Prépare une offre à partir d'un surplus vérifié, avec retrait et exclusions obligatoires.",
    accent: "emerald",
  },
  {
    key: "tok.print_studio",
    label: "Print studio",
    summary: "Prépare le BAT et le devis sans autoriser de commande ni de dépense implicite.",
    accent: "violet",
  },
  {
    key: "tok.plan_salle",
    label: "Plan de salle",
    summary: "Convertit un événement métier confirmé en message pour des destinataires explicitement autorisés.",
    accent: "sky",
  },
  {
    key: "tok.tok_social",
    label: "TOK social",
    summary: "Assemble un pack créatif et un calendrier, sans publier sur un réseau externe.",
    accent: "blue",
  },
  {
    key: "tok.publicites_ia",
    label: "Publicités IA",
    summary: "Produit uniquement un brouillon de créatif, ciblage et budget à approuver séparément.",
    accent: "amber",
  },
  {
    key: "tok.comptabilite_ia",
    label: "Comptabilité IA",
    summary: "Cadre un produit à définir avec accès minimaux, sans transmettre de donnée sensible à l'IA.",
    accent: "slate",
  },
] as const;

export type MarketingAutomationTemplateKey = (typeof MARKETING_AUTOMATION_TEMPLATES)[number]["key"];

export type MarketingAutopilotSource = "backend" | "fallback";
export type MarketingAutonomyLevel = 0 | 1 | 2 | 3 | 4;
export type MarketingProviderStatus = "healthy" | "configured" | "degraded" | "disconnected" | "blocked" | "paused" | "unconfirmed";

export type MarketingAutopilotGovernance = {
  autonomyLevel: MarketingAutonomyLevel;
  globalPaused: boolean;
  approvalRequired: boolean;
  externalActionsBlocked: boolean;
  featureEnabled: boolean;
  missingDecisions: string[];
  policyVersion: string | null;
  reviewedAt: string | null;
};

export type MarketingProviderControl = {
  status: "unconfigured" | "paused";
  autonomyLevel: MarketingAutonomyLevel;
  enabled: boolean;
  externalActionsBlocked: boolean;
  reason: string | null;
  updatedAt: string | null;
};

export type MarketingAutopilotProvider = {
  provider: string;
  label: string;
  category: string;
  status: MarketingProviderStatus;
  statusReason: string | null;
  accountLabel: string | null;
  capabilities: string[];
  scopes: string[];
  lastCheckedAt: string | null;
  control: MarketingProviderControl;
};

export type MarketingAutopilotAutomation = {
  id: string;
  templateKey: string;
  name: string;
  status: "draft" | "paused" | "blocked" | "ready" | "disabled" | "unknown";
  blockedReasons: string[];
  lastSimulationAt: string | null;
  updatedAt: string | null;
};

export type MarketingAutopilotAsset = {
  id: string;
  name: string;
  kind: string;
  approvalStatus: string;
  rightsStatus: string;
  updatedAt: string | null;
};

export type MarketingAutopilotAssets = {
  total: number;
  approved: number;
  withCurrentRights: number;
  pendingRights: number;
  required: number;
  items: MarketingAutopilotAsset[];
};

export type MarketingAutopilotMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  source: string | null;
  observedAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
  unavailableReason: string | null;
};

export type MarketingAutopilotAnalytics = {
  metrics: MarketingAutopilotMetric[];
  completeness: number;
  unavailableReasons: string[];
  generatedAt: string | null;
};

export type MarketingAutopilotDashboard = {
  generatedAt: string | null;
  source: MarketingAutopilotSource;
  governance: MarketingAutopilotGovernance;
  providers: MarketingAutopilotProvider[];
  automations: MarketingAutopilotAutomation[];
  assets: MarketingAutopilotAssets;
  analytics: MarketingAutopilotAnalytics;
  warnings: string[];
};

export type MarketingAutomationSimulation = {
  id: string;
  templateKey: string;
  input: Record<string, unknown>;
  templateEnabled: boolean;
  automationStatus: string;
  actionType: string | null;
  externalEffect: false;
  status: "simulated" | "blocked";
  eligibleCount: number | null;
  excludedCount: number | null;
  estimatedCostChf: number | null;
  sampleOutputs: string[];
  warnings: string[];
  blockedReasons: string[];
  expiresAt: string | null;
};

export type MarketingPreparedAutomationAction = {
  id: string;
  runId: string | null;
  automationKey: string;
  status: "draft";
  externalActionsBlocked: true;
  createdAt: string | null;
};

export type MarketingAssetInput = {
  id?: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  content_hash?: string | null;
  byte_size?: number | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  locale?: string | null;
  status?: "draft" | "approved" | "rejected" | "archived";
  source_provider?: string | null;
  source_reference?: string | null;
  metadata?: Record<string, unknown>;
  rights?: {
    rights_basis: "owned" | "licensed" | "provider_terms" | "public_domain";
    owner_name: string;
    license_identifier?: string | null;
    source_reference?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    territories?: string[];
    evidence_metadata?: Record<string, unknown>;
  };
};

export type MarketingProviderControlInput = {
  provider: string;
  status: "unconfigured" | "paused";
  reason: string;
};

export const MARKETING_AUTOPILOT_MISSING_DECISIONS = [
  "Choisir Metricool ou les API sociales directes.",
  "Définir si HubSpot ou TOK est la source de vérité CRM.",
  "Sélectionner les comptes sociaux et publicitaires officiels.",
  "Définir les pays et langues de la première audience.",
  "Valider le premier niveau d'autonomie (niveau 1 recommandé).",
  "Fixer le budget maximal du premier canari payant.",
  "Valider 30 assets de marque et leurs droits d'utilisation.",
] as const;

export function createFallbackMarketingAutopilotDashboard(): MarketingAutopilotDashboard {
  return {
    generatedAt: null,
    source: "fallback",
    governance: {
      autonomyLevel: 0,
      globalPaused: true,
      approvalRequired: true,
      externalActionsBlocked: true,
      featureEnabled: false,
      missingDecisions: [...MARKETING_AUTOPILOT_MISSING_DECISIONS],
      policyVersion: null,
      reviewedAt: null,
    },
    providers: [],
    automations: [],
    assets: { total: 0, approved: 0, withCurrentRights: 0, pendingRights: 0, required: 30, items: [] },
    analytics: {
      metrics: [],
      completeness: 0,
      unavailableReasons: ["Le tableau de bord Autopilot n'a pas été confirmé par le backend."],
      generatedAt: null,
    },
    warnings: ["Mode sûr : toutes les actions externes restent bloquées."],
  };
}
