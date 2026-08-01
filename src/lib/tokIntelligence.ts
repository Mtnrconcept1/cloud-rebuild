import { invokeSupabaseFunction } from "@/lib/session";

async function invokeTokIntelligence<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await invokeSupabaseFunction<T>(functionName, {
    body,
  });
  if (error) throw error;
  if (!data) throw new Error("Réponse vide du service TOK.");
  return data;
}

export type CampaignStudioGuardrails = {
  max_budget_chf: number;
  max_daily_budget_chf: number;
  max_discount_percent: number;
  max_conversions: number;
  stop_cost_per_conversion_chf: number;
  manual_approval_required: boolean;
};

export type CampaignStudioPlan = {
  title: string;
  summary: string;
  objective: string;
  campaign_payload: {
    title: string;
    body: string;
    type: "boost" | "banner" | "push";
    target_pages: string[];
    pricing_strategy: "visibility" | "traffic" | "conversion";
    base_budget: number;
    budget_daily: number;
    duration_days: number;
    starts_at: string;
    ends_at: string;
    target_criteria: {
      cuisines: string[];
      cities: string[];
      minOrders: number;
      maxDaysSinceOrder: number;
      minAvgBasket: number;
      favoritesOnly: boolean;
      customerSegment: "all" | "new" | "returning" | "loyal" | "inactive";
      journeyTypes: string[];
      serviceMoments: string[];
    };
    channels: {
      banner: boolean;
      restaurant_cards: boolean;
    };
  };
  projected_metrics: {
    estimated_reach: number;
    estimated_clicks: number;
    estimated_conversions: number;
    estimated_cost_per_conversion_chf: number;
  };
  rationale: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
};

export type CampaignStudioRun = {
  id: string;
  restaurant_id: string;
  status: "draft" | "approved" | "launched" | "paused" | "stopped" | "failed";
  objective: string;
  request_prompt: string;
  plan: CampaignStudioPlan;
  guardrails: CampaignStudioGuardrails;
  projected_metrics: Record<string, unknown>;
  approval_snapshot: Record<string, unknown>;
  campaign_id: string | null;
  approved_at: string | null;
  launched_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export function listCampaignStudioRuns(restaurantId: string) {
  return invokeTokIntelligence<{ runs: CampaignStudioRun[] }>(
    "ai-campaign-studio",
    { action: "list", restaurantId },
  );
}

export function generateCampaignStudioPlan(input: {
  restaurantId: string;
  prompt: string;
  guardrails: Partial<CampaignStudioGuardrails>;
  idempotencyKey?: string;
}) {
  return invokeTokIntelligence<{
    run: CampaignStudioRun;
    reused: boolean;
  }>("ai-campaign-studio", {
    action: "generate",
    ...input,
  });
}

export function approveCampaignStudioRun(input: {
  restaurantId: string;
  runId: string;
  guardrails: CampaignStudioGuardrails;
}) {
  return invokeTokIntelligence<{ run: CampaignStudioRun }>(
    "ai-campaign-studio",
    { action: "approve", ...input },
  );
}

export function markCampaignStudioRunLaunched(input: {
  restaurantId: string;
  runId: string;
  campaignId: string;
}) {
  return invokeTokIntelligence<{ run: CampaignStudioRun }>(
    "ai-campaign-studio",
    { action: "mark_launched", ...input },
  );
}

export type CustomerMemoryItem = {
  id: string;
  memory_key: string;
  label: string;
  category: string;
  value: Record<string, unknown>;
  source: "explicit" | "inferred";
  status: "pending" | "active" | "rejected" | "deleted";
  confidence: number;
  sensitivity: "standard" | "sensitive";
  evidence: Record<string, unknown>;
  expires_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerMemorySnapshot = {
  consentGranted: boolean;
  consent: Record<string, unknown> | null;
  items: CustomerMemoryItem[];
};

export function listCustomerMemory() {
  return invokeTokIntelligence<CustomerMemorySnapshot>("customer-memory", {
    action: "list",
  });
}

export function addCustomerMemory(input: {
  memoryKey: string;
  label: string;
  category: string;
  value: Record<string, unknown>;
}) {
  return invokeTokIntelligence<{ item: CustomerMemoryItem }>(
    "customer-memory",
    { action: "upsert", ...input },
  );
}

export function inferCustomerMemory() {
  return invokeTokIntelligence<{
    summary: string;
    warnings: string[];
    items: CustomerMemoryItem[];
  }>("customer-memory", { action: "infer" });
}

export function updateCustomerMemoryStatus(
  action: "confirm" | "reject" | "delete",
  itemId: string,
) {
  return invokeTokIntelligence<{ item: CustomerMemoryItem }>(
    "customer-memory",
    { action, itemId },
  );
}

export function clearCustomerMemory() {
  return invokeTokIntelligence<{ cleared: number }>("customer-memory", {
    action: "clear",
  });
}

export function exportCustomerMemory() {
  return invokeTokIntelligence<{
    exportedAt: string;
    consent: Record<string, unknown> | null;
    items: CustomerMemoryItem[];
    events: Array<Record<string, unknown>>;
  }>("customer-memory", { action: "export" });
}

export type SupportResolutionAction = {
  id: string;
  run_id: string;
  incident_id: string;
  action_type: string;
  label: string;
  reason: string;
  arguments: Record<string, unknown>;
  requires_approval: boolean;
  status: string;
  result: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportResolutionRun = {
  id: string;
  incident_id: string;
  status: string;
  title: string;
  executive_summary: string;
  analysis: Record<string, unknown>;
  customer_safe_summary: string;
  risk_level: string;
  confidence: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportOpsIncidentLink = {
  id: string;
  support_incident_id: string;
  ops_incident_id: string;
  link_type: string;
  technical_evidence: Record<string, unknown>;
  created_at: string;
};

export type SupportIncidentSummary = {
  id: string;
  user_id: string | null;
  restaurant_id: string | null;
  order_id: string | null;
  reservation_id: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export function listSupportResolutionWorkspace(incidentId?: string | null) {
  return invokeTokIntelligence<{
    incidents: SupportIncidentSummary[];
    runs: SupportResolutionRun[];
    actions: SupportResolutionAction[];
    links: SupportOpsIncidentLink[];
    ops_incidents: OpsIncidentSummary[];
  }>("ai-support-resolution", {
    action: "list",
    incidentId: incidentId || null,
  });
}

export function analyzeSupportIncident(input: {
  incidentId: string;
  prompt?: string;
}) {
  return invokeTokIntelligence<{
    run: SupportResolutionRun;
    actions: SupportResolutionAction[];
    result: Record<string, unknown>;
  }>("ai-support-resolution", {
    action: "analyze",
    ...input,
  });
}

export function executeSupportResolutionAction(input: {
  actionId: string;
  confirmed: boolean;
}) {
  return invokeTokIntelligence<{
    action: SupportResolutionAction;
    idempotent: boolean;
  }>("ai-support-resolution", {
    action: "execute",
    ...input,
  });
}

export function rejectSupportResolutionAction(input: {
  actionId: string;
  reason?: string;
}) {
  return invokeTokIntelligence<{ action: SupportResolutionAction }>(
    "ai-support-resolution",
    { action: "reject", ...input },
  );
}

export type OpsIncidentSummary = {
  id: string;
  source: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  probable_cause: string | null;
  impact: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  github_branch: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  failure_reason: string | null;
  evidence_hash?: string | null;
  repairability?: string | null;
  analysis_source?: string | null;
  analysis_cached?: boolean | null;
  analysis_generated_at?: string | null;
};

export type GuardianAssessmentRecord = {
  id: string;
  incident_id: string;
  severity: string;
  risk_level: string;
  confidence: number | null;
  assessment: Record<string, unknown>;
  created_at: string;
};

export type GuardianVerificationRecord = {
  id: string;
  incident_id: string;
  status: string;
  function_name: string | null;
  observation_started_at: string;
  observation_ended_at: string | null;
  checks: Record<string, unknown>;
  created_at: string;
};

export function getGuardianOverview() {
  return invokeTokIntelligence<{
    incidents: OpsIncidentSummary[];
    active_failures: Array<Record<string, unknown>>;
    recovered_failures: Array<Record<string, unknown>>;
    assessments: GuardianAssessmentRecord[];
    verifications: GuardianVerificationRecord[];
    latest_advisor_snapshot: Record<string, unknown> | null;
    generated_at: string;
    lookback_hours: number;
  }>("ai-guardian", { action: "overview" });
}

export function analyzeGuardianIncident(input: {
  incidentId: string;
  prompt?: string;
  forceDeepAnalysis?: boolean;
}) {
  return invokeTokIntelligence<{
    assessment: GuardianAssessmentRecord;
    result: Record<string, unknown>;
    function_name: string | null;
    reused?: boolean;
  }>("ai-guardian", { action: "analyze", ...input });
}

export function verifyGuardianIncident(input: {
  incidentId: string;
  functionName?: string;
  observationStart?: string;
}) {
  return invokeTokIntelligence<{
    verification: GuardianVerificationRecord;
    checks: Record<string, unknown>;
  }>("ai-guardian", { action: "verify", ...input });
}
