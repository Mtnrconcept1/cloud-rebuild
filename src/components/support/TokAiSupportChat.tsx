import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { getSupabase } from "@/integrations/supabase/client";
import { askClientSupport, type TokAiMessage } from "@/lib/ai/tokAiClient";
import { normalizeVisibleAiSupportText } from "@/lib/ai/supportText";
import { useAuth } from "@/lib/auth-context";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { askCommercialDemoAi, type CommercialDemoAiRuntime } from "@/lib/commercialDemoAi";

type TokAiSupportChatProps = {
  orderId?: string | null;
  reservationId?: string | null;
  restaurantId?: string | null;
  context?: Record<string, unknown>;
  compact?: boolean;
};

type SupportDraft = {
  messages: TokAiMessage[];
  input: string;
  status: "open" | "waiting_restaurant" | "waiting_tok" | "resolved" | "escalated";
  conversationId?: string | null;
  supportTicketId?: string | null;
  humanHandoffActive?: boolean;
};

type RealtimeAiMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

const supabase = getSupabase();

export default function TokAiSupportChat({
  orderId,
  reservationId,
  restaurantId,
  context,
  compact = false,
}: TokAiSupportChatProps) {
  const { user, loading } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const demoRuntime = useMemo<CommercialDemoAiRuntime | null>(() => {
    if (!commercialDemoFrame || commercialDemoFrame.surface === "commercial") return null;
    return {
      sessionId: commercialDemoFrame.config.sessionId,
      surface: commercialDemoFrame.surface,
    };
  }, [commercialDemoFrame]);
  const isCommercialDemo = Boolean(demoRuntime);
  const storageScope = demoRuntime
    ? `${demoRuntime.sessionId}:${demoRuntime.surface}:${orderId || reservationId || restaurantId || "general"}`
    : orderId || reservationId || restaurantId || "general";
  const [draft, setDraft] = useSessionStorageState<SupportDraft>(
    `tok-ai-support-chat:${storageScope}`,
    { messages: [], input: "", status: "open" },
  );
  const { messages, input, status } = draft;
  const [isSending, setIsSending] = useState(false);
  const [tokTyping, setTokTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isChatAvailable = Boolean(user) && !loading;
  const humanHandoffActive = Boolean(draft.humanHandoffActive);

  const lastAssistantReply = useMemo(
    () => normalizeVisibleAiSupportText(messages.filter((message) => message.role === "assistant").at(-1)?.content || ""),
    [messages],
  );

  useEffect(() => {
    if (isCommercialDemo || !isChatAvailable || !draft.conversationId) return;

    const messageChannel = supabase
      .channel(`embedded-support-chat-messages-${draft.conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_messages", filter: `conversation_id=eq.${draft.conversationId}` },
        ({ new: inserted }) => {
          const message = inserted as RealtimeAiMessage;
          if (!message?.content || !["user", "assistant"].includes(message.role)) return;
          const metadata = message.metadata || {};
          const adminMessage = metadata.author_role === "admin" || metadata.source === "admin-support";
          if (adminMessage) {
            setDraft((previous) => ({
              ...previous,
              humanHandoffActive: true,
              messages: previous.messages.some((item) => item.content === message.content)
                ? previous.messages
                : [...previous.messages, { role: "assistant", content: normalizeVisibleAiSupportText(message.content) }],
            }));
          }
        },
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`support-chat-${draft.conversationId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const role = String((payload as Record<string, unknown>)?.role || "");
        const isTyping = Boolean((payload as Record<string, unknown>)?.isTyping);
        if (role !== "admin") return;
        if (tokTypingTimeoutRef.current) clearTimeout(tokTypingTimeoutRef.current);
        setTokTyping(isTyping);
        if (isTyping) {
          tokTypingTimeoutRef.current = setTimeout(() => setTokTyping(false), 3500);
        }
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      if (tokTypingTimeoutRef.current) clearTimeout(tokTypingTimeoutRef.current);
      if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
      setTokTyping(false);
      void supabase.removeChannel(messageChannel);
      void supabase.removeChannel(typingChannel);
      if (typingChannelRef.current === typingChannel) typingChannelRef.current = null;
    };
  }, [draft.conversationId, isChatAvailable, isCommercialDemo, setDraft]);

  function broadcastTyping(isTyping: boolean) {
    const channel = typingChannelRef.current;
    if (!channel) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { role: context?.surface === "courier" ? "courier" : context?.surface === "restaurant" ? "restaurant" : "client", isTyping },
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!isChatAvailable || !content || isSending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setDraft((previous) => ({ ...previous, messages: nextMessages, input: "" }));
    broadcastTyping(false);
    setError(null);
    setIsSending(true);

    try {
      if (demoRuntime) {
        const result = await askCommercialDemoAi({
          runtime: demoRuntime,
          tool: "support_chat",
          message: content,
          conversationId: draft.conversationId || null,
          context: {
            order_id: orderId,
            reservation_id: reservationId,
            restaurant_id: restaurantId,
            ...context,
          },
        });
        const normalizedReply = normalizeVisibleAiSupportText(result.reply || "");
        setDraft((previous) => ({
          ...previous,
          status: "open",
          conversationId: result.conversation_id,
          supportTicketId: null,
          humanHandoffActive: false,
          messages: normalizedReply
            ? [...nextMessages, { role: "assistant", content: normalizedReply }]
            : nextMessages,
        }));
        return;
      }

      const result = await askClientSupport({
        messages: nextMessages,
        conversationId: draft.conversationId || null,
        orderId,
        reservationId,
        restaurantId,
        context: {
          guardrail: "Ne jamais promettre remboursement sans validation humaine.",
          ...context,
        },
      });
      const normalizedReply = normalizeVisibleAiSupportText(result.reply || "");

      setDraft((previous) => ({
        ...previous,
        status: result.status,
        conversationId: result.conversationId,
        supportTicketId: result.supportTicketId,
        humanHandoffActive: Boolean(result.handoffToAdmin || result.aiDisabled || previous.humanHandoffActive),
        messages: result.handoffToAdmin || result.aiDisabled || !normalizedReply
          ? nextMessages
          : [...nextMessages, { role: "assistant", content: normalizedReply }],
      }));
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Assistant IA indisponible.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card className={compact ? "border-primary/20" : "border-primary/20 bg-primary/5"}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" />
            {isChatAvailable ? (humanHandoffActive ? "Support TOK en direct" : "Support IA TOK") : "Chat indisponible"}
          </CardTitle>
          <Badge variant={isChatAvailable && (status === "escalated" || status === "waiting_tok") ? "secondary" : "outline"}>
            {isChatAvailable ? (humanHandoffActive ? "TOK en direct" : status) : "connexion requise"}
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{isCommercialDemo
            ? "OpenAI réel dans un chat isolé · crédits Démo illimités · coût suivi en interne · aucun ticket de production créé."
            : "Ne jamais promettre remboursement: les cas sensibles passent en escalade humaine."}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isChatAvailable ? (
          <>
        {lastAssistantReply ? (
          <div className="rounded-xl border bg-background p-3 text-sm leading-6">
            {lastAssistantReply}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-background/70 p-3 text-sm text-muted-foreground">
            Posez une question sur une commande, une réservation ou un incident. Le statut peut passer en `waiting_tok` ou `escalated`.
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {tokTyping ? (
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs text-muted-foreground">
            <span>TOK ecrit</span>
            <span className="inline-flex animate-pulse gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((previous) => ({ ...previous, input: value }));
              broadcastTyping(Boolean(value.trim()));
              if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
              localTypingStopTimeoutRef.current = setTimeout(() => broadcastTyping(false), 1600);
            }}
            placeholder="Décrivez le problème ou la question client..."
            className="min-h-24"
          />
          <Button type="submit" disabled={!input.trim() || isSending} className="gap-2">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {humanHandoffActive ? "Envoyer a TOK" : "Envoyer au support IA"}
          </Button>
        </form>
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed bg-background/70 p-4 text-sm">
            <p className="font-medium text-foreground">Chat indisponible</p>
            <p className="leading-6 text-muted-foreground">
              {loading
                ? "Vérification de votre session en cours."
                : "Connectez-vous pour accéder au support IA TOK et créer un dossier traçable."}
            </p>
            <Button asChild className="rounded-full">
              <Link to="/auth">Se connecter</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
