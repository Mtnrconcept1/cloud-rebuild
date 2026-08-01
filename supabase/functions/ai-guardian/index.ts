import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  isRecord,
  maybeUuid,
  sanitizeMultilineText,
  sanitizeText,
  safeErrorMessage,
} from "../_shared/intelligence.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

type GuardianAssessment = {
  summary: string;
  probable_cause: string;
  alternative_causes: string[];
  evidence: Array<{
    source: string;
    fact: string;
    confidence: number;
  }>;
  affected_components: string[];
  business_impact: string;
  severity: "low" | "medium" | "high" | "critical";
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  repair_plan: Array<{
    step: string;
    files: string[];
    reason: string;
    rollback: string;
  }>;
  tests: string[];
  rollback: string;
  validation_conditions: string[];
  human_approval_required: boolean;
};

type AuditRow = {
  function_name?: string | null;
  action?: string | null;
  status?: string | null;
  error_message?: string | null;
  request_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

const FUNCTION_NAME = "ai-guardian";
const FEATURE_NAME = "admin-guardian";
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "probable_cause",
    "alternative_causes",
    "evidence",
    "affected_components",
    "business_impact",
    "severity",
    "risk_level",
    "confidence",
    "repair_plan",
    "tests",
    "rollback",
    "validation_conditions",
    "human_approval_required",
  ],
  properties: {
    summary: { type: "string" },
    probable_cause: { type: "string" },
    alternative_causes: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "fact", "confidence"],
        properties: {
          source: { type: "string" },
          fact: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    affected_components: { type: "array", items: { type: "string" } },
    business_impact: { type: "string" },
    severity: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    repair_plan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "files", "reason", "rollback"],
        properties: {
          step: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          rollback: { type: "string" },
        },
      },
    },
    tests: { type: "array", items: { type: "string" } },
    rollback: { type: "string" },
    validation_conditions: { type: "array", items: { type: "string" } },
    human_approval_required: { type: "boolean" },
  },
};

function normalizeAction(raw: unknown) {
  const value = sanitizeText(raw, 40).toLowerCase();
  if (value === "overview" || value === "analyze" || value === "verify") {
    return value;
  }
  return "overview";
}

function normalizeLevel(
  value: unknown,
): "low" | "medium" | "high" | "critical" {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }
  return "medium";
}

function parseTime(value: unknown) {
  if (typeof value !== "string") return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function auditKey(row: AuditRow) {
  return `${row.function_name || "unknown"}::${row.action || "unknown"}`;
}

function getActiveFailureGroups(rows: AuditRow[]) {
  const groups = new Map<string, AuditRow[]>();
  for (const row of rows) {
    const createdAt = parseTime(row.created_at);
    if (!Number.isFinite(createdAt) || !row.function_name) continue;
    const key = auditKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const active: Array<Record<string, unknown>> = [];
  const recovered: Array<Record<string, unknown>> = [];

  for (const entries of groups.values()) {
    const sorted = [...entries].sort(
      (left, right) => parseTime(right.created_at) - parseTime(left.created_at),
    );
    const failures = sorted.filter((entry) => entry.status === "failure");
    if (failures.length === 0) continue;

    const lastFailure = failures[0];
    const lastFailureAt = parseTime(lastFailure.created_at);
    const latestSuccess = sorted.find(
      (entry) =>
        entry.status === "success" &&
        parseTime(entry.created_at) > lastFailureAt,
    );
    const item = {
      function_name: lastFailure.function_name,
      action: lastFailure.action,
      failure_count: failures.length,
      last_failure_at: lastFailure.created_at,
      last_error: sanitizeText(lastFailure.error_message, 300),
      currentness_test: "success_after_last_failure",
      latest_success_at: latestSuccess?.created_at || null,
    };

    if (latestSuccess) recovered.push(item);
    else active.push(item);
  }

  return {
    active: active.sort(
      (left, right) =>
        parseTime(right.last_failure_at) - parseTime(left.last_failure_at),
    ),
    recovered: recovered.sort(
      (left, right) =>
        parseTime(right.last_failure_at) - parseTime(left.last_failure_at),
    ),
  };
}

function collectStrings(value: unknown, output = new Set<string>()) {
  if (typeof value === "string") {
    const candidate = sanitizeText(value, 160);
    if (candidate) output.add(candidate);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 30)) collectStrings(entry, output);
    return output;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value).slice(0, 60)) {
      if (
        /function|service|component|endpoint|source|route|workflow/i.test(key)
      ) {
        collectStrings(entry, output);
      }
    }
  }
  return output;
}

function findLikelyFunctionName(incident: Record<string, unknown>) {
  const candidates = collectStrings({
    source: incident.source,
    title: incident.title,
    technical_details: incident.technical_details,
    sanitized_context: incident.sanitized_context,
  });

  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/^https?:\/\/[^/]+\/functions\/v1\//, "")
      .split(/[/?#\s]/)[0]
      .trim();
    if (/^[a-z0-9][a-z0-9-]{2,80}$/i.test(normalized)) {
      return normalized.toLowerCase();
    }
  }
  return null;
}

function normalizeAssessment(
  assessment: GuardianAssessment,
): GuardianAssessment {
  return {
    summary: sanitizeMultilineText(assessment.summary, 3000),
    probable_cause: sanitizeMultilineText(assessment.probable_cause, 3000),
    alternative_causes: (
      Array.isArray(assessment.alternative_causes)
        ? assessment.alternative_causes
        : []
    )
      .slice(0, 12)
      .map((entry) => sanitizeMultilineText(entry, 900))
      .filter(Boolean),
    evidence: (Array.isArray(assessment.evidence) ? assessment.evidence : [])
      .slice(0, 25)
      .map((entry) => ({
        source: sanitizeText(entry.source, 160),
        fact: sanitizeMultilineText(entry.fact, 1200),
        confidence: Math.max(
          0,
          Math.min(1, Number(entry.confidence) || 0),
        ),
      })),
    affected_components: (
      Array.isArray(assessment.affected_components)
        ? assessment.affected_components
        : []
    )
      .slice(0, 20)
      .map((entry) => sanitizeText(entry, 160))
      .filter(Boolean),
    business_impact: sanitizeMultilineText(assessment.business_impact, 2400),
    severity: normalizeLevel(assessment.severity),
    risk_level: normalizeLevel(assessment.risk_level),
    confidence: Math.max(0, Math.min(1, Number(assessment.confidence) || 0)),
    repair_plan: (
      Array.isArray(assessment.repair_plan) ? assessment.repair_plan : []
    )
      .slice(0, 15)
      .map((entry) => ({
        step: sanitizeMultilineText(entry.step, 1200),
        files: (Array.isArray(entry.files) ? entry.files : [])
          .slice(0, 20)
          .map((file) => sanitizeText(file, 260))
          .filter(Boolean),
        reason: sanitizeMultilineText(entry.reason, 1200),
        rollback: sanitizeMultilineText(entry.rollback, 1200),
      })),
    tests: (Array.isArray(assessment.tests) ? assessment.tests : [])
      .slice(0, 30)
      .map((entry) => sanitizeMultilineText(entry, 800))
      .filter(Boolean),
    rollback: sanitizeMultilineText(assessment.rollback, 2400),
    validation_conditions: (
      Array.isArray(assessment.validation_conditions)
        ? assessment.validation_conditions
        : []
    )
      .slice(0, 30)
      .map((entry) => sanitizeMultilineText(entry, 900))
      .filter(Boolean),
    human_approval_required: assessment.human_approval_required !== false,
  };
}

async function recordUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    status: "success" | "failure";
    action: string;
    incidentId?: string | null;
    assessmentId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const inputTokens = input.usage?.input_tokens ?? 0;
  const outputTokens = input.usage?.output_tokens ?? 0;
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: input.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: input.model,
    user_id: actor.userId,
    status: input.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: input.usage?.total_tokens ?? inputTokens + outputTokens,
    estimated_cost_chf: estimateOpenAITextCostChf(
      input.model,
      inputTokens,
      outputTokens,
    ),
    metadata: {
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(
        input.model,
        inputTokens,
        outputTokens,
      ),
      incident_id: input.incidentId || null,
      guardian_assessment_id: input.assessmentId || null,
      ...(input.metadata || {}),
    },
  });
}

async function getOverview(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
) {
  const lookback = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const [
    incidentResult,
    auditResult,
    assessmentResult,
    verificationResult,
    advisorResult,
  ] = await Promise.all([
    actor.adminClient
      .from("ops_incidents")
      .select(
        "id, fingerprint, source, source_event_id, severity, status, title, summary, probable_cause, impact, repair_plan, technical_details, sanitized_context, confidence, risk_level, occurrence_count, first_seen_at, last_seen_at, github_run_id, github_branch, github_pr_number, github_pr_url, resolution_summary, failure_reason, created_at, updated_at",
      )
      .not("status", "in", '("resolved","rejected","no_changes")')
      .order("last_seen_at", { ascending: false })
      .limit(120),
    actor.adminClient
      .from("edge_function_audit_logs")
      .select(
        "function_name, action, status, error_message, request_metadata, created_at",
      )
      .gte("created_at", lookback)
      .order("created_at", { ascending: false })
      .limit(1600),
    actor.adminClient
      .from("ops_guardian_assessments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    actor.adminClient
      .from("ops_guardian_verifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    actor.adminClient
      .from("admin_supabase_advisor_snapshots")
      .select("id, advisors, source, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error =
    incidentResult.error ||
    auditResult.error ||
    assessmentResult.error ||
    verificationResult.error;
  if (error) throw new HttpError(500, error.message);

  const failureGroups = getActiveFailureGroups(
    (auditResult.data || []) as AuditRow[],
  );

  return {
    incidents: incidentResult.data || [],
    active_failures: failureGroups.active,
    recovered_failures: failureGroups.recovered,
    assessments: assessmentResult.data || [],
    verifications: verificationResult.data || [],
    latest_advisor_snapshot: advisorResult.error
      ? null
      : advisorResult.data || null,
    generated_at: new Date().toISOString(),
    lookback_hours: 12,
  };
}

async function getIncidentAnalysisContext(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string,
) {
  const { data: incident, error: incidentError } = await actor.adminClient
    .from("ops_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();
  if (incidentError) throw new HttpError(500, incidentError.message);
  if (!incident) throw new HttpError(404, "ops_incident_not_found");

  const functionName = findLikelyFunctionName(incident);
  const lookback = new Date(
    Math.min(
      Date.now(),
      Math.max(
        Date.now() - 48 * 60 * 60 * 1000,
        parseTime(incident.first_seen_at) || Date.now(),
      ),
    ),
  ).toISOString();

  let auditQuery = actor.adminClient
    .from("edge_function_audit_logs")
    .select(
      "function_name, action, status, target_entity_type, target_entity_id, error_message, request_metadata, created_at",
    )
    .gte("created_at", lookback)
    .order("created_at", { ascending: false })
    .limit(500);

  if (functionName) auditQuery = auditQuery.eq("function_name", functionName);

  const [eventsResult, auditResult, assessmentsResult, verificationsResult] =
    await Promise.all([
      actor.adminClient
        .from("ops_incident_events")
        .select("id, event_type, actor, payload, created_at")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true })
        .limit(400),
      auditQuery,
      actor.adminClient
        .from("ops_guardian_assessments")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(10),
      actor.adminClient
        .from("ops_guardian_verifications")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const error =
    eventsResult.error ||
    auditResult.error ||
    assessmentsResult.error ||
    verificationsResult.error;
  if (error) throw new HttpError(500, error.message);

  return {
    incident,
    function_name: functionName,
    events: eventsResult.data || [],
    audit_logs: auditResult.data || [],
    previous_assessments: assessmentsResult.data || [],
    verifications: verificationsResult.data || [],
  };
}

async function analyzeIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string,
  prompt: string,
  request: Request,
) {
  if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

  const context = await getIncidentAnalysisContext(actor, incidentId);
  const model = selectTokAiModel("admin_report");
  const systemPrompt = `Tu es TOK Guardian, agent interne de fiabilité d'une plateforme suisse de réservation, commande et paiement.
Tu analyses des incidents techniques à partir de journaux déjà nettoyés. N'invente jamais un fichier, une branche, une migration, un commit, une PR, une donnée ou un test.
Distingue clairement preuve, hypothèse et condition de vérification.
Ne propose jamais une mutation directe de production, un merge automatique, un déploiement automatique ou une suppression de données.
Toute réparation doit suivre: branche dédiée, patch minimal, tests, PR, revue humaine, déploiement contrôlé, vérification post-déploiement.
Les paiements, RLS, rôles, secrets, migrations et données client sont toujours à risque élevé.
Les chemins .github/**, AGENTS.md, docs/skills/**, supabase/config.toml et l'automatisation Guardian nécessitent une revue humaine explicite.
human_approval_required doit rester vrai.
Réponds en français technique et opérationnel.`;

  const openAIResponse = await createOpenAIResponse({
    model,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          request: prompt,
          incident: context.incident,
          function_name: context.function_name,
          events: context.events,
          audit_logs: context.audit_logs,
          previous_assessments: context.previous_assessments,
          verifications: context.verifications,
        }),
      },
    ],
    maxOutputTokens: 3600,
    reasoning: { effort: "high" },
    jsonSchema: {
      name: "tok_guardian_assessment",
      description:
        "Evidence-based incident assessment with tests and rollback.",
      schema: OUTPUT_SCHEMA,
    },
  });

  const assessment = normalizeAssessment(
    parseStructuredOutput<GuardianAssessment>(openAIResponse),
  );
  assessment.human_approval_required = true;
  const usage = extractUsage(openAIResponse);

  const { data: stored, error } = await actor.adminClient
    .from("ops_guardian_assessments")
    .insert({
      incident_id: incidentId,
      requested_by: actor.userId,
      status: "completed",
      severity: assessment.severity,
      risk_level: assessment.risk_level,
      confidence: assessment.confidence,
      assessment,
      model,
      usage,
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);

  await actor.adminClient.from("ops_incident_events").insert({
    incident_id: incidentId,
    event_type: "guardian_assessed",
    actor: actor.userId,
    payload: {
      assessment_id: stored.id,
      severity: assessment.severity,
      risk_level: assessment.risk_level,
      confidence: assessment.confidence,
      human_approval_required: true,
    },
  });

  await recordUsage(actor, {
    status: "success",
    action: "analyze",
    incidentId,
    assessmentId: stored.id,
    model,
    usage,
    metadata: {
      severity: assessment.severity,
      risk_level: assessment.risk_level,
    },
  });

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: FUNCTION_NAME,
    status: "success",
    action: "analyze",
    actor,
    request,
    targetEntityType: "ops_guardian_assessments",
    targetEntityId: stored.id,
    metadata: {
      incident_id: incidentId,
      severity: assessment.severity,
      risk_level: assessment.risk_level,
    },
  });

  return {
    assessment: stored,
    result: assessment,
    function_name: context.function_name,
  };
}

async function verifyIncident(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  incidentId: string,
  requestedFunctionName: string,
  observationStart: string | null,
  request: Request,
) {
  const { data: incident, error: incidentError } = await actor.adminClient
    .from("ops_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();
  if (incidentError) throw new HttpError(500, incidentError.message);
  if (!incident) throw new HttpError(404, "ops_incident_not_found");

  const functionName =
    sanitizeText(requestedFunctionName, 100).toLowerCase() ||
    findLikelyFunctionName(incident);
  const defaultStart =
    typeof incident.updated_at === "string"
      ? incident.updated_at
      : typeof incident.last_seen_at === "string"
      ? incident.last_seen_at
      : new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const parsedRequestedStart = observationStart
    ? Date.parse(observationStart)
    : Number.NaN;
  const startedAt = Number.isFinite(parsedRequestedStart)
    ? new Date(parsedRequestedStart).toISOString()
    : defaultStart;

  const { data: pending, error: pendingError } = await actor.adminClient
    .from("ops_guardian_verifications")
    .insert({
      incident_id: incidentId,
      requested_by: actor.userId,
      status: "pending",
      function_name: functionName,
      observation_started_at: startedAt,
      checks: {},
    })
    .select("*")
    .single();
  if (pendingError) throw new HttpError(500, pendingError.message);

  let query = actor.adminClient
    .from("edge_function_audit_logs")
    .select(
      "function_name, action, status, error_message, request_metadata, created_at",
    )
    .gte("created_at", startedAt)
    .order("created_at", { ascending: false })
    .limit(800);
  if (functionName) query = query.eq("function_name", functionName);

  const { data: auditRows, error: auditError } = await query;
  if (auditError) {
    await actor.adminClient
      .from("ops_guardian_verifications")
      .update({
        status: "failed",
        observation_ended_at: new Date().toISOString(),
        checks: { error: auditError.message },
      })
      .eq("id", pending.id);
    throw new HttpError(500, auditError.message);
  }

  const rows = (auditRows || []) as AuditRow[];
  const failures = rows.filter((row) => row.status === "failure");
  const successes = rows.filter((row) => row.status === "success");
  const lastFailure = failures
    .slice()
    .sort((left, right) => parseTime(right.created_at) - parseTime(left.created_at))[0];
  const lastSuccess = successes
    .slice()
    .sort((left, right) => parseTime(right.created_at) - parseTime(left.created_at))[0];
  const hasRecovery =
    Boolean(lastSuccess) &&
    (!lastFailure ||
      parseTime(lastSuccess.created_at) > parseTime(lastFailure.created_at));
  const status =
    rows.length === 0
      ? "degraded"
      : failures.length === 0 || hasRecovery
      ? "healthy"
      : "degraded";
  const endedAt = new Date().toISOString();
  const checks = {
    function_name: functionName,
    audit_rows: rows.length,
    success_count: successes.length,
    failure_count: failures.length,
    last_success_at: lastSuccess?.created_at || null,
    last_failure_at: lastFailure?.created_at || null,
    last_error: sanitizeText(lastFailure?.error_message, 300) || null,
    recovered_after_last_failure: hasRecovery,
    no_failure_after_recovery:
      hasRecovery &&
      !failures.some(
        (row) =>
          parseTime(row.created_at) > parseTime(lastSuccess?.created_at),
      ),
    incident_status: incident.status,
    automatic_resolution_performed: false,
  };

  const { data: verification, error: verificationError } =
    await actor.adminClient
      .from("ops_guardian_verifications")
      .update({
        status,
        observation_ended_at: endedAt,
        checks,
      })
      .eq("id", pending.id)
      .select("*")
      .single();
  if (verificationError) {
    throw new HttpError(500, verificationError.message);
  }

  await actor.adminClient.from("ops_incident_events").insert({
    incident_id: incidentId,
    event_type: "guardian_verified",
    actor: actor.userId,
    payload: {
      verification_id: verification.id,
      status,
      function_name: functionName,
      automatic_resolution_performed: false,
    },
  });

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: FUNCTION_NAME,
    status: "success",
    action: "verify",
    actor,
    request,
    targetEntityType: "ops_guardian_verifications",
    targetEntityId: verification.id,
    metadata: {
      incident_id: incidentId,
      verification_status: status,
      function_name: functionName,
      automatic_resolution_performed: false,
    },
  });

  return { verification, checks };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action = "overview";
  let incidentId: string | null = null;
  let assessmentId: string | null = null;
  const model = selectTokAiModel("admin_report");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["admin"]);

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    incidentId = maybeUuid(body.incidentId);
    const prompt = sanitizeMultilineText(body.prompt, 3000);
    const functionName = sanitizeText(body.functionName, 100);
    const observationStart = sanitizeText(body.observationStart, 80) || null;

    const limiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await limiter.consume(`admin:${actor.userId}`, {
      maxRequests: 40,
      windowSeconds: 3600,
    });
    await limiter.consume("global", {
      maxRequests: 160,
      windowSeconds: 60,
    });

    if (action === "overview") {
      return jsonResponse(await getOverview(actor), 200, cors);
    }

    if (!incidentId) throw new HttpError(400, "incident_id_required");

    if (action === "analyze") {
      const result = await analyzeIncident(actor, incidentId, prompt, req);
      assessmentId = result.assessment.id;
      return jsonResponse(result, 200, cors);
    }

    if (action === "verify") {
      return jsonResponse(
        await verifyIncident(
          actor,
          incidentId,
          functionName,
          observationStart,
          req,
        ),
        200,
        cors,
      );
    }

    throw new HttpError(400, "unsupported_action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = safeErrorMessage(error);
    log.error("request_failed", {
      action,
      incident_id: incidentId,
      status,
      message,
    });

    if (actor) {
      await recordUsage(actor, {
        status: "failure",
        action,
        incidentId,
        assessmentId,
        model,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action,
        actor,
        request: req,
        targetEntityType: incidentId ? "ops_incidents" : null,
        targetEntityId: incidentId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
