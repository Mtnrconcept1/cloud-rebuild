import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart3,
  Bot,
  Camera,
  History,
  Megaphone,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown, { defaultUrlTransform, type UrlTransform } from "react-markdown";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { AiLoadingState } from "@/components/ui/ai-loading-state";
import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  appendRestaurantAdvisorConversationMessages,
  archiveRestaurantAdvisorConversation,
  createRestaurantAdvisorConversation,
  getRestaurantAdvisorConversations,
  runRestaurantAgent,
  streamRestaurantAdvisor,
  type RestaurantAgentAction,
  type RestaurantAdvisorConversation,
} from "@/lib/ai/tokAiClient";
import {
  requestAiCreationNotificationPermission,
  setActiveAiCreationContext,
  startTokImageCreationJob,
} from "@/lib/ai/aiCreationJobs";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  archiveCommercialDemoAiConversation,
  askCommercialDemoAi,
  getCommercialDemoAiHistory,
  toTokAiMessages,
  type CommercialDemoAiRuntime,
} from "@/lib/commercialDemoAi";

type Message = { role: "user" | "assistant"; content: string };
type AdvisorSelectionMode = "gallery_photos" | "menu_dishes";
type AdvisorPhotoOption = {
  id: string;
  mediaUrl: string;
  altText: string | null;
  createdAt: string;
};
type AdvisorDishOption = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  price: number;
};
type AdvisorHistoryEntry = {
  id: string;
  backendConversationId?: string;
  restaurantId: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

type QuickTool = {
  icon: LucideIcon;
  label: string;
  prompt: string;
  selectionMode?: AdvisorSelectionMode;
} & (
  | { mode: "agent"; action: RestaurantAgentAction }
  | { mode: "image"; action: "image_enhance" }
);

type PreparedToolPayload = {
  prompt: string;
  selectedPhotos?: AdvisorPhotoOption[];
  selectedDishes?: AdvisorDishOption[];
  userInstructions?: string;
};

const supabase = getSupabase();
const ADVISOR_GALLERY_MEDIA_TYPES = ["photo", "photo_ai_tok"];
const ADVISOR_PHOTOS_LIMIT = 80;
const ADVISOR_MENU_ITEMS_LIMIT = 120;

const SUGGESTED_PROMPTS = [
  {
    icon: TrendingUp,
    label: "Analyser mes ventes",
    prompt: "Analyse mes ventes des 30 derniers jours et donne-moi des recommandations pour augmenter mon chiffre d'affaires.",
  },
  {
    icon: Star,
    label: "Ameliorer mes avis",
    prompt: "Analyse mes avis clients et propose des actions concretes pour ameliorer ma note et la satisfaction.",
  },
  {
    icon: BarChart3,
    label: "Optimiser mon menu",
    prompt: "Analyse mon menu, les prix, les photos et les categories, puis propose des optimisations pour augmenter le panier moyen.",
  },
  {
    icon: Megaphone,
    label: "ROI campagnes",
    prompt: "Analyse les performances de mes campagnes marketing et propose des ameliorations pour un meilleur ROI.",
  },
  {
    icon: Camera,
    label: "Audit photos",
    prompt: "Fais un audit de mes photos et de ma page restaurant. Que dois-je ameliorer pour attirer plus de clients ?",
  },
  {
    icon: Sparkles,
    label: "Plan d'action global",
    prompt: "Donne-moi un plan d'action complet et priorise pour optimiser mes performances sur la plateforme Tok.",
  },
];

const QUICK_TOOLS: QuickTool[] = [
  {
    icon: Sparkles,
    label: "Optimiser un plat",
    mode: "agent",
    action: "menu_optimizer",
    selectionMode: "menu_dishes",
    prompt: "Optimise la description, le positionnement prix et la mise en avant d'un plat prioritaire avec les donnees disponibles.",
  },
  {
    icon: Megaphone,
    label: "Creer une campagne",
    mode: "agent",
    action: "marketing_campaign",
    prompt: "Cree un brouillon de campagne marketing pour augmenter les commandes cette semaine sans publier automatiquement.",
  },
  {
    icon: Camera,
    label: "Ameliorer une photo",
    mode: "image",
    action: "image_enhance",
    selectionMode: "gallery_photos",
    prompt: "Prepare un brief premium pour ameliorer une photo de plat et generer une legende de publication.",
  },
];

const AI_HISTORY_STORAGE_PREFIX = "tok-dashboard-advisor-history";
const MAX_ADVISOR_HISTORY_ENTRIES = 12;
const SUPABASE_VISIBLE_URL_PATTERN = /https?:\/\/[^\s)"']*supabase\.co[^\s)"']*/gi;
const SUPABASE_HOST_PATTERN = /\b[a-z0-9-]+\.supabase\.co\b/gi;
const COMMERCIAL_DEMO_SIGNED_IMAGE_PATTERN = /!\[[^\]]*\]\(https:\/\/[^\s)"']+\.supabase\.co\/storage\/v1\/object\/sign\/commercial-demo-ai\/[^\s)"']+\)/gi;
const COMMERCIAL_DEMO_STORED_IMAGE_PLACEHOLDER = "_Visuel disponible dans Photos > Créations IA Démo._";
const DEMO_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const MAX_DEMO_IMAGE_DATA_URL_LENGTH = 16 * 1024 * 1024;

const advisorMarkdownUrlTransform: UrlTransform = (url, key, node) => {
  if (
    key === "src"
    && node.tagName === "img"
    && DEMO_IMAGE_DATA_URL_PATTERN.test(url)
    && url.length <= MAX_DEMO_IMAGE_DATA_URL_LENGTH
  ) {
    return url;
  }
  return defaultUrlTransform(url);
};

function sanitizeAdvisorVisibleText(value: string) {
  return value
    .replace(SUPABASE_VISIBLE_URL_PATTERN, "[image de reference]")
    .replace(SUPABASE_HOST_PATTERN, "[service image]");
}

function sanitizeAdvisorVisibleContent(value: string) {
  const preservedImages: string[] = [];
  const withPlaceholders = value.replace(COMMERCIAL_DEMO_SIGNED_IMAGE_PATTERN, (markdown) => {
    const placeholder = `TOK_DEMO_SIGNED_IMAGE_${preservedImages.length}_TOKEN`;
    preservedImages.push(markdown);
    return placeholder;
  });
  let sanitized = sanitizeAdvisorVisibleText(withPlaceholders);
  preservedImages.forEach((markdown, index) => {
    sanitized = sanitized.replace(`TOK_DEMO_SIGNED_IMAGE_${index}_TOKEN`, markdown);
  });
  return sanitized;
}

function getShortAdvisorReference(id: string) {
  return id.slice(0, 8);
}

function createAdvisorHistoryEntryId() {
  return globalThis.crypto?.randomUUID?.() || `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getAdvisorHistoryStorageKey(storageScope: string) {
  return `${AI_HISTORY_STORAGE_PREFIX}:${storageScope}`;
}

function getAdvisorHistoryTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content || "Conversation IA";
  const firstLine = firstUserMessage.split("\n").find((line) => line.trim().length > 0) || firstUserMessage;
  return sanitizeAdvisorVisibleText(firstLine).trim().slice(0, 80);
}

function loadAdvisorHistory(storageScope: string): AdvisorHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getAdvisorHistoryStorageKey(storageScope)) || "[]");
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.flatMap((entry): AdvisorHistoryEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Partial<AdvisorHistoryEntry>;
      if (
        typeof candidate.id !== "string"
        || typeof candidate.restaurantId !== "string"
        || typeof candidate.title !== "string"
        || typeof candidate.createdAt !== "string"
        || !Array.isArray(candidate.messages)
      ) {
        return [];
      }
      const messages = candidate.messages.filter((message): message is Message => (
        !!message
        && typeof message === "object"
        && (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
        && message.content.trim().length > 0
      )).map((message) => storageScope.startsWith("commercial-demo:") ? {
        ...message,
        content: message.content.replace(
          COMMERCIAL_DEMO_SIGNED_IMAGE_PATTERN,
          COMMERCIAL_DEMO_STORED_IMAGE_PLACEHOLDER,
        ),
      } : message);
      return messages.length > 0 ? [{ ...candidate, messages } as AdvisorHistoryEntry] : [];
    });
    if (storageScope.startsWith("commercial-demo:")) {
      window.localStorage.setItem(
        getAdvisorHistoryStorageKey(storageScope),
        JSON.stringify(entries.slice(0, MAX_ADVISOR_HISTORY_ENTRIES)),
      );
    }
    return entries;
  } catch {
    return [];
  }
}

function writeAdvisorHistory(storageScope: string, entries: AdvisorHistoryEntry[]) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      getAdvisorHistoryStorageKey(storageScope),
      JSON.stringify(entries.slice(0, MAX_ADVISOR_HISTORY_ENTRIES)),
    );
    return true;
  } catch {
    // Private browsing and full storage must not turn a successful backend reply into an error.
    return false;
  }
}

function getAdvisorHistoryEntryKey(entry: AdvisorHistoryEntry) {
  const firstUserMessage = entry.messages.find((message) => message.role === "user")?.content.trim() || entry.title;
  return `${entry.restaurantId}:${firstUserMessage}`;
}

function saveAdvisorHistoryEntry(storageScope: string, restaurantId: string, messages: Message[]) {
  if (!messages.some((message) => message.role === "assistant" && message.content.trim().length > 0)) {
    return loadAdvisorHistory(storageScope);
  }

  const entry: AdvisorHistoryEntry = {
    id: createAdvisorHistoryEntryId(),
    restaurantId,
    title: getAdvisorHistoryTitle(messages),
    createdAt: new Date().toISOString(),
    messages: messages.map((message) => ({
      ...message,
      content: storageScope.startsWith("commercial-demo:")
        ? message.content.replace(
            COMMERCIAL_DEMO_SIGNED_IMAGE_PATTERN,
            COMMERCIAL_DEMO_STORED_IMAGE_PLACEHOLDER,
          )
        : message.content,
    })),
  };
  const nextEntries = [
    entry,
    ...loadAdvisorHistory(storageScope).filter((candidate) => getAdvisorHistoryEntryKey(candidate) !== getAdvisorHistoryEntryKey(entry)),
  ].slice(0, MAX_ADVISOR_HISTORY_ENTRIES);

  writeAdvisorHistory(storageScope, nextEntries);
  return nextEntries;
}

function deleteAdvisorHistoryEntry(storageScope: string, targetEntry: AdvisorHistoryEntry) {
  const targetKey = getAdvisorHistoryEntryKey(targetEntry);
  const nextEntries = loadAdvisorHistory(storageScope).filter((entry) => (
    entry.id !== targetEntry.id && getAdvisorHistoryEntryKey(entry) !== targetKey
  ));
  writeAdvisorHistory(storageScope, nextEntries);
  return nextEntries;
}

function mapBackendAdvisorConversation(conversation: RestaurantAdvisorConversation): AdvisorHistoryEntry | null {
  const messages = conversation.messages.filter((message): message is RestaurantAdvisorConversation["messages"][number] => (
    (message.role === "user" || message.role === "assistant")
    && typeof message.content === "string"
    && message.content.trim().length > 0
  ));

  if (messages.length === 0 || !conversation.restaurant_id) return null;

  const normalizedMessages: Message[] = messages.map((message) => ({
    role: message.role as Message["role"],
    content: message.content,
  }));

  return {
    id: `backend:${conversation.id}`,
    backendConversationId: conversation.id,
    restaurantId: conversation.restaurant_id,
    title: conversation.title || getAdvisorHistoryTitle(normalizedMessages),
    createdAt: conversation.updated_at || conversation.created_at,
    messages: normalizedMessages,
  };
}

function mergeAdvisorHistoryEntries(remoteEntries: AdvisorHistoryEntry[], localEntries: AdvisorHistoryEntry[]) {
  const seen = new Set<string>();
  const entries: AdvisorHistoryEntry[] = [];

  for (const entry of [...remoteEntries, ...localEntries]) {
    const key = getAdvisorHistoryEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  return entries.slice(0, MAX_ADVISOR_HISTORY_ENTRIES);
}

function asTextArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function formatToolResponse(toolLabel: string, data: Record<string, unknown>) {
  const markdown = readString(data, "markdown");
  if (markdown) return markdown;

  const imageUrl = readString(data, "gallery_image_url") || readString(data, "generated_image_url");
  if (imageUrl) {
    const altText = readString(data, "alt_text") || readString(data, "title") || toolLabel;
    return `![${altText}](${imageUrl})`;
  }

  const nextSteps = asTextArray(data.next_steps ?? data.recommended_actions);
  const checklist = asTextArray(data.checklist);
  const caption = readString(data, "publication_caption");
  const enhancedPrompt = readString(data, "enhanced_prompt");

  return [
    `### ${readString(data, "title") || toolLabel}`,
    readString(data, "summary"),
    enhancedPrompt ? `**Brief visuel**\n${enhancedPrompt}` : "",
    caption ? `**Legende proposee**\n${caption}` : "",
    nextSteps.length > 0 ? `**Prochaines actions**\n${nextSteps.map((item) => `- ${item}`).join("\n")}` : "",
    checklist.length > 0 ? `**Checklist**\n${checklist.map((item) => `- ${item}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export default function DashboardAdvisor() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const demoAiRuntime = useMemo<CommercialDemoAiRuntime | null>(() => (
    commercialDemoFrame?.surface === "restaurant"
      ? {
          sessionId: commercialDemoFrame.config.sessionId,
          surface: "restaurant",
        }
      : null
  ), [commercialDemoFrame?.config.sessionId, commercialDemoFrame?.surface]);
  const isCommercialDemo = Boolean(demoAiRuntime);
  const { selectedId, restaurants } = useDashboardRestaurant();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<AdvisorHistoryEntry[]>([]);
  const [preparationTool, setPreparationTool] = useState<QuickTool | null>(null);
  const [photoOptions, setPhotoOptions] = useState<AdvisorPhotoOption[]>([]);
  const [dishOptions, setDishOptions] = useState<AdvisorDishOption[]>([]);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>([]);
  const [toolInstructions, setToolInstructions] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  const restaurant = selectedId
    ? { id: selectedId, name: restaurants.find((item) => item.id === selectedId)?.name || "Mon restaurant" }
    : null;
  const restaurantId = restaurant?.id;
  const advisorHistoryStorageScope = demoAiRuntime
    ? `commercial-demo:${demoAiRuntime.sessionId}:${demoAiRuntime.surface}:${restaurantId || "none"}`
    : `restaurant:${restaurantId || "none"}`;

  const refreshAdvisorHistoryEntries = useCallback(async (targetRestaurantId: string) => {
    const localEntries = loadAdvisorHistory(advisorHistoryStorageScope);
    setHistoryEntries(localEntries);

    if (demoAiRuntime) {
      try {
        const conversations = await getCommercialDemoAiHistory(demoAiRuntime, "assistant");
        const remoteEntries: AdvisorHistoryEntry[] = conversations.map((conversation) => ({
          id: conversation.id,
          backendConversationId: conversation.id,
          restaurantId: targetRestaurantId,
          title: conversation.title,
          createdAt: conversation.created_at,
          messages: toTokAiMessages(conversation.messages),
        }));
        if (mountedRef.current) {
          setHistoryEntries(mergeAdvisorHistoryEntries(remoteEntries, localEntries));
        }
      } catch {
        if (mountedRef.current) setHistoryEntries(localEntries);
      }
      return;
    }

    try {
      const conversations = await getRestaurantAdvisorConversations(targetRestaurantId, MAX_ADVISOR_HISTORY_ENTRIES);
      const remoteEntries = conversations.flatMap((conversation): AdvisorHistoryEntry[] => {
        const entry = mapBackendAdvisorConversation(conversation);
        return entry ? [entry] : [];
      });

      if (mountedRef.current) {
        setHistoryEntries(mergeAdvisorHistoryEntries(remoteEntries, localEntries));
      }
    } catch {
      if (mountedRef.current) {
        setHistoryEntries(localEntries);
      }
    }
  }, [advisorHistoryStorageScope, demoAiRuntime]);

  useEffect(() => {
    if (isCommercialDemo) return;
    setActiveAiCreationContext("dashboard-advisor:image-tool");
    return () => setActiveAiCreationContext(null);
  }, [isCommercialDemo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!restaurantId) {
      setHistoryEntries([]);
      setActiveConversationId(null);
      setHistoryOpen(false);
      setPhotoOptions([]);
      setDishOptions([]);
      setPreparationTool(null);
      return;
    }
    void refreshAdvisorHistoryEntries(restaurantId);
  }, [restaurantId, refreshAdvisorHistoryEntries]);

  useEffect(() => {
    if (!restaurantId) return;

    if (isCommercialDemo && commercialDemoFrame) {
      const snapshot = commercialDemoFrame.snapshot;
      const restaurantImage = snapshot.demo_restaurant.image_url;
      const catalogPhotos = snapshot.catalog_items.flatMap((item): AdvisorPhotoOption[] => {
        if (!item.image_url) return [];
        return [{
          id: item.id,
          mediaUrl: item.image_url,
          altText: item.name,
          createdAt: snapshot.session.created_at || "",
        }];
      });
      setPhotoOptions([
        ...(restaurantImage ? [{
          id: `demo-cover-${snapshot.demo_restaurant.id}`,
          mediaUrl: restaurantImage,
          altText: snapshot.demo_restaurant.name,
          createdAt: snapshot.session.created_at || "",
        }] : []),
        ...catalogPhotos,
      ].slice(0, ADVISOR_PHOTOS_LIMIT));
      setDishOptions(snapshot.catalog_items.slice(0, ADVISOR_MENU_ITEMS_LIMIT).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || null,
        imageUrl: item.image_url || null,
        category: item.category || null,
        price: Number(item.price) || 0,
      })));
      setIsSelectionLoading(false);
      return;
    }

    let cancelled = false;
    setIsSelectionLoading(true);

    Promise.all([
      (supabase.from as any)("restaurant_media")
        .select("id, media_url, alt_text, created_at")
        .eq("restaurant_id", restaurantId)
        .in("media_type", ADVISOR_GALLERY_MEDIA_TYPES)
        .order("created_at", { ascending: false })
        .limit(ADVISOR_PHOTOS_LIMIT),
      (supabase.from as any)("menu_items")
        .select("id, name, description, image_url, category, price")
        .eq("restaurant_id", restaurantId)
        .order("category", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true })
        .limit(ADVISOR_MENU_ITEMS_LIMIT),
    ])
      .then(([photosResult, dishesResult]) => {
        if (cancelled) return;
        if (photosResult.error) throw photosResult.error;
        if (dishesResult.error) throw dishesResult.error;

        setPhotoOptions((photosResult.data || []).flatMap((row: Record<string, unknown>): AdvisorPhotoOption[] => {
          const id = typeof row.id === "string" ? row.id : "";
          const mediaUrl = typeof row.media_url === "string" ? row.media_url : "";
          if (!id || !mediaUrl) return [];

          return [{
            id,
            mediaUrl,
            altText: typeof row.alt_text === "string" ? row.alt_text : null,
            createdAt: typeof row.created_at === "string" ? row.created_at : "",
          }];
        }));
        setDishOptions((dishesResult.data || []).flatMap((row: Record<string, unknown>): AdvisorDishOption[] => {
          const id = typeof row.id === "string" ? row.id : "";
          const name = typeof row.name === "string" ? row.name : "";
          if (!id || !name) return [];

          return [{
            id,
            name,
            description: typeof row.description === "string" ? row.description : null,
            imageUrl: typeof row.image_url === "string" ? row.image_url : null,
            category: typeof row.category === "string" ? row.category : null,
            price: typeof row.price === "number" ? row.price : Number(row.price) || 0,
          }];
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: "Sélection indisponible",
          description: error instanceof Error ? error.message : "Impossible de charger les photos ou les plats.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setIsSelectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [commercialDemoFrame, isCommercialDemo, restaurantId, toast]);

  const streamChat = async (allMessages: Message[]) => {
    if (!restaurant) return "";

    if (demoAiRuntime) {
      const lastQuestion = allMessages[allMessages.length - 1]?.content || "votre activité";
      const result = await askCommercialDemoAi({
        runtime: demoAiRuntime,
        tool: "assistant",
        message: lastQuestion.slice(0, 4000),
        conversationId: activeConversationId,
        context: {
          restaurant_id: restaurant.id,
          restaurant_name: restaurant.name,
          previous_message_count: Math.max(0, allMessages.length - 1),
          recent_topics: allMessages.slice(-3, -1).map((message) => message.content.slice(0, 180)),
        },
      });
      setActiveConversationId(result.conversation_id);
      return result.reply;
    }

    let assistantSoFar = "";
    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((message, index) =>
            index === prev.length - 1 ? { ...message, content: assistantSoFar } : message,
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    await streamRestaurantAdvisor({
      restaurantId: restaurant.id,
      messages: allMessages,
      onDelta: upsertAssistant,
    });

    return assistantSoFar;
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading || !restaurant) return;

    const userMsg: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const assistantReply = await streamChat(newMessages);
      if (assistantReply.trim()) {
        const assistantMsg: Message = { role: "assistant", content: assistantReply };
        const completedMessages = [
          ...newMessages,
          assistantMsg,
        ];
        setHistoryEntries(saveAdvisorHistoryEntry(advisorHistoryStorageScope, restaurant.id, completedMessages));

        if (!isCommercialDemo) try {
          if (activeConversationId) {
            await appendRestaurantAdvisorConversationMessages({
              conversationId: activeConversationId,
              messages: [userMsg, assistantMsg],
              metadata: { endpoint: "restaurant-advisor" },
            });
          } else {
            const conversationId = await createRestaurantAdvisorConversation({
              restaurantId: restaurant.id,
              title: getAdvisorHistoryTitle(completedMessages),
              messages: completedMessages,
              metadata: { endpoint: "restaurant-advisor" },
            });
            setActiveConversationId(conversationId);
          }

          void refreshAdvisorHistoryEntries(restaurant.id);
        } catch {
          // Local history remains available if backend persistence is temporarily unavailable.
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      setMessages((prev) => {
        if (prev[prev.length - 1]?.role === "user") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickTool = async (tool: QuickTool, payload?: PreparedToolPayload) => {
    if (!restaurant || isLoading || activeTool) return;

    const prompt = payload?.prompt || tool.prompt;
    const userMsg: Message = {
      role: "user",
      content: `${tool.label}\n\n${prompt}`,
    };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setIsLoading(true);
    setActiveTool(tool.label);

    try {
      let data: unknown;

      if (demoAiRuntime && tool.mode !== "image") {
        const result = await askCommercialDemoAi({
          runtime: demoAiRuntime,
          tool: "assistant",
          message: `${tool.label}\n\n${prompt}`.slice(0, 4000),
          conversationId: activeConversationId,
          context: {
            action: tool.action,
            restaurant_id: restaurant.id,
            selected_dishes: payload?.selectedDishes || [],
          },
        });
        setActiveConversationId(result.conversation_id);
        data = {
          title: tool.label,
          summary: result.reply,
          conversationId: result.conversation_id,
          next_steps: ["Prévisualiser le résultat", "Tester le parcours", "Comparer les performances"],
          checklist: ["OpenAI réel", "Crédits Démo illimités", "Coût suivi en interne", "Aucun effet de production"],
        };
      } else if (tool.mode === "image") {
        void requestAiCreationNotificationPermission();
        const { promise } = startTokImageCreationJob({
          restaurantId: restaurant.id,
          tool: "advisor_photo",
          title: tool.label,
          request: {
            restaurantId: restaurant.id,
            prompt,
            sourceImageUrl: payload?.selectedPhotos?.[0]?.mediaUrl || null,
            referenceImageUrls: payload?.selectedPhotos?.map((photo) => photo.mediaUrl) || [],
            referenceMediaIds: payload?.selectedPhotos?.map((photo) => photo.id) || [],
            assetType: "menu_visual",
            generateImage: true,
            imageOnly: true,
          },
        });
        data = await promise;
      } else {
        data = await runRestaurantAgent({
          restaurantId: restaurant.id,
          action: tool.action,
          prompt,
          context: payload?.selectedDishes ? {
            selectedDishes: payload.selectedDishes.map((dish) => ({
              id: dish.id,
              name: dish.name,
              description: dish.description,
              imageUrl: dish.imageUrl,
              category: dish.category,
              price: dish.price,
            })),
            userInstructions: payload.userInstructions || "",
          } : undefined,
        });
      }

      if (!mountedRef.current) return;
      const assistantMsg: Message = {
        role: "assistant",
        content: formatToolResponse(tool.label, data as unknown as Record<string, unknown>),
      };
      const nextMessages = [...newMessages, assistantMsg];
      setMessages(nextMessages);
      setHistoryEntries(saveAdvisorHistoryEntry(advisorHistoryStorageScope, restaurant.id, nextMessages));

      const toolResult = data as Record<string, unknown>;
      const backendConversationId = typeof toolResult.conversationId === "string" ? toolResult.conversationId : null;

      if (!isCommercialDemo) try {
        if (backendConversationId) {
          setActiveConversationId(backendConversationId);
        } else if (activeConversationId) {
          await appendRestaurantAdvisorConversationMessages({
            conversationId: activeConversationId,
            messages: [userMsg, assistantMsg],
            metadata: { endpoint: "restaurant-advisor", tool: tool.label },
          });
        } else {
          const conversationId = await createRestaurantAdvisorConversation({
            restaurantId: restaurant.id,
            title: getAdvisorHistoryTitle(nextMessages),
            messages: nextMessages,
            metadata: { endpoint: "restaurant-advisor", tool: tool.label },
          });
          setActiveConversationId(conversationId);
        }

        void refreshAdvisorHistoryEntries(restaurant.id);
      } catch {
        // Local history remains available if backend persistence is temporarily unavailable.
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "user" && last.content === userMsg.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setActiveTool(null);
      }
    }
  };

  const openToolPreparation = (tool: QuickTool) => {
    if (!tool.selectionMode) {
      void handleQuickTool(tool);
      return;
    }

    setPreparationTool(tool);
    setSelectedPhotoIds([]);
    setSelectedDishIds([]);
    setToolInstructions("");
  };

  const closeToolPreparation = () => {
    if (isLoading) return;
    setPreparationTool(null);
    setSelectedPhotoIds([]);
    setSelectedDishIds([]);
    setToolInstructions("");
  };

  const toggleSelectedPhoto = (photoId: string, checked: boolean) => {
    setSelectedPhotoIds((current) => (
      checked ? Array.from(new Set([...current, photoId])) : current.filter((id) => id !== photoId)
    ));
  };

  const toggleSelectedDish = (dishId: string, checked: boolean) => {
    setSelectedDishIds((current) => (
      checked ? Array.from(new Set([...current, dishId])) : current.filter((id) => id !== dishId)
    ));
  };

  const buildPreparedPrompt = (tool: QuickTool, selectedPhotos: AdvisorPhotoOption[], selectedDishes: AdvisorDishOption[]) => {
    const instructions = toolInstructions.trim();
    const selectionSummary = tool.selectionMode === "gallery_photos"
      ? selectedPhotos.map((photo, index) => `${index + 1}. ${photo.altText || "Photo de galerie"} - reference ${getShortAdvisorReference(photo.id)}`).join("\n")
      : selectedDishes.map((dish, index) => {
        const price = Number.isFinite(dish.price) && dish.price > 0 ? ` - ${dish.price.toFixed(2)} CHF` : "";
        const category = dish.category ? ` - ${dish.category}` : "";
        return `${index + 1}. ${dish.name}${category}${price}${dish.description ? `\n   Description actuelle: ${dish.description}` : ""}${dish.imageUrl ? `\n   Image associee: reference ${getShortAdvisorReference(dish.id)}` : ""}`;
      }).join("\n");

    return [
      tool.prompt,
      tool.selectionMode === "gallery_photos"
        ? `Photos sélectionnées depuis la galerie:\n${selectionSummary}`
        : `Plats sélectionnés depuis le menu:\n${selectionSummary}`,
      instructions ? `Consignes du restaurateur:\n${instructions}` : "",
    ].filter(Boolean).join("\n\n");
  };

  const submitPreparedTool = () => {
    if (!preparationTool || !restaurant || isLoading || activeTool) return;

    const selectedPhotos = photoOptions.filter((photo) => selectedPhotoIds.includes(photo.id));
    const selectedDishes = dishOptions.filter((dish) => selectedDishIds.includes(dish.id));
    const requiresPhoto = preparationTool.selectionMode === "gallery_photos";
    const requiresDish = preparationTool.selectionMode === "menu_dishes";

    if ((requiresPhoto && selectedPhotos.length === 0) || (requiresDish && selectedDishes.length === 0)) {
      toast({
        title: "Sélection requise",
        description: requiresPhoto ? "Sélectionnez au moins une photo à améliorer." : "Sélectionnez au moins un plat à optimiser.",
        variant: "destructive",
      });
      return;
    }

    const prompt = buildPreparedPrompt(preparationTool, selectedPhotos, selectedDishes);
    setPreparationTool(null);
    void handleQuickTool(preparationTool, {
      prompt,
      selectedPhotos,
      selectedDishes,
      userInstructions: toolInstructions.trim(),
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
    setActiveTool(null);
    setActiveConversationId(null);
    setPreparationTool(null);
    setSelectedPhotoIds([]);
    setSelectedDishIds([]);
    setToolInstructions("");
  };

  const handleLoadHistory = (entry: AdvisorHistoryEntry) => {
    setMessages(entry.messages);
    setInput("");
    setHistoryOpen(false);
    setActiveTool(null);
    setActiveConversationId(entry.backendConversationId || null);
    setPreparationTool(null);
    setSelectedPhotoIds([]);
    setSelectedDishIds([]);
    setToolInstructions("");
  };

  const handleDeleteHistory = async (entry: AdvisorHistoryEntry) => {
    if (!restaurant) return;
    if (demoAiRuntime && entry.backendConversationId) {
      try {
        await archiveCommercialDemoAiConversation(demoAiRuntime, entry.backendConversationId);
      } catch {
        // Keep deletion responsive locally if the isolated demo history is temporarily unavailable.
      }
    } else if (entry.backendConversationId) {
      try {
        await archiveRestaurantAdvisorConversation(entry.backendConversationId);
      } catch {
        // Keep deletion responsive locally even if backend archival is temporarily unavailable.
      }
    }
    const targetKey = getAdvisorHistoryEntryKey(entry);
    setHistoryEntries((current) => current.filter((candidate) => (
      candidate.id !== entry.id && getAdvisorHistoryEntryKey(candidate) !== targetKey
    )));
    deleteAdvisorHistoryEntry(advisorHistoryStorageScope, entry);
  };

  const isPhotoPreparation = preparationTool?.selectionMode === "gallery_photos";
  const isDishPreparation = preparationTool?.selectionMode === "menu_dishes";
  const selectedPreparationCount = isPhotoPreparation ? selectedPhotoIds.length : selectedDishIds.length;
  const hasPreparationSelection = selectedPreparationCount > 0;
  const PreparationIcon = preparationTool?.icon;
  const preparationTitle = isPhotoPreparation ? "Sélectionnez les photos à améliorer" : "Sélectionnez les plats à optimiser";
  const preparationDescription = isPhotoPreparation
    ? "Cochez une ou plusieurs images de la galerie, puis ajoutez vos consignes de retouche."
    : "Cochez un ou plusieurs plats du menu, puis précisez les modifications souhaitées.";

  if (!restaurant) {
    return (
      <DashboardLayout>
        <div className="space-y-4 py-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold">Aucun restaurant</h2>
          <p className="text-muted-foreground">Creez votre restaurant pour acceder a l'assistant IA.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout constrainToViewport>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-col items-stretch justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-bold">
                Assistant IA
                <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                  Beta
                </Badge>
              </h1>
              <p className="truncate text-xs text-muted-foreground">Analyse vos donnees et optimise vos performances</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen((open) => !open)} className="min-w-0 flex-[1_1_10rem] gap-1.5 sm:flex-none">
              <History className="h-3.5 w-3.5" />
              Historique
              {historyEntries.length > 0 ? (
                <Badge variant="secondary" className="ml-1 h-5 rounded-full px-1.5 text-[10px]">
                  {historyEntries.length}
                </Badge>
              ) : null}
            </Button>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleReset} className="min-w-0 flex-[1_1_10rem] gap-1.5 sm:flex-none">
                <RotateCcw className="h-3.5 w-3.5" />
                Nouveau chat
              </Button>
            )}
          </div>
        </div>

        {historyOpen ? (
          <div className="mb-4 flex max-h-[40dvh] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border bg-card p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Historique de l'assistant</p>
                <p className="text-xs text-muted-foreground">Conversations sauvegardées pour {restaurant.name}.</p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {historyEntries.length}
              </Badge>
            </div>
            {historyEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                Aucun echange enregistre pour le moment.
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto overscroll-contain pr-1">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="flex min-w-0 flex-col items-stretch justify-between gap-2 rounded-xl border bg-background px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleLoadHistory(entry)}>
                      <p className="truncate text-sm font-semibold">{sanitizeAdvisorVisibleText(entry.title)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}
                        {" - "}
                        {entry.messages.length} messages
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-3" onClick={() => handleLoadHistory(entry)}>
                        Charger
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => void handleDeleteHistory(entry)} title="Supprimer de l'historique">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-8 px-4">
              <div className="space-y-2 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="font-display text-2xl font-bold">Bonjour, {restaurant.name}</h2>
                <p className="mx-auto max-w-md text-muted-foreground">
                  Je suis votre assistant IA. J'analyse vos ventes, reservations, avis, campagnes et menu pour vous donner des conseils personnalises.
                </p>
              </div>
              <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK_TOOLS.map((tool) => (
                  <button
                    key={tool.label}
                    type="button"
                    onClick={() => openToolPreparation(tool)}
                    className="group rounded-xl border bg-primary/5 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading || Boolean(activeTool)}
                  >
                    <tool.icon className="mb-2 h-5 w-5 text-primary transition-transform group-hover:scale-110" />
                    <p className="text-sm font-semibold">{tool.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tool.prompt}</p>
                  </button>
                ))}
                {SUGGESTED_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => handleSend(suggestion.prompt)}
                    className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading || Boolean(activeTool)}
                  >
                    <suggestion.icon className="mb-2 h-5 w-5 text-primary transition-transform group-hover:scale-110" />
                    <p className="text-sm font-semibold">{suggestion.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{suggestion.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
                {message.role === "assistant" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <Card
                  className={`min-w-0 max-w-[85%] p-4 [overflow-wrap:anywhere] ${
                    message.role === "user" ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm min-w-0 max-w-none [overflow-wrap:anywhere] dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown urlTransform={advisorMarkdownUrlTransform}>
                        {sanitizeAdvisorVisibleContent(message.content)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="min-w-0 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{sanitizeAdvisorVisibleText(message.content)}</p>
                  )}
                </Card>
                {message.role === "user" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="max-w-[85%]">
                <AiLoadingState
                  compact
                  title={activeTool ? `${activeTool} en cours` : "Analyse IA en cours"}
                  description={activeTool ? "L'assistant prépare les données, appelle l'outil IA et formate la réponse." : "L'assistant lit le contexte du restaurant et prépare une réponse exploitable."}
                  steps={activeTool ? ["Contexte", "Génération", "Réponse"] : ["Contexte", "Analyse", "Réponse"]}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t pt-4">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={4000}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur vos performances..."
              className="max-h-32 min-h-[48px] resize-none"
              rows={1}
              disabled={isLoading}
            />
            <Button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || !restaurant}
              size="icon"
              aria-label="Envoyer le message"
              className="h-12 w-12 shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            L'IA analyse les donnees des 30 derniers jours de votre restaurant.
          </p>
        </div>
        <Dialog open={Boolean(preparationTool)} onOpenChange={(open) => { if (!open) closeToolPreparation(); }}>
          <DialogContent className="flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] min-h-0 max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[86dvh]">
            <DialogHeader className="min-w-0 shrink-0 border-b px-4 py-4 pr-12 sm:px-5 sm:pr-12">
              <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 leading-tight">
                {PreparationIcon ? <PreparationIcon className="h-5 w-5 text-primary" /> : null}
                {preparationTool?.label || "Préparation IA"}
              </DialogTitle>
              <DialogDescription>{preparationDescription}</DialogDescription>
            </DialogHeader>

            <div data-dialog-scroll-area className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{preparationTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {isSelectionLoading ? "Chargement des éléments..." : `${selectedPreparationCount} élément${selectedPreparationCount > 1 ? "s" : ""} sélectionné${selectedPreparationCount > 1 ? "s" : ""}`}
                  </p>
                </div>
                <Badge variant="outline" className="max-w-full self-start whitespace-normal rounded-full text-left sm:shrink-0">
                  {isPhotoPreparation ? photoOptions.length : dishOptions.length} disponible{(isPhotoPreparation ? photoOptions.length : dishOptions.length) > 1 ? "s" : ""}
                </Badge>
              </div>

              {isPhotoPreparation ? (
                photoOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                    Aucune photo de galerie disponible pour ce restaurant.
                  </div>
                ) : (
                  <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                    {photoOptions.map((photo) => {
                      const checked = selectedPhotoIds.includes(photo.id);

                      return (
                        <label
                          key={photo.id}
                          className="group cursor-pointer overflow-hidden rounded-xl border bg-background transition hover:border-primary/50"
                        >
                          <div className="relative aspect-square bg-muted">
                            <img
                              src={photo.mediaUrl}
                              alt={photo.altText || "Photo de galerie"}
                              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                            />
                            <span className="absolute left-2 top-2 rounded-lg bg-background/90 p-1 shadow-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleSelectedPhoto(photo.id, value === true)}
                                aria-label={`Sélectionner ${photo.altText || "photo de galerie"}`}
                              />
                            </span>
                          </div>
                          <span className="block truncate px-3 py-2 text-xs font-medium">
                            {photo.altText || "Photo de galerie"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : null}

              {isDishPreparation ? (
                dishOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                    Aucun plat de menu disponible pour ce restaurant.
                  </div>
                ) : (
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                    {dishOptions.map((dish) => {
                      const checked = selectedDishIds.includes(dish.id);

                      return (
                        <label
                          key={dish.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border bg-background p-3 transition hover:border-primary/50"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleSelectedDish(dish.id, value === true)}
                            aria-label={`Sélectionner ${dish.name}`}
                          />
                          {dish.imageUrl ? (
                            <img src={dish.imageUrl} alt={dish.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <Camera className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{dish.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {[dish.category, Number.isFinite(dish.price) && dish.price > 0 ? `${dish.price.toFixed(2)} CHF` : ""].filter(Boolean).join(" - ") || "Plat du menu"}
                            </span>
                            {dish.description ? (
                              <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{dish.description}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-semibold">Consignes de modification</p>
                <Textarea
                  value={toolInstructions}
                  onChange={(event) => setToolInstructions(event.target.value)}
                  maxLength={1800}
                  placeholder={isPhotoPreparation ? "Ex: rendre le plat plus lumineux, garder le cadrage, supprimer les ombres..." : "Ex: rendre la description plus premium, proposer un prix, mettre en avant les ingrédients locaux..."}
                  className="min-h-24 resize-none"
                  disabled={isLoading}
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:space-x-0 sm:px-5">
              <Button type="button" variant="outline" onClick={closeToolPreparation} disabled={isLoading} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button
                type="button"
                onClick={submitPreparedTool}
                disabled={isLoading || isSelectionLoading || !hasPreparationSelection}
                className="w-full gap-2 bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90 sm:w-auto"
              >
                <Sparkles className="h-4 w-4" />
                Lancer l'assistant
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AiGenerationProgressDialog
          open={Boolean(activeTool)}
          title={activeTool ? `${activeTool} en cours` : "Assistant IA en cours"}
          description="TOK analyse le contexte du restaurant, execute l'outil demande et prepare une reponse exploitable."
          status="Assistant TOK au travail"
          steps={["Contexte", "Generation", "Reponse"]}
          kind="text"
          estimatedDurationMs={20_000}
        />
      </div>
    </DashboardLayout>
  );
}

