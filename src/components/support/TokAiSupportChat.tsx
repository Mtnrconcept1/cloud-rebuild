import { useState } from "react";
import { Bot, Send, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { askClientSupport, type TokAiSupportMessage } from "@/lib/ai/tokAiClient";

export type TokAiSupportChatProps = {
  restaurantId?: string | null;
  orderId?: string | null;
  reservationId?: string | null;
  compact?: boolean;
};

const QUICK_PROMPTS = [
  "Ma commande est en retard",
  "Il manque un article",
  "J'ai une question sur ma réservation",
  "J'ai un problème de paiement",
  "Je veux parler à quelqu'un",
];

export default function TokAiSupportChat({ restaurantId, orderId, reservationId, compact = false }: TokAiSupportChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<TokAiSupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastTicketId, setLastTicketId] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const sendMessage = async (content = input) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const nextMessages: TokAiSupportMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await askClientSupport({
        messages: nextMessages,
        orderId,
        reservationId,
        restaurantId,
        context: {
          source: "TokAiSupportChat",
          safety_note: "Ne jamais promettre remboursement. Escalader si risque médical, juridique, paiement sensible ou demande d'humain.",
        },
      });

      const reply = typeof response.reply === "string" ? response.reply : "Votre demande a été transmise au support TOK.";
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      setLastTicketId(typeof response.supportTicketId === "string" ? response.supportTicketId : null);
      setLastStatus(typeof response.status === "string" ? response.status : null);
    } catch (error) {
      toast({ title: "Erreur support IA", description: error instanceof Error ? error.message : "Impossible de contacter l'agent IA.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={compact ? "rounded-2xl" : "rounded-3xl"}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary"><Bot className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Chat IA TOK — questions & sinistres</h2>
            <p className="text-sm text-muted-foreground">Explique ton problème. L'agent peut créer un ticket et escalader vers l'équipe TOK si nécessaire.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <Button key={prompt} type="button" variant="outline" size="sm" onClick={() => sendMessage(prompt)} disabled={loading}>
              {prompt}
            </Button>
          ))}
        </div>

        <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border bg-muted/30 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun message pour le moment. Décris le problème ou utilise un raccourci.</p>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "ml-auto max-w-[85%] bg-primary text-primary-foreground" : "mr-auto max-w-[85%] bg-background"}`}>
                {message.content}
              </div>
            ))
          )}
        </div>

        {lastStatus && (
          <div className="flex items-center gap-2 rounded-2xl border bg-background p-3 text-sm">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span>Statut : <strong>{lastStatus}</strong>{lastTicketId ? ` · Ticket ${lastTicketId.slice(0, 8)}` : ""}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Décris ta question, ton retard, ton erreur de commande ou ton sinistre..." className="min-h-20" />
          <Button type="button" className="self-end" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">L'agent IA ne valide pas seul les remboursements importants. Les cas sensibles passent en escalade humaine.</p>
      </CardContent>
    </Card>
  );
}
