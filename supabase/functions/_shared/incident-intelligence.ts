export type IncidentRepairability =
  | "code"
  | "configuration"
  | "data"
  | "third_party"
  | "transient"
  | "expected_business_rule"
  | "unknown";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentRoutingDecision = {
  repairability: IncidentRepairability;
  reason: string;
  confidence: number;
  codexEligible: boolean;
  sensitive: boolean;
};

type IncidentEvidenceInput = {
  source?: unknown;
  severity?: unknown;
  title?: unknown;
  summary?: unknown;
  technicalDetails?: unknown;
  context?: unknown;
};

type DeepAnalysisDecisionInput = {
  force?: boolean;
  severity?: unknown;
  repairability?: unknown;
  confidence?: unknown;
  sensitive?: boolean;
  evidenceChanged?: boolean;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const LONG_NUMBER = /\b\d{5,}\b/g;
const WHITESPACE = /\s+/g;

function normalizeText(value: unknown, maxLength = 4_000) {
  return typeof value === "string"
    ? value
      .toLowerCase()
      .replace(UUID, "<uuid>")
      .replace(LONG_NUMBER, "<number>")
      .replace(WHITESPACE, " ")
      .trim()
      .slice(0, maxLength)
    : "";
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  return value === "critical" || value === "high" || value === "low"
    ? value
    : "medium";
}

function collectEvidenceStrings(
  value: unknown,
  output: string[] = [],
  depth = 0,
): string[] {
  if (output.length >= 140 || depth > 5 || value === null || value === undefined) {
    return output;
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value, 1_200);
    if (normalized) output.push(normalized);
    return output;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 40)) {
      collectEvidenceStrings(entry, output, depth + 1);
      if (output.length >= 140) break;
    }
    return output;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 80);
    for (const [key, entry] of entries) {
      output.push(normalizeText(key, 120));
      collectEvidenceStrings(entry, output, depth + 1);
      if (output.length >= 140) break;
    }
  }

  return output;
}

function canonicalize(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[depth-limited]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return normalizeText(value, 8_000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((entry) => canonicalize(entry, depth + 1));
  }
  if (typeof value !== "object") return normalizeText(String(value), 1_000);

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 120)) {
    output[key.slice(0, 160)] = canonicalize(entry, depth + 1);
  }
  return output;
}

export async function buildStableEvidenceHash(value: unknown) {
  const canonical = JSON.stringify(canonicalize(value)).slice(0, 120_000);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function buildIncidentEvidenceEnvelope(input: IncidentEvidenceInput) {
  return {
    source: normalizeText(input.source, 120),
    severity: normalizeSeverity(input.severity),
    title: normalizeText(input.title, 500),
    summary: normalizeText(input.summary, 4_000),
    technical_details: canonicalize(input.technicalDetails),
    sanitized_context: canonicalize(input.context),
  };
}

export function buildIncidentEvidenceHash(input: IncidentEvidenceInput) {
  return buildStableEvidenceHash(buildIncidentEvidenceEnvelope(input));
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyIncidentRepairability(
  input: IncidentEvidenceInput,
): IncidentRoutingDecision {
  const source = normalizeText(input.source, 120);
  const severity = normalizeSeverity(input.severity);
  const context = input.context && typeof input.context === "object"
    ? input.context as Record<string, unknown>
    : {};
  const technical = input.technicalDetails && typeof input.technicalDetails === "object"
    ? input.technicalDetails as Record<string, unknown>
    : {};
  const evidenceText = collectEvidenceStrings({
    source,
    title: input.title,
    summary: input.summary,
    technical,
    context,
  }).join(" | ");

  const sourceFiles = Array.isArray(context.source_files)
    ? context.source_files.filter((value) => typeof value === "string")
    : [];
  const errorSites = Array.isArray(context.error_code_sites)
    ? context.error_code_sites
    : [];
  const hasCodeEvidence =
    source === "github_actions" ||
    sourceFiles.length > 0 ||
    errorSites.length > 0 ||
    typeof technical.stack === "string";
  const sensitive = containsAny(evidenceText, [
    /payment|stripe|checkout|refund|invoice|billing|compta/,
    /auth|rls|role|permission|security|secret|token|credential/,
    /migration|schema|database|postgres/,
  ]);

  if (containsAny(evidenceText, [
    /method_not_allowed|content_type_must_be_json|invalid_json_body/,
    /explicit_confirmation_required|financial_action_requires_manual_workflow/,
    /approval_expired|invalid_callback_data|request_body_too_large/,
    /unsupported_action|unsupported_workflow_status/,
    /expected_business_rule|validation_rejected_as_expected/,
  ])) {
    return {
      repairability: "expected_business_rule",
      reason: "Le signal correspond à un garde-fou ou à un rejet métier attendu.",
      confidence: 0.96,
      codexEligible: false,
      sensitive,
    };
  }

  if (containsAny(evidenceText, [
    /not_configured|configuration.*missing|missing.*configuration/,
    /bad credentials|invalid credential|domain.*unverified/,
    /resource not accessible by personal access token/,
    /missing secret|secret.*missing|environment variable.*missing/,
    /github_dispatch_failed:(401|403)|telegram_not_configured/,
  ])) {
    return {
      repairability: "configuration",
      reason: "La preuve pointe vers une configuration, un secret ou une autorisation externe à corriger.",
      confidence: 0.94,
      codexEligible: false,
      sensitive: true,
    };
  }

  if (hasCodeEvidence || containsAny(evidenceText, [
    /assertionerror|typeerror|referenceerror|syntaxerror/,
    /test.*failed|build.*failed|typecheck.*failed|lint.*failed/,
    /uncaught|stack trace|source_files|error_code_sites/,
  ])) {
    return {
      repairability: "code",
      reason: "La preuve contient un site de code, une stack ou un échec de validation reproductible.",
      confidence: sourceFiles.length > 0 || errorSites.length > 0 ? 0.9 : 0.78,
      codexEligible: true,
      sensitive,
    };
  }

  if (containsAny(evidenceText, [
    /duplicate key|foreign key|constraint violation|sqlstate/,
    /row not found|record not found|invalid state|state transition/,
    /schema cache|pgrst|data inconsistency|orphaned/,
  ])) {
    return {
      repairability: "data",
      reason: "Le signal indique une incohérence de données ou d’état qui exige une vérification métier avant tout patch.",
      confidence: 0.76,
      codexEligible: false,
      sensitive,
    };
  }

  if (containsAny(evidenceText, [
    /stripe|resend|telegram|github|google actions center|firebase/,
    /provider.*(unavailable|error|rejected)|third[_ -]?party/,
    /upstream.*(error|unavailable)|external service/,
  ])) {
    return {
      repairability: "third_party",
      reason: "La panne dépend principalement d’un fournisseur ou d’une API externe.",
      confidence: 0.72,
      codexEligible: false,
      sensitive,
    };
  }

  if (containsAny(evidenceText, [
    /timeout|timed out|rate[_ -]?limited|too many requests/,
    /connection reset|network error|dns|temporary|transient/,
    /service unavailable|gateway timeout|http 429|http 503|http 504/,
  ])) {
    return {
      repairability: "transient",
      reason: "Le signal ressemble à une panne temporaire ; une nouvelle observation doit confirmer sa persistance.",
      confidence: severity === "critical" ? 0.58 : 0.7,
      codexEligible: false,
      sensitive,
    };
  }

  return {
    repairability: "unknown",
    reason: "Les preuves disponibles ne permettent pas encore de choisir entre code, configuration, données ou fournisseur.",
    confidence: 0.35,
    codexEligible: false,
    sensitive,
  };
}

export function shouldUseDeepIncidentAnalysis(
  input: DeepAnalysisDecisionInput,
) {
  if (input.force === true || input.evidenceChanged === true) return true;

  const severity = normalizeSeverity(input.severity);
  const repairability = normalizeText(input.repairability, 80) as IncidentRepairability;
  const confidence = Number(input.confidence);
  const normalizedConfidence = Number.isFinite(confidence) ? confidence : 0;

  if (repairability === "unknown") return true;
  if (input.sensitive === true) return true;
  if (severity === "critical") return true;
  if (severity === "high" && normalizedConfidence < 0.8) return true;
  return normalizedConfidence < 0.55;
}

function messageIdentity(message: Record<string, unknown>, index: number) {
  const id = typeof message.id === "string" ? message.id : "";
  if (id) return id;
  return [
    String(message.created_at || ""),
    String(message.author_role || ""),
    String(message.body || "").slice(0, 100),
    String(index),
  ].join("|");
}

export function selectSupportMessages(
  rawMessages: Array<Record<string, unknown>>,
  maxMessages = 28,
) {
  const normalized = rawMessages.map((message, index) => ({
    ...message,
    body: typeof message.body === "string" ? message.body.trim().slice(0, 1_200) : "",
    __index: index,
    __identity: messageIdentity(message, index),
  }));
  if (normalized.length <= maxMessages) {
    return normalized.map(({ __index: _index, __identity: _identity, ...message }) => message);
  }

  const selected = new Map<string, typeof normalized[number]>();
  const add = (message: typeof normalized[number] | undefined) => {
    if (message) selected.set(message.__identity, message);
  };

  normalized.slice(0, 4).forEach(add);
  normalized.slice(-12).forEach(add);

  const important = /(payment|paiement|stripe|refund|rembourse|reservation|réservation|order|commande|confirm|cancel|annul|error|erreur|allerg|medical|médical|fraud|fraude|urgent|legal|juridique|chargeback)/i;
  normalized
    .filter((message) => important.test(String(message.body || "")))
    .slice(-16)
    .forEach(add);

  const ordered = [...selected.values()]
    .sort((left, right) => left.__index - right.__index)
    .slice(-maxMessages);
  return ordered.map(({ __index: _index, __identity: _identity, ...message }) => message);
}

export function buildSupportMessageDigest(
  messages: Array<Record<string, unknown>>,
  selectedMessages: Array<Record<string, unknown>>,
) {
  const roles = new Map<string, number>();
  for (const message of messages) {
    const role = typeof message.author_role === "string" ? message.author_role : "unknown";
    roles.set(role, (roles.get(role) || 0) + 1);
  }

  return {
    total_messages: messages.length,
    selected_messages: selectedMessages.length,
    omitted_messages: Math.max(0, messages.length - selectedMessages.length),
    messages_by_role: Object.fromEntries(roles.entries()),
    first_message_at: messages[0]?.created_at || null,
    last_message_at: messages[messages.length - 1]?.created_at || null,
  };
}
