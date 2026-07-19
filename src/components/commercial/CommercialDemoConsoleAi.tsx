import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  askCommercialDemoAi,
  getCommercialDemoAiHistory,
  type CommercialDemoAiRuntime,
} from "@/lib/commercialDemoAi";

type ConsoleMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTED_PROMPTS = [
  "Analyse les réservations de démonstration et propose trois actions prioritaires.",
  "Présente en 30 secondes la valeur de TOK pour ce restaurant.",
  "Quels leviers peuvent augmenter les commandes directes sans alourdir les coûts ?",
] as const;

function initialMessage(restaurantName: string): ConsoleMessage {
  return {
    id: `welcome:${restaurantName}`,
    role: "assistant",
    content: `Je suis l'assistant OpenAI du ${restaurantName}. Posez une question pendant la démonstration : j'utilise uniquement les données isolées de cette session.`,
  };
}

function boundedMessages(messages: ConsoleMessage[]) {
  return messages.slice(-24);
}

export default function CommercialDemoConsoleAi({
  sessionId,
  restaurantName,
}: {
  sessionId: string;
  restaurantName: string;
}) {
  const runtime = useMemo<CommercialDemoAiRuntime>(() => ({
    sessionId,
    // The commercial console intentionally addresses the restaurant workspace.
    // The server still derives the canonical demo restaurant from the session.
    surface: "restaurant",
  }), [sessionId]);
  const [messages, setMessages] = useState<ConsoleMessage[]>(() => [initialMessage(restaurantName)]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const activeRequestRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    activeRequestRef.current = "";
    sendingRef.current = false;
    setIsSending(false);
    setPrompt("");
    setError(null);
    setConversationId(null);
    setMessages([initialMessage(restaurantName)]);
    setHistoryLoading(true);

    void getCommercialDemoAiHistory(runtime, "assistant")
      .then((conversations) => {
        if (cancelled) return;
        const latest = conversations.find((conversation) => (
          conversation.surface === "restaurant"
          && conversation.status === "active"
        ));
        if (!latest) return;

        const restored = latest.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            id: message.id,
            role: message.role as ConsoleMessage["role"],
            content: message.content,
          }));
        if (restored.length > 0) setMessages(boundedMessages(restored));
        setConversationId(latest.id);
      })
      .catch(() => {
        // History is best-effort. A new isolated conversation can still start.
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantName, runtime]);

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    const message = prompt.trim().slice(0, 4000);
    if (!message || sendingRef.current) return;

    sendingRef.current = true;
    setIsSending(true);
    setError(null);
    setPrompt("");
    const userMessage: ConsoleMessage = {
      id: `local:${crypto.randomUUID()}`,
      role: "user",
      content: message,
    };
    setMessages((current) => boundedMessages([...current, userMessage]));

    const requestMarker = `${sessionId}:${crypto.randomUUID()}`;
    activeRequestRef.current = requestMarker;

    try {
      const result = await askCommercialDemoAi({
        runtime,
        tool: "assistant",
        message,
        conversationId,
        context: {
          entrypoint: "commercial_multi_space_console",
          visible_spaces: ["client", "restaurant", "courier"],
        },
      });
      if (activeRequestRef.current !== requestMarker) return;

      setConversationId(result.conversation_id);
      setMessages((current) => boundedMessages([
        ...current,
        {
          id: `assistant:${result.conversation_id}:${crypto.randomUUID()}`,
          role: "assistant",
          content: result.reply,
        },
      ]));
    } catch {
      if (activeRequestRef.current === requestMarker) {
        setError("L'assistant OpenAI de démonstration est momentanément indisponible. Réessayez dans quelques instants.");
      }
    } finally {
      if (activeRequestRef.current === requestMarker) {
        activeRequestRef.current = "";
        sendingRef.current = false;
        setIsSending(false);
      }
    }
  };

  return (
    <Card className="overflow-hidden rounded-[1.75rem] border-violet-200 bg-gradient-to-br from-violet-50/80 via-background to-orange-50/70 dark:border-violet-400/20 dark:from-violet-400/10 dark:to-orange-400/5" data-testid="commercial-demo-console-openai">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-xl">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
                <Bot className="h-5 w-5" />
              </span>
              Assistant OpenAI · Restaurant Démo
            </CardTitle>
            <CardDescription className="mt-2">
              Utilisable directement depuis la console multi-espace, avec le contexte serveur isolé de {restaurantName}.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit shrink-0 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Clé côté serveur uniquement
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <div className="flex min-h-72 flex-col rounded-2xl border bg-background/90">
          <div className="max-h-80 flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-busy={isSending}>
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <p className={message.role === "user"
                  ? "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground [overflow-wrap:anywhere]"
                  : "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm [overflow-wrap:anywhere]"
                }>
                  {message.content}
                </p>
              </div>
            ))}
            {historyLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Restauration de la conversation isolée…
              </div>
            ) : null}
            {isSending ? (
              <div className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                OpenAI analyse la session Démo…
              </div>
            ) : null}
          </div>
          <form onSubmit={submitPrompt} className="border-t p-3">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 4000))}
              maxLength={4000}
              rows={3}
              placeholder="Demandez une analyse, un argumentaire ou des actions pour le restaurant Démo…"
              aria-label="Question à l'assistant OpenAI du restaurant Démo"
              disabled={isSending}
              className="min-h-24 resize-none"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">{prompt.length}/4000 · aucun identifiant restaurant envoyé par le navigateur</span>
              <Button type="submit" className="shrink-0 rounded-xl" disabled={!prompt.trim() || isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Envoyer
              </Button>
            </div>
          </form>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border bg-background/75 p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-violet-600" />Questions de démonstration</p>
            <div className="mt-3 space-y-2">
              {SUGGESTED_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPrompt(suggestion)}
                  disabled={isSending}
                  className="w-full rounded-xl border bg-card p-3 text-left text-xs leading-5 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-violet-400/10"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-xs leading-5 text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
            La session, le compte commercial et le restaurant Démo sont revérifiés côté serveur à chaque demande. Les réponses restent dans les tables <code>commercial_demo_ai_*</code> et n'accèdent jamais aux données d'un restaurant réel.
          </div>
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
