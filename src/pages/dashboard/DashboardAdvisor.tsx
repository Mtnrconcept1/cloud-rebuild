import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import ReactMarkdown from "react-markdown";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { AiLoadingState } from "@/components/ui/ai-loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  generateTokDishImage,
  runRestaurantAgent,
  streamRestaurantAdvisor,
  type RestaurantAgentAction,
} from "@/lib/ai/tokAiClient";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

type Message = { role: "user" | "assistant"; content: string };
type AdvisorHistoryEntry = {
  id: string;
  restaurantId: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

type QuickTool = {
  icon: LucideIcon;
  label: string;
  prompt: string;
} & (
  | { mode: "agent"; action: RestaurantAgentAction }
  | { mode: "image"; action: "image_enhance" }
);

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
    prompt: "Prepare un brief premium pour ameliorer une photo de plat et generer une legende de publication.",
  },
];

const AI_HISTORY_STORAGE_PREFIX = "tok-dashboard-advisor-history";
const MAX_ADVISOR_HISTORY_ENTRIES = 12;

function createAdvisorHistoryEntryId() {
  return globalThis.crypto?.randomUUID?.() || `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getAdvisorHistoryStorageKey(restaurantId: string) {
  return `${AI_HISTORY_STORAGE_PREFIX}:${restaurantId}`;
}

function getAdvisorHistoryTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content || "Conversation IA";
  const firstLine = firstUserMessage.split("\n").find((line) => line.trim().length > 0) || firstUserMessage;
  return firstLine.trim().slice(0, 80);
}

function loadAdvisorHistory(restaurantId: string): AdvisorHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getAdvisorHistoryStorageKey(restaurantId)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): AdvisorHistoryEntry[] => {
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
      ));
      return messages.length > 0 ? [{ ...candidate, messages } as AdvisorHistoryEntry] : [];
    });
  } catch {
    return [];
  }
}

function writeAdvisorHistory(restaurantId: string, entries: AdvisorHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getAdvisorHistoryStorageKey(restaurantId),
    JSON.stringify(entries.slice(0, MAX_ADVISOR_HISTORY_ENTRIES)),
  );
}

function saveAdvisorHistoryEntry(restaurantId: string, messages: Message[]) {
  if (!messages.some((message) => message.role === "assistant" && message.content.trim().length > 0)) {
    return loadAdvisorHistory(restaurantId);
  }

  const entry: AdvisorHistoryEntry = {
    id: createAdvisorHistoryEntryId(),
    restaurantId,
    title: getAdvisorHistoryTitle(messages),
    createdAt: new Date().toISOString(),
    messages: messages.map((message) => ({ ...message })),
  };
  const nextEntries = [
    entry,
    ...loadAdvisorHistory(restaurantId).filter((candidate) => candidate.title !== entry.title),
  ].slice(0, MAX_ADVISOR_HISTORY_ENTRIES);

  writeAdvisorHistory(restaurantId, nextEntries);
  return nextEntries;
}

function deleteAdvisorHistoryEntry(restaurantId: string, entryId: string) {
  const nextEntries = loadAdvisorHistory(restaurantId).filter((entry) => entry.id !== entryId);
  writeAdvisorHistory(restaurantId, nextEntries);
  return nextEntries;
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
  const { selectedId, restaurants } = useDashboardRestaurant();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<AdvisorHistoryEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const restaurant = selectedId
    ? { id: selectedId, name: restaurants.find((item) => item.id === selectedId)?.name || "Mon restaurant" }
    : null;
  const restaurantId = restaurant?.id;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!restaurantId) {
      setHistoryEntries([]);
      setHistoryOpen(false);
      return;
    }
    setHistoryEntries(loadAdvisorHistory(restaurantId));
  }, [restaurantId]);

  const streamChat = async (allMessages: Message[]) => {
    if (!restaurant) return "";

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
        setHistoryEntries(saveAdvisorHistoryEntry(restaurant.id, [
          ...newMessages,
          { role: "assistant", content: assistantReply },
        ]));
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

  const handleQuickTool = async (tool: QuickTool) => {
    if (!restaurant || isLoading || activeTool) return;

    const userMsg: Message = {
      role: "user",
      content: `${tool.label}\n\n${tool.prompt}`,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setActiveTool(tool.label);

    try {
      const data =
        tool.mode === "image"
          ? await generateTokDishImage({
              restaurantId: restaurant.id,
              prompt: tool.prompt,
              assetType: "menu_visual",
              generateImage: true,
              imageOnly: true,
            })
          : await runRestaurantAgent({
              restaurantId: restaurant.id,
              action: tool.action,
              prompt: tool.prompt,
            });

      const assistantMsg: Message = {
        role: "assistant",
        content: formatToolResponse(tool.label, data as unknown as Record<string, unknown>),
      };
      setMessages((prev) => {
        const nextMessages = [...prev, assistantMsg];
        setHistoryEntries(saveAdvisorHistoryEntry(restaurant.id, nextMessages));
        return nextMessages;
      });
    } catch (error) {
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
      setIsLoading(false);
      setActiveTool(null);
    }
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
  };

  const handleLoadHistory = (entry: AdvisorHistoryEntry) => {
    setMessages(entry.messages);
    setInput("");
    setHistoryOpen(false);
    setActiveTool(null);
  };

  const handleDeleteHistory = (entryId: string) => {
    if (!restaurant) return;
    setHistoryEntries(deleteAdvisorHistoryEntry(restaurant.id, entryId));
  };

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
    <DashboardLayout>
      <div className="flex h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] flex-col">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 font-display text-xl font-bold">
                Assistant IA
                <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                  Beta
                </Badge>
              </h1>
              <p className="truncate text-xs text-muted-foreground">Analyse vos donnees et optimise vos performances</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen((open) => !open)} className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Historique
              {historyEntries.length > 0 ? (
                <Badge variant="secondary" className="ml-1 h-5 rounded-full px-1.5 text-[10px]">
                  {historyEntries.length}
                </Badge>
              ) : null}
            </Button>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Nouveau chat
              </Button>
            )}
          </div>
        </div>

        {historyOpen ? (
          <div className="mb-4 shrink-0 rounded-2xl border bg-card p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Historique de l'assistant</p>
                <p className="text-xs text-muted-foreground">Conversations enregistrees pour {restaurant.name} sur cet appareil.</p>
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
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                {historyEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleLoadHistory(entry)}>
                      <p className="truncate text-sm font-semibold">{entry.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}
                        {" - "}
                        {entry.messages.length} messages
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-3" onClick={() => handleLoadHistory(entry)}>
                        Charger
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => handleDeleteHistory(entry.id)} title="Supprimer de l'historique">
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
                    onClick={() => handleQuickTool(tool)}
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
                  className={`max-w-[85%] p-4 ${
                    message.role === "user" ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
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
              className="h-12 w-12 shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            L'IA analyse les donnees des 30 derniers jours de votre restaurant.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
