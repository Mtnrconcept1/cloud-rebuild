import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, MessageSquarePlus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askClientSupport } from "@/lib/ai/tokAiClient";
import { type HelpChatOpenOptions, type HelpChatSurface } from "@/lib/helpChat";
import { useActiveFeatures } from "@/lib/featureFlags";

type ChatMessage = {
  type: "bot" | "user";
  text: string;
};

type ChatState = {
  open: boolean;
  surface: HelpChatSurface;
};

const INITIAL_MESSAGE = "Bonjour, je suis le support TOK. Je peux vous aider sur les services visibles dans votre espace.";

export default function SupportChat() {
  const activeFeatures = useActiveFeatures();
  const [state, setState] = useState<ChatState>({ open: false, surface: "public" });
  const [messages, setMessages] = useState<ChatMessage[]>([{ type: "bot", text: INITIAL_MESSAGE }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.openChat = (options?: HelpChatOpenOptions) => {
      setState({ open: true, surface: options?.surface || "public" });
    };
    return () => {
      window.openChat = undefined;
    };
  }, []);

  useEffect(() => {
    if (!state.open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, state.open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const nextMessages = [...messages, { type: "user" as const, text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const response = await askClientSupport({
        messages: nextMessages.map((message) => ({
          role: message.type === "user" ? "user" as const : "assistant" as const,
          content: message.text,
        })),
        context: {
          surface: state.surface,
          agentId: "support_ai",
          activeFeatures: Array.from(activeFeatures),
        },
      });
      setMessages((current) => [...current, { type: "bot", text: response.reply }]);
    } catch (error) {
      setMessages((current) => [...current, { type: "bot", text: error instanceof Error ? error.message : "Réponse indisponible." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!activeFeatures.has("ai_support_chat")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[1000] flex flex-col items-end gap-3">
      {state.open ? (
        <div className="flex h-[min(620px,calc(100vh-2rem))] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Support TOK</p>
                <p className="text-xs text-muted-foreground">Assistance générale</p>
              </div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => setState((current) => ({ ...current, open: false }))}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div key={index} className={message.type === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.type === "user" ? "max-w-[82%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground" : "max-w-[82%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground"}>
                  {message.text}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Réponse en cours
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
            <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écrire au support..." />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      ) : null}

      <Button type="button" className="h-14 rounded-full px-5 shadow-xl" onClick={() => setState((current) => ({ ...current, open: true }))}>
        <MessageSquarePlus className="mr-2 h-5 w-5" /> Help
      </Button>
    </div>
  );
}
