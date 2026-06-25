import { getSupabase } from "@/integrations/supabase/client";
import type { TokImageOutputResolution } from "@/lib/ai/imagePricing";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken, invokeSupabaseFunction } from "@/lib/session";

const supabase = getSupabase();

// Centralized TOK AI frontend client. OpenAI secrets stay server-side in Supabase Edge Functions.
type JsonRecord = Record<string, unknown>;

export type TokAiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClientSupportRequest = {
  messages: TokAiMessage[];
  conversationId?: string | null;
  orderId?: string | null;
  reservationId?: string | null;
  restaurantId?: string | null;
  context?: JsonRecord;
};

export type ClientSupportConversation = {
  id: string;
  scope: "client" | "restaurant" | "admin" | "image";
  title: string | null;
  status: string;
  support_incident_id: string | null;
  restaurant_id: string | null;
  order_id: string | null;
  reservation_id: string | null;
  metadata: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

export type ClientSupportConversationMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: JsonRecord | null;
  created_at: string;
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

export type RestaurantAdvisorStreamRequest = {
  restaurantId: string;
  messages: TokAiMessage[];
  onDelta: (content: string) => void;
};

export type TokImageFormat = "landscape" | "square" | "portrait";

export type TokImageGenerationRequest = {
  restaurantId: string;
  sourceImageUrl?: string | null;
  referenceImageUrls?: string[];
  dishName?: string | null;
  prompt: string;
  assetType?: "menu_visual" | "campaign_visual" | "banner" | "image";
  format?: TokImageFormat;
  outputResolution?: TokImageOutputResolution;
  variantCount?: number;
  generateImage?: boolean;
  imageOnly?: boolean;
  marketingAssetMode?: boolean;
};

export type TokImageGenerationResult = {
  title: string;
  enhanced_prompt: string;
  edit_instructions: string;
  alt_text: string;
  publication_caption: string;
  checklist: string[];
  style_tags: string[];
  safety_notes: string[];
  marketing_angles: string[];
  assetId: string;
  generated_image_url: string | null;
  gallery_image_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  gallery_storage_bucket: string | null;
  gallery_storage_path: string | null;
  model: string;
  output_resolution?: TokImageOutputResolution;
  output_size?: string;
  output_quality?: "low" | "medium" | "high";
  credit_units?: number;
  estimated_cost_chf?: number;
  image_mode?: "interactive_fast" | "configured";
  reference_folder: string;
  status: "generated" | "stored";
};

export type AccountingAgentRequest = {
  action: "monthly_summary" | "invoice_anomalies" | "revenue_forecast" | "margin_review";
  month: string;
  restaurantId?: string | null;
  restaurantName?: string | null;
};

export type AccountingAgentResult = {
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
};

export type AccountingInsightRow = {
  id: string;
  restaurant_id: string | null;
  user_id: string | null;
  period_start: string;
  period_end: string;
  summary: string;
  anomalies: Array<{ label: string; severity?: string; evidence?: string }>;
  forecast: JsonRecord;
  margin_snapshot: JsonRecord;
  model: string | null;
  source: string;
  metadata: JsonRecord;
  created_at: string;
};

export type AdminMonitorRequest = {
  action: "health" | "security" | "costs" | "incidents" | "full_report";
  restaurantId?: string | null;
};

export type AdminDashboardChatRequest = {
  messages: TokAiMessage[];
  conversationId?: string | null;
  context?: JsonRecord;
};

export type AdminDashboardChatResult = {
  reply: string;
  cited_sources: string[];
  risk_level: "info" | "attention" | "critical";
  suggested_actions: string[];
  data_window: string;
  conversationId: string;
  model: string;
};

export type RestaurantAiSubscription = {
  id: string;
  restaurant_id: string;
  plan: "starter" | "pro" | "premium" | "elite" | "custom";
  status: "trialing" | "active" | "past_due" | "paused" | "cancelled";
  monthly_conversation_limit: number;
  monthly_text_tool_limit: number;
  monthly_image_limit: number;
  monthly_premium_image_limit: number;
  monthly_voice_minutes_limit: number;
  current_period_start: string;
  current_period_end: string;
  metadata?: JsonRecord | null;
};

async function invokeTokAiFunction<T>(functionName: string, body: JsonRecord): Promise<T> {
  const { data, error } = await invokeSupabaseFunction<T>(functionName, { body });

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

export async function getClientSupportConversations(limit = 20) {
  const { data, error } = await (supabase.from as any)("ai_conversations")
    .select(`
      id,
      scope,
      title,
      status,
      support_incident_id,
      restaurant_id,
      order_id,
      reservation_id,
      metadata,
      created_at,
      updated_at
    `)
    .in("scope", ["client", "restaurant", "admin"])
    .contains("metadata", { endpoint: "ai-client-support" })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ClientSupportConversation[];
}

export async function getClientSupportConversationMessages(conversationId: string, limit = 100) {
  const { data, error } = await (supabase.from as any)("ai_messages")
    .select("id, conversation_id, role, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ClientSupportConversationMessage[];
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

export async function streamRestaurantAdvisor(request: RestaurantAdvisorStreamRequest) {
  const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/restaurant-advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantId: request.restaurantId,
      messages: request.messages,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `Erreur ${response.status}` }));
    throw new Error(typeof payload?.error === "string" ? payload.error : `Erreur ${response.status}`);
  }
  if (!response.body) throw new Error("Pas de reponse du serveur");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  const parseLine = (rawLine: string) => {
    let line = rawLine;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith(":") || line.trim() === "") return true;
    if (!line.startsWith("data: ")) return true;

    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") {
      streamDone = true;
      return true;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const content = parsed.choices?.[0]?.delta?.content as string | undefined;
      if (content) request.onDelta(content);
      return true;
    } catch {
      return false;
    }
  };

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      const line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (!parseLine(line)) {
        textBuffer = `${line}\n${textBuffer}`;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (const line of textBuffer.split("\n")) {
      parseLine(line);
    }
  }
}

export function generateTokDishImage(request: TokImageGenerationRequest) {
  return invokeTokAiFunction<TokImageGenerationResult>("ai-image-enhance", {
    ...request,
    assetType: request.assetType || "menu_visual",
    format: request.format || "landscape",
    outputResolution: request.outputResolution || "studio",
    variantCount: request.variantCount || 1,
    generateImage: request.generateImage !== false,
  });
}

export function runAccountingAgent(request: AccountingAgentRequest) {
  return invokeTokAiFunction<AccountingAgentResult>("ai-accounting-agent", { ...request });
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
    verificationSummary?: string;
    logVerification?: JsonRecord;
    recoveredFunctionErrors?: JsonRecord[];
    checkedAt?: string;
    adminEventId: string;
  }>("ai-admin-monitor", { ...request });
}

export function askAdminDashboardChat(request: AdminDashboardChatRequest) {
  return invokeTokAiFunction<AdminDashboardChatResult>("ai-admin-dashboard-chat", {
    action: "chat",
    ...request,
  });
}

export async function getAdminDashboardChatConversations(limit = 20) {
  const result = await invokeTokAiFunction<{ conversations: ClientSupportConversation[] }>("ai-admin-dashboard-chat", {
    action: "history",
    limit,
  });

  return result.conversations || [];
}

export async function getAdminDashboardChatMessages(conversationId: string) {
  const result = await invokeTokAiFunction<{ messages: ClientSupportConversationMessage[] }>("ai-admin-dashboard-chat", {
    action: "messages",
    conversationId,
  });

  return result.messages || [];
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

export async function getAiSubscriptionForRestaurant(restaurantId: string) {
  const { data, error } = await (supabase.from as any)("restaurant_ai_subscriptions")
    .select(`
      id,
      restaurant_id,
      plan,
      status,
      monthly_conversation_limit,
      monthly_text_tool_limit,
      monthly_image_limit,
      monthly_premium_image_limit,
      monthly_voice_minutes_limit,
      current_period_start,
      current_period_end,
      metadata
    `)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) throw error;
  return data as RestaurantAiSubscription | null;
}

export async function getAccountingInsightsForRestaurant(restaurantId: string, limit = 6) {
  const { data, error } = await (supabase.from as any)("ai_accounting_insights")
    .select(`
      id,
      restaurant_id,
      user_id,
      period_start,
      period_end,
      summary,
      anomalies,
      forecast,
      margin_snapshot,
      model,
      source,
      metadata,
      created_at
    `)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as AccountingInsightRow[];
}
