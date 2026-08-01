export const TOK_OPENAI_USD_TO_CHF_RATE = 0.81;
export const TOK_OPENAI_COST_CHF_PER_CREDIT = 0.009;

type TextModelPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  outputUsdPerMillion: number;
};

const TEXT_MODEL_PRICING: Record<string, TextModelPricing> = {
  "gpt-5.6-sol": { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  "gpt-5.6-terra": { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  "gpt-5.6-luna": { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 6 },
  "gpt-5.5": { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  "gpt-5.5-pro": { inputUsdPerMillion: 30, outputUsdPerMillion: 180 },
  "gpt-5.4": { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  "gpt-5.4-mini": { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
  "gpt-5.4-nano": { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.25 },
  "gpt-5": { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  "gpt-5-mini": { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2 },
  "gpt-5-nano": { inputUsdPerMillion: 0.05, cachedInputUsdPerMillion: 0.005, outputUsdPerMillion: 0.4 },
  "gpt-4.1": { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 8 },
  "gpt-4.1-mini": { inputUsdPerMillion: 0.4, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 1.6 },
  "gpt-4.1-nano": { inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 0.4 },
  "gpt-4o": { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  "gpt-4o-mini": { inputUsdPerMillion: 0.15, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 0.6 },
};

function normalizeModelName(model: string | null | undefined) {
  return String(model || "").trim().toLowerCase();
}

export function getOpenAITextModelPricing(model: string | null | undefined) {
  const normalized = normalizeModelName(model);
  if (TEXT_MODEL_PRICING[normalized]) return TEXT_MODEL_PRICING[normalized];

  const knownPrefix = Object.keys(TEXT_MODEL_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`));

  return knownPrefix ? TEXT_MODEL_PRICING[knownPrefix]! : TEXT_MODEL_PRICING["gpt-5.5"]!;
}

export function estimateOpenAITextCostChf(
  model: string | null | undefined,
  inputTokens = 0,
  outputTokens = 0,
) {
  const pricing = getOpenAITextModelPricing(model);
  const input = Math.max(0, Number(inputTokens) || 0);
  const output = Math.max(0, Number(outputTokens) || 0);
  const costUsd =
    (input * pricing.inputUsdPerMillion / 1_000_000)
    + (output * pricing.outputUsdPerMillion / 1_000_000);

  return Number((costUsd * TOK_OPENAI_USD_TO_CHF_RATE).toFixed(6));
}

export function getTokAiCreditUnitsFromCostChf(estimatedCostChf: number, minimumCredits = 1) {
  const minimum = Math.max(1, Math.ceil(Number(minimumCredits) || 1));
  const cost = Math.max(0, Number(estimatedCostChf) || 0);
  return Math.max(minimum, Math.ceil(cost / TOK_OPENAI_COST_CHF_PER_CREDIT));
}

export function getOpenAITextCreditUnits(
  model: string | null | undefined,
  inputTokens = 0,
  outputTokens = 0,
  minimumCredits = 1,
) {
  const input = Math.max(0, Number(inputTokens) || 0);
  const output = Math.max(0, Number(outputTokens) || 0);
  if (input === 0 && output === 0) return 0;
  return getTokAiCreditUnitsFromCostChf(
    estimateOpenAITextCostChf(model, input, output),
    minimumCredits,
  );
}
