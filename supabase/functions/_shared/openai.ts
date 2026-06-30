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
};

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

  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpError(429, "ai_rate_limited");
    }

    if (response.status === 402) {
      throw new HttpError(402, "ai_credits_exhausted");
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

export function parseStructuredOutput<T>(data: unknown): T {
  const parsedOutput = findParsedStructuredOutput(data);
  if (parsedOutput !== null) {
    return parsedOutput as T;
  }

  const text = extractOutputText(data);
  if (!text) {
    throw new HttpError(502, "ai_empty_response");
  }

  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new HttpError(502, "ai_invalid_response");
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
