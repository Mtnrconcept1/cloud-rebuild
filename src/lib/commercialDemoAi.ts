import { getSupabase } from "@/integrations/supabase/client";
import type {
  TokImageGenerationRequest,
  TokImageGenerationResult,
  TokAiMessage,
} from "@/lib/ai/tokAiClient";

const supabase = getSupabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CommercialDemoAiTool = "assistant" | "support_chat";
export type CommercialDemoAiSurface = "client" | "restaurant" | "courier";

export type CommercialDemoAiRuntime = {
  sessionId: string;
  surface: CommercialDemoAiSurface;
};

export type CommercialDemoAiConversation = {
  id: string;
  tool: CommercialDemoAiTool | "marketing_studio" | "photo_studio";
  surface: CommercialDemoAiSurface;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

type CommercialDemoAiResponse = {
  conversation_id: string;
  reply: string;
  tool: CommercialDemoAiTool;
  model: string;
  credit_units: number;
  estimated_cost_chf: number;
  created_at: string;
};

type CommercialDemoVisualResponse = {
  generation_id: string;
  tool?: "marketing_studio" | "photo_studio" | "advisor_visual";
  prompt?: string;
  output_svg: string;
  output_mime_type: "image/svg+xml";
  model: string;
  format: "landscape" | "square" | "portrait";
  width: number;
  height: number;
  credit_units: number;
  estimated_cost_chf: number;
  alt_text: string;
  style?: string | null;
  created_at: string;
};

export type CommercialDemoVisualHistoryTool = "marketing_studio" | "photo_studio" | "advisor_visual";
export type CommercialDemoVisualHistoryItem = TokImageGenerationResult & {
  created_at: string;
  prompt: string;
  tool: CommercialDemoVisualHistoryTool;
  style: string | null;
};

function isSurface(value: string | undefined): value is CommercialDemoAiSurface {
  return value === "client" || value === "restaurant" || value === "courier";
}

function assertRpcData<T>(value: unknown, label: string): T {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} n'a pas retourné de résultat exploitable.`);
  }
  return value as T;
}

export function getCommercialDemoAiRuntime(): CommercialDemoAiRuntime | null {
  if (typeof document === "undefined") return null;
  const root = document.documentElement;
  const sessionId = root.dataset.commercialDemoSessionId || "";
  const surface = root.dataset.commercialDemoFrame;
  if (!UUID_PATTERN.test(sessionId) || !isSurface(surface)) return null;
  return { sessionId, surface };
}

export async function askCommercialDemoAi(input: {
  runtime: CommercialDemoAiRuntime;
  tool: CommercialDemoAiTool;
  message: string;
  conversationId?: string | null;
  context?: Record<string, unknown>;
}) {
  const { data, error } = await (supabase.rpc as any)("commercial_demo_ai_respond", {
    p_session_id: input.runtime.sessionId,
    p_tool: input.tool,
    p_message: input.message,
    p_conversation_id: input.conversationId || null,
    p_surface: input.runtime.surface,
    p_context: input.context || {},
  });
  if (error) throw error;
  const result = assertRpcData<CommercialDemoAiResponse>(data, "L'assistant de démonstration");
  if (!UUID_PATTERN.test(String(result.conversation_id || "")) || typeof result.reply !== "string") {
    throw new Error("Réponse invalide de l'assistant de démonstration.");
  }
  return result;
}

export async function getCommercialDemoAiHistory(
  runtime: CommercialDemoAiRuntime,
  tool?: CommercialDemoAiConversation["tool"],
) {
  const { data, error } = await (supabase.rpc as any)("commercial_demo_ai_history", {
    p_session_id: runtime.sessionId,
    p_tool: tool || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data as CommercialDemoAiConversation[] : [];
}

export async function archiveCommercialDemoAiConversation(
  runtime: CommercialDemoAiRuntime,
  conversationId: string,
) {
  if (!UUID_PATTERN.test(conversationId)) return false;
  const { data, error } = await (supabase.rpc as any)("commercial_demo_ai_archive_conversation", {
    p_session_id: runtime.sessionId,
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data === true;
}

function svgDataUrl(svg: string) {
  if (!svg.startsWith("<svg") || svg.length > 200_000) {
    throw new Error("Le visuel de démonstration retourné est invalide.");
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function generateCommercialDemoVisual(
  runtime: CommercialDemoAiRuntime,
  request: TokImageGenerationRequest,
): Promise<TokImageGenerationResult> {
  const { data, error } = await (supabase.rpc as any)("commercial_demo_ai_generate_visual", {
    p_session_id: runtime.sessionId,
    p_prompt: request.prompt,
    p_format: request.format || "landscape",
    p_style: request.styleMode || (request.marketingAssetMode ? "premium" : "creative"),
    p_context: {
      headline: request.dishName || "UNE EXPÉRIENCE À DÉCOUVRIR",
      subheadline: request.prompt.slice(0, 150),
      cta: "RÉSERVER SUR TOK",
      asset_type: request.assetType || "campaign_visual",
      reference_count: request.referenceImageUrls?.length || 0,
      primary_color: request.demoReferencePalette?.primaryColor || null,
      secondary_color: request.demoReferencePalette?.secondaryColor || null,
      background_color: request.demoReferencePalette?.backgroundColor || null,
      reference_fingerprint: request.demoReferencePalette?.fingerprint || "",
      reference_label: request.demoReferencePalette?.label || "",
    },
  });
  if (error) throw error;
  const result = assertRpcData<CommercialDemoVisualResponse>(data, "Le Studio Marketing de démonstration");
  if (!UUID_PATTERN.test(String(result.generation_id || ""))) {
    throw new Error("Identifiant de génération de démonstration invalide.");
  }
  const outputUrl = svgDataUrl(String(result.output_svg || ""));
  return {
    title: request.dishName || "Visuel marketing de démonstration",
    enhanced_prompt: request.prompt,
    edit_instructions: "Visuel isolé généré sans API payante et sans modifier la galerie de production.",
    alt_text: result.alt_text,
    publication_caption: request.prompt.slice(0, 220),
    checklist: [
      "Restaurant de démonstration uniquement",
      "Aucun crédit TOK débité",
      "Aucun stockage de production modifié",
    ],
    style_tags: ["tok", "commercial-demo", "zero-cost"],
    safety_notes: ["Sortie SVG rendue comme image non exécutable par l'interface."],
    marketing_angles: ["Offre claire", "Appel à l'action TOK"],
    assetId: result.generation_id,
    generated_image_url: outputUrl,
    gallery_image_url: outputUrl,
    storage_bucket: null,
    storage_path: null,
    gallery_storage_bucket: null,
    gallery_storage_path: null,
    model: result.model || "tok-demo-zero-cost-v1",
    output_resolution: request.outputResolution || "studio",
    output_size: `${result.width}x${result.height}`,
    output_quality: "high",
    credit_units: 0,
    estimated_cost_chf: 0,
    image_mode: "configured",
    generation_seed: request.generationSeed || result.generation_id,
    created_at: result.created_at,
    reference_folder: "commercial-demo-isolated",
    status: "generated",
  };
}

function mapCommercialDemoVisualHistoryItem(result: CommercialDemoVisualResponse): CommercialDemoVisualHistoryItem {
  if (!UUID_PATTERN.test(String(result.generation_id || ""))) {
    throw new Error("Identifiant d'historique visuel de démonstration invalide.");
  }
  const prompt = typeof result.prompt === "string" ? result.prompt : "Visuel marketing de démonstration";
  const tool = result.tool === "photo_studio" || result.tool === "advisor_visual"
    ? result.tool
    : "marketing_studio";
  return {
    title: tool === "marketing_studio" ? "Visuel marketing de démonstration" : "Visuel photo de démonstration",
    enhanced_prompt: prompt,
    edit_instructions: "Création restaurée depuis les tables de démonstration isolées.",
    alt_text: result.alt_text || "Visuel de démonstration TOK",
    publication_caption: prompt.slice(0, 220),
    checklist: ["Historique Démo persistant", "Aucun crédit TOK débité", "Aucun Storage de production"],
    style_tags: ["tok", "commercial-demo", result.style || "zero-cost"],
    safety_notes: ["Sortie SVG encodée et rendue comme image."],
    marketing_angles: ["Démonstration commerciale"],
    assetId: result.generation_id,
    generated_image_url: svgDataUrl(String(result.output_svg || "")),
    gallery_image_url: svgDataUrl(String(result.output_svg || "")),
    storage_bucket: null,
    storage_path: null,
    gallery_storage_bucket: null,
    gallery_storage_path: null,
    model: result.model || "tok-demo-zero-cost-v1",
    output_resolution: "studio",
    output_size: `${Number(result.width) || 0}x${Number(result.height) || 0}`,
    output_quality: "high",
    credit_units: 0,
    estimated_cost_chf: 0,
    image_mode: "configured",
    generation_seed: result.generation_id,
    created_at: result.created_at,
    reference_folder: "commercial-demo-isolated",
    status: "generated",
    prompt,
    tool,
    style: result.style || null,
  };
}

export async function getCommercialDemoVisualHistory(
  runtime: CommercialDemoAiRuntime,
  tool?: CommercialDemoVisualHistoryTool,
  limit = 30,
) {
  const { data, error } = await (supabase.rpc as any)("commercial_demo_ai_generation_history", {
    p_session_id: runtime.sessionId,
    p_tool: tool || null,
    p_limit: Math.min(Math.max(Math.trunc(limit) || 30, 1), 60),
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((item) => mapCommercialDemoVisualHistoryItem(assertRpcData<CommercialDemoVisualResponse>(item, "L'historique visuel de démonstration")));
}

export function toTokAiMessages(messages: CommercialDemoAiConversation["messages"]): TokAiMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role as TokAiMessage["role"], content: message.content }));
}
