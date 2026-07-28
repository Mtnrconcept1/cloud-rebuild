import { HttpError } from "./auth.ts";
export {
  TOK_OPENAI_COST_CHF_PER_CREDIT,
  TOK_OPENAI_USD_TO_CHF_RATE,
  estimateOpenAITextCostChf,
  getOpenAITextCreditUnits,
  getTokAiCreditUnitsFromCostChf,
} from "./ai-pricing.ts";

export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-5.5";
const TOK_AI_MINI_MODEL = Deno.env.get("OPENAI_MODEL_TOK_MINI")?.trim() || "gpt-5.4-mini";
const TOK_AI_STRATEGIC_MODEL = Deno.env.get("OPENAI_MODEL_TOK_STRATEGIC")?.trim() || "gpt-5.5";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_RESPONSE_TIMEOUT_MS = readBoundedTimeout(
  Deno.env.get("OPENAI_RESPONSE_TIMEOUT_MS"),
  45_000,
);

export type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

export type OpenAIJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
  strict?: boolean;
};

export type OpenAIResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAIRequestOptions = {
  input: OpenAIMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  jsonSchema?: OpenAIJsonSchema;
  tools?: Array<Record<string, unknown>>;
  include?: string[];
  reasoning?: Record<string, unknown>;
  timeoutMs?: number;
};

function readBoundedTimeout(raw: string | number | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(115_000, Math.max(5_000, Math.trunc(parsed)));
}

export type TokAiModelTask =
  | "support"
  | "support_complex"
  | "restaurant"
  | "strategy"
  | "accounting"
  | "admin_monitor"
  | "admin_report"
  | "image_economy"
  | "image_premium";

export function selectTokAiModel(
  task: TokAiModelTask,
  complexity: "standard" | "complex" = "standard",
) {
  if (complexity === "complex") return TOK_AI_STRATEGIC_MODEL;

  switch (task) {
    case "support":
      return TOK_AI_MINI_MODEL;
    case "support_complex":
      return TOK_AI_STRATEGIC_MODEL;
    case "restaurant":
      return TOK_AI_MINI_MODEL;
    case "strategy":
      return TOK_AI_STRATEGIC_MODEL;
    case "accounting":
      return TOK_AI_MINI_MODEL;
    case "admin_monitor":
      return TOK_AI_MINI_MODEL;
    case "admin_report":
      return TOK_AI_STRATEGIC_MODEL;
    case "image_economy":
      return Deno.env.get("OPENAI_MODEL_IMAGE_ECONOMY")?.trim() || TOK_AI_MINI_MODEL;
    case "image_premium":
      return Deno.env.get("OPENAI_MODEL_IMAGE_PREMIUM")?.trim() || TOK_AI_STRATEGIC_MODEL;
    default:
      return OPENAI_MODEL;
  }
}

function buildTextFormat(schema?: OpenAIJsonSchema) {
  if (!schema) return { format: { type: "text" } };

  return {
    format: {
      type: "json_schema",
      name: schema.name,
      description: schema.description,
      strict: schema.strict ?? true,
      schema: schema.schema,
    },
  };
}

export async function createOpenAIResponse(options: OpenAIRequestOptions) {
  if (!OPENAI_API_KEY) {
    throw new HttpError(503, "ai_service_unavailable");
  }

  const payload: Record<string, unknown> = {
    model: options.model || OPENAI_MODEL,
    input: options.input,
    store: false,
    text: buildTextFormat(options.jsonSchema),
  };

  if (options.maxOutputTokens) {
    payload.max_output_tokens = options.maxOutputTokens;
  }

  if (typeof options.temperature === "number") {
    payload.temperature = options.temperature;
  }

  if (options.tools?.length) {
    payload.tools = options.tools;
  }

  if (options.include?.length) {
    payload.include = options.include;
  }

  if (options.reasoning && Object.keys(options.reasoning).length > 0) {
    payload.reasoning = options.reasoning;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    readBoundedTimeout(options.timeoutMs, DEFAULT_RESPONSE_TIMEOUT_MS),
  );
  let response: Response;
  try {
    response = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(503, "ai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpError(429, "ai_rate_limited");
    }

    if (response.status === 402) {
      throw new HttpError(503, "ai_provider_billing_unavailable");
    }

    throw new HttpError(502, "ai_service_error");
  }

  return await response.json();
}

export function extractOutputText(data: unknown): string {
  const response = data as Record<string, unknown>;
  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;

    if (typeof content === "string") {
      parts.push(content);
      continue;
    }

    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.text === "string") {
        parts.push(record.text);
      }
      if (typeof record.output_text === "string") {
        parts.push(record.output_text);
      }
    }
  }

  return parts.join("").trim();
}

export function extractUsage(data: unknown): OpenAIResponseUsage {
  const usage = (data as Record<string, unknown>)?.usage;
  if (!usage || typeof usage !== "object") return {};

  const record = usage as Record<string, unknown>;
  const inputTokens = Number(record.input_tokens ?? 0);
  const outputTokens = Number(record.output_tokens ?? 0);
  const totalTokens = Number(record.total_tokens ?? inputTokens + outputTokens);

  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

/**
 * The envelope fields that explain an unusable response.
 *
 * A reasoning model bills its reasoning against max_output_tokens, so a long
 * reasoning pass can exhaust the budget and return zero output text. That is
 * indistinguishable from a provider outage unless status, incomplete_details and
 * the token split are recorded — which is exactly what the incident analyser
 * needs to name the fix instead of listing hypotheses. No prompt or completion
 * content is included.
 */
export function describeResponseEnvelope(data: unknown): Record<string, unknown> {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const usage = (record.usage && typeof record.usage === "object"
    ? record.usage
    : {}) as Record<string, unknown>;
  const outputDetails = (usage.output_tokens_details && typeof usage.output_tokens_details === "object"
    ? usage.output_tokens_details
    : {}) as Record<string, unknown>;
  const incomplete = (record.incomplete_details && typeof record.incomplete_details === "object"
    ? record.incomplete_details
    : {}) as Record<string, unknown>;
  const outputItems = Array.isArray(record.output) ? record.output : [];

  return {
    response_status: typeof record.status === "string" ? record.status : null,
    incomplete_reason: typeof incomplete.reason === "string" ? incomplete.reason : null,
    model: typeof record.model === "string" ? record.model : null,
    max_output_tokens: Number(record.max_output_tokens) || null,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    reasoning_tokens: Number(outputDetails.reasoning_tokens) || 0,
    output_item_types: outputItems
      .slice(0, 10)
      .map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).type ?? "") : ""))
      .filter(Boolean),
    refusal: outputItems.some((item) => {
      const content = (item as Record<string, unknown>)?.content;
      return Array.isArray(content)
        && content.some((entry) => (entry as Record<string, unknown>)?.type === "refusal");
    }),
  };
}

export function parseStructuredOutput<T>(data: unknown): T {
  const parsedOutput = findParsedStructuredOutput(data);
  if (parsedOutput !== null) {
    return parsedOutput as T;
  }

  const text = extractOutputText(data);
  if (!text) {
    throw new HttpError(502, "ai_empty_response", describeResponseEnvelope(data));
  }

  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // The model answered but the text is not the requested JSON. Recording the
    // shape — never the content — separates a truncated answer from a malformed
    // one without leaking the completion.
    throw new HttpError(502, "ai_invalid_response", {
      ...describeResponseEnvelope(data),
      text_length: text.length,
      candidate_length: candidate.length,
      candidate_starts_with: candidate.slice(0, 1),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findParsedStructuredOutput(data: unknown): unknown | null {
  if (!isRecord(data)) return null;

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const entry of content) {
      if (!isRecord(entry)) continue;
      for (const key of ["parsed", "json", "value"]) {
        const value = entry[key];
        if (isRecord(value) || Array.isArray(value)) return value;
      }
    }
  }

  return null;
}

function extractJsonCandidate(text: string) {
  const normalized = stripMarkdownCodeFence(text.trim());

  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    const embeddedJson = findBalancedJson(normalized);
    return embeddedJson || normalized;
  }
}

function stripMarkdownCodeFence(text: string) {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function findBalancedJson(text: string) {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) return "";

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return "";
      if (stack.length === 0) return text.slice(start, index + 1).trim();
    }
  }

  return "";
}
