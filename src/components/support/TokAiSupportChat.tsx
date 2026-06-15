import { FormEvent, useMemo, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { askClientSupport, type TokAiMessage } from "@/lib/ai/tokAiClient";
import { useAuth } from "@/lib/auth-context";

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
};

export default function TokAiSupportChat({
  orderId,
  reservationId,
  restaurantId,
  context,
  compact = false,
}: TokAiSupportChatProps) {
  const { user, loading } = useAuth();
  const storageScope = orderId || reservationId || restaurantId || "general";
  const [draft, setDraft] = useSessionStorageState<SupportDraft>(
    `tok-ai-support-chat:${storageScope}`,
    { messages: [], input: "", status: "open" },
  );
  const { messages, input, status } = draft;
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChatAvailable = Boolean(user) && !loading;

  const lastAssistantReply = useMemo(
    () => messages.filter((message) => message.role === "assistant").at(-1)?.content,
    [messages],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!isChatAvailable || !content || isSending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setDraft((previous) => ({ ...previous, messages: nextMessages, input: "" }));
    setError(null);
    setIsSending(true);

    try {
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

      setDraft((previous) => ({
        ...previous,
        status: result.status,
        conversationId: result.conversationId,
        supportTicketId: result.supportTicketId,
        messages: [...nextMessages, { role: "assistant", content: result.reply }],
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
            {isChatAvailable ? "Support IA TOK" : "Chat indisponible"}
          </CardTitle>
          <Badge variant={isChatAvailable && (status === "escalated" || status === "waiting_tok") ? "secondary" : "outline"}>
            {isChatAvailable ? status : "connexion requise"}
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>Ne jamais promettre remboursement: les cas sensibles passent en escalade humaine.</span>
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

        <form onSubmit={submit} className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setDraft((previous) => ({ ...previous, input: event.target.value }))}
            placeholder="Décrivez le problème ou la question client..."
            className="min-h-24"
          />
          <Button type="submit" disabled={!input.trim() || isSending} className="gap-2">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer au support IA
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
