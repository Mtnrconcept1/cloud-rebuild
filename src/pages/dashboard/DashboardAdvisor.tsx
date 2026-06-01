import { useState, useRef, useEffect } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Send, User, Sparkles, TrendingUp, BarChart3,
  Camera, Star, Megaphone, Loader2, RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { SUPABASE_URL } from "@/lib/env";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  { icon: TrendingUp, label: "Analyser mes ventes", prompt: "Analyse mes ventes des 30 derniers jours et donne-moi des recommandations pour augmenter mon chiffre d'affaires." },
  { icon: Star, label: "Améliorer mes avis", prompt: "Analyse mes avis clients et propose des actions concrètes pour améliorer ma note et là satisfaction." },
  { icon: BarChart3, label: "Optimiser mon menu", prompt: "Analyse mon menu (prix, photos, catégories) et propose des optimisations pour augmenter le panier moyen." },
  { icon: Megaphone, label: "ROI campagnes", prompt: "Analyse les performances de mes campagnes marketing et propose des améliorations pour un meilleur ROI." },
  { icon: Camera, label: "Audit photos", prompt: "Fais un audit de mes photos et de ma page restaurant. Que dois-je améliorer pour attirer plus de clients ?" },
  { icon: Sparkles, label: "Plan d'action global", prompt: "Donne-moi un plan d'action complet et prioritisé pour optimiser mes performances sur la plateforme Tok." },
];

const QUICK_TOOLS = [
  {
    icon: Sparkles,
    label: "Optimiser un plat",
    endpoint: "ai-restaurant-tools",
    action: "dish_optimization",
    prompt: "Optimise la description, le positionnement prix et la mise en avant d'un plat prioritaire avec les donnees disponibles.",
  },
  {
    icon: Megaphone,
    label: "Créer une campagne",
    endpoint: "ai-restaurant-tools",
    action: "campaign",
    prompt: "Cree un brouillon de campagne marketing pour augmenter les commandes cette semaine sans publier automatiquement.",
  },
  {
    icon: Camera,
    label: "Améliorer une photo",
    endpoint: "ai-image-enhance",
    action: "image_enhance",
    prompt: "Prepare un brief premium pour ameliorer une photo de plat et generer une legende de publication.",
  },
];

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
    ? { id: selectedId, name: restaurants.find((r) => r.id === selectedId)?.name || "Mon restaurant" }
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChat = async (allMessages: Message[]) => {
    if (!restaurant) return;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Vous devez être connecté.");

    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/restaurant-advisor`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          restaurantId: restaurant.id,
        }),
      }
    );

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Erreur réseau" }));
      throw new Error(errorData.error || `Erreur ${resp.status}`);
    }

    if (!resp.body) throw new Error("Pas de réponse du serveur");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantSoFar = "";

    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    let streamDone = false;
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) upsertAssistant(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) upsertAssistant(content);
        } catch { /* ignore */ }
      }
    }
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
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      // Remove user message if no response
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

  const formatToolResponse = (toolLabel: string, data: Record<string, any>) => {
    if (typeof data.markdown === "string" && data.markdown.trim()) {
      return data.markdown;
    }

    if (typeof data.enhanced_prompt === "string") {
      return [
        `### ${data.title || toolLabel}`,
        data.edit_instructions ? `**Instructions**\n${data.edit_instructions}` : "",
        data.enhanced_prompt ? `**Prompt visuel**\n${data.enhanced_prompt}` : "",
        data.publication_caption ? `**Legende**\n${data.publication_caption}` : "",
        Array.isArray(data.checklist) && data.checklist.length > 0
          ? `**Checklist**\n${data.checklist.map((item: string) => `- ${item}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n");
    }

    return [
      `### ${data.title || toolLabel}`,
      data.summary || "",
      Array.isArray(data.next_steps) && data.next_steps.length > 0
        ? `**Prochaines actions**\n${data.next_steps.map((item: string) => `- ${item}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");
  };

  const handleQuickTool = async (tool: (typeof QUICK_TOOLS)[number]) => {
    if (!restaurant || isLoading || activeTool) return;

    const userMsg: Message = {
      role: "user",
      content: `${tool.label}\n\n${tool.prompt}`,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setActiveTool(tool.label);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Vous devez être connecté.");

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/${tool.endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          action: tool.action,
          prompt: tool.prompt,
          assetType: tool.endpoint === "ai-image-enhance" ? "menu_visual" : undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `Erreur ${resp.status}`);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: formatToolResponse(tool.label, data) },
      ]);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Erreur inconnue";
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
        <div className="text-center py-12 space-y-4">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold">Aucun restaurant</h2>
          <p className="text-muted-foreground">Créez votre restaurant pour accéder à l'assistant IA.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold flex items-center gap-2">
                Assistant IA
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">Beta</Badge>
              </h1>
              <p className="text-xs text-muted-foreground">Analyse vos données et optimise vos performances</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Nouveau chat
            </Button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-8 px-4">
              <div className="text-center space-y-2">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="font-display text-2xl font-bold">Bonjour, {restaurant.name} 👋</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Je suis votre assistant IA. J'analyse vos ventes, réservations, avis, campagnes et menu pour vous donner des conseils personnalisés.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {QUICK_TOOLS.map((tool) => (
                  <button
                    key={tool.label}
                    onClick={() => handleQuickTool(tool)}
                    className="text-left rounded-xl border bg-primary/5 p-4 hover:border-primary/50 hover:bg-primary/10 transition-all group"
                    disabled={isLoading || Boolean(activeTool)}
                  >
                    <tool.icon className="h-5 w-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-semibold">{tool.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{tool.prompt}</p>
                  </button>
                ))}
                {SUGGESTED_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => handleSend(suggestion.prompt)}
                    className="text-left rounded-xl border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
                  >
                    <suggestion.icon className="h-5 w-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-semibold">{suggestion.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{suggestion.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <Card className={`max-w-[85%] p-4 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </Card>
                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <Card className="p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {activeTool ? `${activeTool}...` : "Analyse en cours..."}
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t pt-4 shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur vos performances..."
              className="resize-none min-h-[48px] max-h-32"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || !restaurant}
              size="icon"
              className="h-12 w-12 shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            L'IA analyse les données des 30 derniers jours de votre restaurant
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
