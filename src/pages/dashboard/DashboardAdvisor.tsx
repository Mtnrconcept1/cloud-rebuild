import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart3,
  Bot,
  Camera,
  Loader2,
  Megaphone,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const restaurant = selectedId
    ? { id: selectedId, name: restaurants.find((item) => item.id === selectedId)?.name || "Mon restaurant" }
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChat = async (allMessages: Message[]) => {
    if (!restaurant) return;

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
      await streamChat(newMessages);
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

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: formatToolResponse(tool.label, data as unknown as Record<string, unknown>) },
      ]);
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
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleReset} className="shrink-0 gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Nouveau chat
            </Button>
          )}
        </div>

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
              <Card className="bg-card p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {activeTool ? `${activeTool}...` : "Analyse en cours..."}
                </div>
              </Card>
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
