import { SUPABASE_URL } from "@/lib/env";
import { getSupabase } from "@/integrations/supabase/client";

export type TokAiFunctionName =
  | "ai-client-support"
  | "ai-restaurant-agent"
  | "ai-accounting-agent"
  | "ai-admin-monitor";

export type TokAiSupportMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TokAiSupportRequest = {
  messages: TokAiSupportMessage[];
  orderId?: string | null;
  reservationId?: string | null;
  restaurantId?: string | null;
  context?: Record<string, unknown>;
};

export type TokAiRestaurantAction =
  | "general"
  | "menu_optimizer"
  | "photo_enhancer"
  | "marketing_campaign"
  | "sales_insights"
  | "promotions"
  | "review_reply";

export type TokAiRestaurantRequest = {
  restaurantId: string;
  action: TokAiRestaurantAction;
  prompt?: string;
  message?: string;
  context?: Record<string, unknown>;
};

export type TokAiAccountingRequest = {
  restaurantId?: string | null;
  periodStart?: string;
  periodEnd?: string;
  prompt?: string;
  context?: Record<string, unknown>;
};

export type TokAiAdminMonitorRequest = {
  scope?: "platform" | "restaurant" | "function";
  restaurantId?: string | null;
  functionName?: string | null;
  prompt?: string;
  context?: Record<string, unknown>;
};

export type TokAiUsageRow = {
  feature_name: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_chf: number;
};

export type TokAiResponse<T = Record<string, unknown>> = T & {
  error?: string;
  rid?: string;
};

function buildFunctionUrl(functionName: TokAiFunctionName) {
  return `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

async function invokeTokAiFunction<T>(functionName: TokAiFunctionName, payload: Record<string, unknown>) {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("Vous devez être connecté pour utiliser l'agent IA TOK.");
  }

  const response = await fetch(buildFunctionUrl(functionName), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as TokAiResponse<T>;

  if (!response.ok) {
    const reason = typeof data.error === "string" ? data.error : "ai_request_failed";
    throw new Error(reason);
  }

  return data as T;
}

export async function askClientSupport(payload: TokAiSupportRequest) {
  return invokeTokAiFunction("ai-client-support", payload as Record<string, unknown>);
}

export async function runRestaurantAgent(payload: TokAiRestaurantRequest) {
  return invokeTokAiFunction("ai-restaurant-agent", payload as Record<string, unknown>);
}

export async function runAccountingAgent(payload: TokAiAccountingRequest = {}) {
  return invokeTokAiFunction("ai-accounting-agent", payload as Record<string, unknown>);
}

export async function runAdminMonitor(payload: TokAiAdminMonitorRequest = {}) {
  return invokeTokAiFunction("ai-admin-monitor", payload as Record<string, unknown>);
}

export function estimateAiCost(inputTokens = 0, outputTokens = 0, model = "gpt-5.4-mini") {
  const miniInput = 0.00000075;
  const miniOutput = 0.0000045;
  const strategicInput = 0.000005;
  const strategicOutput = 0.00003;
  const isStrategic = model.includes("5.5") || model.includes("strategic");

  const usd = inputTokens * (isStrategic ? strategicInput : miniInput) + outputTokens * (isStrategic ? strategicOutput : miniOutput);
  const chf = usd * 0.9;
  return Number(chf.toFixed(6));
}

export async function getAiUsageForRestaurant(restaurantId: string, since?: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_restaurant_ai_usage", {
    p_restaurant_id: restaurantId,
    ...(since ? { p_since: since } : {}),
  });

  if (error) throw error;
  return (data || []) as TokAiUsageRow[];
}
