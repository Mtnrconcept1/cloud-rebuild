import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askClientSupport, type TokAiMessage } from "@/lib/ai/tokAiClient";
import { type HelpChatAgentId, type HelpChatOpenOptions, type HelpChatSurface } from "@/lib/helpChat";

type ChatMessage = {
  type: "bot" | "user";
  text: string;
};

type AgentConfig = {
  id: HelpChatAgentId;
  label: string;
  badge: string;
};

const AGENTS: Record<HelpChatAgentId, AgentConfig> = {
  support_ai: {
    id: "support_ai",
    label: "Assistant IA Support",
    badge: "OpenAI API",
  },
  orders_ai: {
    id: "orders_ai",
    label: "Assistant IA Commandes",
    badge: "OpenAI API",
  },
  payments_ai: {
    id: "payments_ai",
    label: "Assistant IA Paiement",
    badge: "OpenAI API",
  },
};

const SURFACE_LABELS: Record<HelpChatSurface, string> = {
  client: "l'espace client",
  restaurant: "le dashboard restaurateur",
  admin: "l'administration TOK",
  courier: "l'espace livreur",
  public: "TOK",
};

function getDefaultAgentForSurface(surface: HelpChatSurface): HelpChatAgentId {
  if (surface === "courier") return "orders_ai";
  if (surface === "admin") return "support_ai";
  return "support_ai";
}

function normalizeOpenOptions(options?: HelpChatOpenOptions) {
  const surface = options?.surface || "client";
  const agentId = options?.agentId || getDefaultAgentForSurface(surface);

  return {
    surface,
    agentId: AGENTS[agentId] ? agentId : "support_ai",
  };
}

function getInitialHistory(agentId: HelpChatAgentId, surface: HelpChatSurface): ChatMessage[] {
  const agent = AGENTS[agentId];
  const surfaceLabel = SURFACE_LABELS[surface] || SURFACE_LABELS.client;

  return [
    {
      type: "bot",
      text: `Bonjour, je suis ${agent.label}, piloté par OpenAI pour ${surfaceLabel}. Décrivez votre question ou le blocage à résoudre.`,
    },
  ];
}

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [chatSurface, setChatSurface] = useState<HelpChatSurface>("client");
  const [selectedAgent, setSelectedAgent] = useState<HelpChatAgentId>("support_ai");
  const [history, setHistory] = useState<ChatMessage[]>(() =>
    getInitialHistory("support_ai", "client")
  );
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeAgent = AGENTS[selectedAgent];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isTyping]);

  useEffect(() => {
    window.openChat = (options?: HelpChatOpenOptions) => {
      const normalized = normalizeOpenOptions(options);
      setChatSurface(normalized.surface);
      setSelectedAgent(normalized.agentId);
      setHistory(getInitialHistory(normalized.agentId, normalized.surface));
      setInputValue("");
      setIsTyping(false);
      setIsOpen(true);
    };

    return () => {
      window.openChat = undefined;
    };
  }, []);

  const resetChat = () => {
    setHistory(getInitialHistory(selectedAgent, chatSurface));
    setInputValue("");
    setIsTyping(false);
  };

  const handleAgentChange = (agentId: HelpChatAgentId) => {
    setSelectedAgent(agentId);
    setHistory(getInitialHistory(agentId, chatSurface));
    setInputValue("");
    setIsTyping(false);
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();

    if (!inputValue.trim() || isTyping) return;

    const userMsg = inputValue.trim();
    const nextHistory: ChatMessage[] = [
      ...history,
      { type: "user", text: userMsg },
    ];

    setInputValue("");
    setHistory(nextHistory);
    setIsTyping(true);

    try {
      const messages: TokAiMessage[] = nextHistory
        .filter((message) => message.text.trim().length > 0)
        .map((message) => ({
          role: message.type === "user" ? "user" : "assistant",
          content: message.text,
        }));

      const data = await askClientSupport({
        messages,
        context: {
          agentId: selectedAgent,
          surface: chatSurface,
        },
      });

      setHistory((previous) => [
        ...previous,
        {
          type: "bot",
          text: data?.supportTicketId
            ? `${data.reply}\n\nTicket support créé : ${data.supportTicketId}`
            : data?.reply || "L'Assistant IA OpenAI n'a pas pu générer de réponse pour le moment.",
        },
      ]);
    } catch {
      setHistory((previous) => [
        ...previous,
        {
          type: "bot",
          text: "L'Assistant IA OpenAI est indisponible pour le moment. Réessayez dans quelques instants.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-4 sm:bottom-6 sm:right-6">
        {isOpen ? (
          <div className="flex h-[min(560px,calc(100vh-6rem))] w-[min(350px,calc(100vw-2rem))] animate-in flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl slide-in-from-bottom-5 md:w-[420px]">
            <div className="bg-primary p-4 text-primary-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Bot className="h-6 w-6" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {activeAgent.label}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        OpenAI en ligne
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-white/10"
                  aria-label="Fermer le chat"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block text-[10px] font-bold uppercase tracking-widest opacity-80">
                  Assistant OpenAI
                  <select
                    value={selectedAgent}
                    onChange={(event) => handleAgentChange(event.target.value as HelpChatAgentId)}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs outline-none"
                  >
                    {Object.values(AGENTS).map((agent) => (
                      <option key={agent.id} value={agent.id} className="text-black">
                        {agent.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Badge variant="outline" className="h-9 justify-center rounded-xl border-white/20 bg-white/10 text-[10px] uppercase tracking-widest text-white">
                  {SURFACE_LABELS[chatSurface]}
                </Badge>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4"
            >
              {history.map((message, index) => (
                <div
                  key={`${message.type}-${index}`}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  } animate-in fade-in duration-300`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-2xl p-3 text-sm shadow-sm ${
                      message.type === "user"
                        ? "rounded-br-none bg-primary text-primary-foreground"
                        : "rounded-bl-none border bg-card"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {isTyping ? (
                <div className="flex animate-in justify-start fade-in duration-300">
                  <div className="rounded-2xl rounded-bl-none border bg-card px-3 py-4 shadow-sm">
                    <div className="flex animate-pulse gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t bg-card p-4">
              {!isTyping ? (
                <div className="mb-2 text-center">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-tighter opacity-60"
                  >
                    {activeAgent.badge}
                  </Badge>
                </div>
              ) : null}

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="Écrivez votre message à l'Assistant IA OpenAI..."
                  className="h-10 rounded-full border-0 bg-muted/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/30"
                  disabled={isTyping}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  disabled={!inputValue.trim() || isTyping}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>

              {history.length > 1 && !isTyping ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetChat}
                  className="mt-2 w-full gap-1 text-xs opacity-70"
                >
                  Recommencer
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
