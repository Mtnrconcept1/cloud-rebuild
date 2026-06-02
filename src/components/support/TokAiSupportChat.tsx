import { FormEvent, useMemo, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askClientSupport, type TokAiMessage } from "@/lib/ai/tokAiClient";

type TokAiSupportChatProps = {
  orderId?: string | null;
  reservationId?: string | null;
  restaurantId?: string | null;
  context?: Record<string, unknown>;
  compact?: boolean;
};

export default function TokAiSupportChat({
  orderId,
  reservationId,
  restaurantId,
  context,
  compact = false,
}: TokAiSupportChatProps) {
  const [messages, setMessages] = useState<TokAiMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"open" | "waiting_restaurant" | "waiting_tok" | "resolved" | "escalated">("open");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastAssistantReply = useMemo(
    () => messages.filter((message) => message.role === "assistant").at(-1)?.content,
    [messages],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const result = await askClientSupport({
        messages: nextMessages,
        orderId,
        reservationId,
        restaurantId,
        context: {
          guardrail: "Ne jamais promettre remboursement sans validation humaine.",
          ...context,
        },
      });

      setStatus(result.status);
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Agent IA indisponible.");
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
            Support IA TOK
          </CardTitle>
          <Badge variant={status === "escalated" || status === "waiting_tok" ? "secondary" : "outline"}>
            {status}
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>Ne jamais promettre remboursement: les cas sensibles passent en escalade humaine.</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
            onChange={(event) => setInput(event.target.value)}
            placeholder="Décrivez le problème ou la question client..."
            className="min-h-24"
          />
          <Button type="submit" disabled={!input.trim() || isSending} className="gap-2">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer au support IA
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
