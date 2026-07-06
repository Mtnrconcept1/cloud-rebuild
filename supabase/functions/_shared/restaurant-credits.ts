import { EdgeSupabaseClient, HttpError } from "./auth.ts";
import { estimateOpenAITextCostChf, getTokAiCreditUnitsFromCostChf } from "./ai-pricing.ts";

export const TOK_CREDIT_EXHAUSTED_ERROR = "ai_credits_exhausted";

type CreditUsageRecord = {
  available_tok_credits?: unknown;
  available_total_credits?: unknown;
  available_credits?: unknown;
};

function readCreditUsageRecord(value: unknown): CreditUsageRecord {
  if (Array.isArray(value)) return readCreditUsageRecord(value[0]);
  if (value && typeof value === "object") return value as CreditUsageRecord;
  return {};
}

export function readRestaurantTokCreditBalance(value: unknown) {
  const record = readCreditUsageRecord(value);
  const balance = Number(
    record.available_tok_credits ?? record.available_total_credits ?? record.available_credits ?? 0,
  );

  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
}

export async function getRestaurantTokCreditBalance(
  adminClient: EdgeSupabaseClient,
  restaurantId: string,
) {
  const { data, error } = await adminClient.rpc("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw new HttpError(500, error.message);
  return readRestaurantTokCreditBalance(data);
}

export async function requireRestaurantTokCreditBalance(input: {
  adminClient: EdgeSupabaseClient;
  restaurantId: string;
  requiredCredits: number;
}) {
  const requiredCredits = Math.max(1, Math.ceil(Number(input.requiredCredits) || 1));
  const availableCredits = await getRestaurantTokCreditBalance(input.adminClient, input.restaurantId);

  if (availableCredits < requiredCredits) {
    throw new HttpError(402, TOK_CREDIT_EXHAUSTED_ERROR);
  }

  return {
    availableCredits,
    requiredCredits,
  };
}

export function estimateTextAiPreflightCredits(input: {
  model: string | null | undefined;
  input: unknown;
  maxOutputTokens?: number;
  minimumCredits?: number;
}) {
  const serializedInput = typeof input.input === "string" ? input.input : JSON.stringify(input.input ?? "");
  const inputTokens = Math.max(1, Math.ceil(serializedInput.length / 4));
  const outputTokens = Math.max(0, Math.ceil(Number(input.maxOutputTokens) || 0));

  return getTokAiCreditUnitsFromCostChf(
    estimateOpenAITextCostChf(input.model, inputTokens, outputTokens),
    input.minimumCredits ?? 1,
  );
}
