import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type JsonRecord = Record<string, unknown>;

export type TokAiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClientSupportRequest = {
  messages: TokAiMessage[];
  orderId?: string | null;
  reservationId?: string | null;
  restaurantId?: string | null;
  context?: JsonRecord;
};

export type RestaurantAgentAction =
  | "general"
  | "menu_optimizer"
  | "photo_enhancer"
  | "marketing_campaign"
  | "sales_insights"
  | "promotions"
  | "review_reply";

export type RestaurantAgentRequest = {
  restaurantId: string;
  action: RestaurantAgentAction;
  prompt: string;
  context?: JsonRecord;
};

export type AccountingAgentRequest = {
  action: "monthly_summary" | "invoice_anomalies" | "revenue_forecast" | "margin_review";
  month: string;
  restaurantId?: string | null;
};

export type AdminMonitorRequest = {
  action: "health" | "security" | "costs" | "incidents" | "full_report";
  restaurantId?: string | null;
};

async function getAuthorizationHeader() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Session utilisateur requise pour utiliser l'IA TOK.");
  }

  return { Authorization: `Bearer ${token}` };
}

async function invokeTokAiFunction<T>(functionName: string, body: JsonRecord): Promise<T> {
  const headers = await getAuthorizationHeader();
  const { data, error } = await supabase.functions.invoke(functionName, { body, headers });

  if (error) throw error;
  return data as T;
}

export function askClientSupport(request: ClientSupportRequest) {
  return invokeTokAiFunction<{
    reply: string;
    category: string;
    priority: "low" | "normal" | "high" | "urgent";
    status: "open" | "waiting_restaurant" | "waiting_tok" | "resolved" | "escalated";
    shouldEscalate: boolean;
    suggestedNextSteps: string[];
    conversationId: string;
    supportTicketId: string;
    supportIncidentId?: string | null;
  }>("ai-client-support", { ...request });
}

export function runRestaurantAgent(request: RestaurantAgentRequest) {
  return invokeTokAiFunction<{
    title: string;
    summary: string;
    markdown: string;
    recommended_actions: string[];
    warnings: string[];
    confidence: "low" | "medium" | "high";
    action: RestaurantAgentAction;
    featureName: string;
    conversationId: string;
    taskId: string;
    status: "draft";
    quota?: JsonRecord;
  }>("ai-restaurant-agent", { ...request });
}

export function runAccountingAgent(request: AccountingAgentRequest) {
  return invokeTokAiFunction<{
    summary: string;
    anomalies: Array<{ label: string; severity: "low" | "medium" | "high"; evidence: string }>;
    unpaid_invoices: string[];
    risky_restaurants: string[];
    revenue_forecast: string;
    margin_notes: string[];
    recommended_actions: string[];
    export_markdown: string;
    insightId: string;
    metrics?: JsonRecord;
  }>("ai-accounting-agent", { ...request });
}

export function runAdminMonitor(request: AdminMonitorRequest) {
  return invokeTokAiFunction<{
    title: string;
    healthScore: number;
    executive_summary: string;
    cost_summary: string;
    security_alerts: Array<{ label: string; severity: "low" | "medium" | "high" | "critical"; evidence: string }>;
    function_errors: string[];
    critical_tickets: string[];
    abusive_users: string[];
    repeated_incidents_restaurants: string[];
    average_response_time: string;
    human_escalation_rate: string;
    recommended_actions: string[];
    metrics?: JsonRecord;
    adminEventId: string;
  }>("ai-admin-monitor", { ...request });
}

export function estimateAiCost(inputTokens = 0, outputTokens = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001)).toFixed(6));
}

export async function getAiUsageForRestaurant(restaurantId: string, since?: string) {
  const { data, error } = await (supabase.rpc as any)("get_restaurant_ai_usage", {
    p_restaurant_id: restaurantId,
    p_since: since || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
  });

  if (error) throw error;
  return (data || []) as Array<{
    feature_name: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_chf: number;
  }>;
}
