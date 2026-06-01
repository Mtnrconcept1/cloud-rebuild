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

export default function DashboardAdvisor() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
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
                  Analyse en cours...
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
