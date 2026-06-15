import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, History, Loader2, MessageSquarePlus, Send, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askClientSupport,
  getClientSupportConversationMessages,
  getClientSupportConversations,
  type ClientSupportConversation,
  type TokAiMessage,
} from "@/lib/ai/tokAiClient";
import { useAuth } from "@/lib/auth-context";
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

function isHelpChatSurface(value: unknown): value is HelpChatSurface {
  return value === "client" || value === "restaurant" || value === "admin" || value === "courier" || value === "public";
}

function isHelpChatAgentId(value: unknown): value is HelpChatAgentId {
  return value === "support_ai" || value === "orders_ai" || value === "payments_ai";
}

function getConversationContext(conversation: ClientSupportConversation) {
  const metadata = conversation.metadata || {};
  const context = metadata.context && typeof metadata.context === "object"
    ? metadata.context as Record<string, unknown>
    : {};

  return {
    surface: isHelpChatSurface(context.surface) ? context.surface : null,
    agentId: isHelpChatAgentId(context.agentId) ? context.agentId : null,
  };
}

function formatChatReference(value: string | null | undefined) {
  return value ? value.slice(0, 8).toUpperCase() : null;
}

function getActiveChatReference(activeConversationId: string | null, supportTicketId: string | null) {
  if (supportTicketId) return `Ticket #${formatChatReference(supportTicketId)}`;
  if (activeConversationId) return `Conversation #${formatChatReference(activeConversationId)}`;
  return null;
}

export default function SupportChat() {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [chatSurface, setChatSurface] = useState<HelpChatSurface>("client");
  const [selectedAgent, setSelectedAgent] = useState<HelpChatAgentId>("support_ai");
  const [history, setHistory] = useState<ChatMessage[]>(() =>
    getInitialHistory("support_ai", "client")
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [supportTicketId, setSupportTicketId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ClientSupportConversation[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeAgent = AGENTS[selectedAgent];
  const activeChatReference = getActiveChatReference(activeConversationId, supportTicketId);
  const isChatAvailable = Boolean(user) && !loading;

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
      setActiveConversationId(null);
      setSupportTicketId(null);
      setIsHistoryOpen(false);
      setHistoryError(null);
      setInputValue("");
      setIsTyping(false);
      setIsOpen(true);
    };

    return () => {
      window.openChat = undefined;
    };
  }, []);

  useEffect(() => {
    if (!isChatAvailable) {
      setIsHistoryOpen(false);
      setIsHistoryLoading(false);
      setLoadingConversationId(null);
      setInputValue("");
      setIsTyping(false);
    }
  }, [isChatAvailable]);

  const resetChat = () => {
    setHistory(getInitialHistory(selectedAgent, chatSurface));
    setActiveConversationId(null);
    setSupportTicketId(null);
    setHistoryError(null);
    setInputValue("");
    setIsTyping(false);
  };

  const handleAgentChange = (agentId: HelpChatAgentId) => {
    setSelectedAgent(agentId);
    setHistory(getInitialHistory(agentId, chatSurface));
    setActiveConversationId(null);
    setSupportTicketId(null);
    setInputValue("");
    setIsTyping(false);
  };

  const loadConversationHistory = async () => {
    if (!isChatAvailable) return;

    setIsHistoryOpen(true);
    setHistoryError(null);
    setIsHistoryLoading(true);

    try {
      const conversations = await getClientSupportConversations();
      setConversationHistory(conversations);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Historique indisponible.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadConversationMessages = async (conversation: ClientSupportConversation) => {
    setLoadingConversationId(conversation.id);
    setHistoryError(null);

    try {
      const { surface, agentId } = getConversationContext(conversation);
      const nextSurface = surface || chatSurface;
      const nextAgentId = agentId || selectedAgent;
      const messages = await getClientSupportConversationMessages(conversation.id);
      const nextHistory = messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          type: message.role === "user" ? "user" as const : "bot" as const,
          text: message.content,
        }));

      setChatSurface(nextSurface);
      setSelectedAgent(nextAgentId);
      setActiveConversationId(conversation.id);
      setSupportTicketId(null);
      setHistory(nextHistory.length > 0 ? nextHistory : getInitialHistory(nextAgentId, nextSurface));
      setInputValue("");
      setIsTyping(false);
      setIsHistoryOpen(false);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Conversation indisponible.");
    } finally {
      setLoadingConversationId(null);
    }
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();

    if (!isChatAvailable || !inputValue.trim() || isTyping) return;

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
        conversationId: activeConversationId,
        context: {
          agentId: selectedAgent,
          surface: chatSurface,
        },
      });

      setActiveConversationId(data?.conversationId || activeConversationId);
      setSupportTicketId(data?.supportTicketId || null);

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
                      {isChatAvailable ? activeAgent.label : "Chat indisponible"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${isChatAvailable ? "animate-pulse bg-green-400" : "bg-amber-200"}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        {isChatAvailable ? "OpenAI en ligne" : "Connexion requise"}
                      </span>
                    </div>
                    {activeChatReference ? (
                      <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-wider opacity-90">
                        {activeChatReference}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isChatAvailable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={loadConversationHistory}
                      className="h-9 gap-1.5 rounded-full px-2 text-xs text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                    >
                      <History className="h-4 w-4" />
                      Historique
                    </Button>
                  ) : null}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-full p-1.5 transition-colors hover:bg-white/10"
                    aria-label="Fermer le chat"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {isChatAvailable ? (
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
              ) : null}
            </div>

            {isChatAvailable ? (
              <>
                {isHistoryOpen ? (
                  <div className="max-h-56 overflow-y-auto border-b bg-card p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Historique</p>
                      <Button type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-full text-xs" onClick={resetChat}>
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        Nouvelle
                      </Button>
                    </div>
                    {historyError ? <p className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive">{historyError}</p> : null}
                    {isHistoryLoading ? (
                      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement de l'historique...
                      </div>
                    ) : conversationHistory.length > 0 ? (
                      <div className="space-y-2">
                        {conversationHistory.map((conversation) => (
                          <button
                            key={conversation.id}
                            type="button"
                            onClick={() => loadConversationMessages(conversation)}
                            className="w-full rounded-xl border bg-background p-3 text-left text-xs transition hover:border-primary/40 hover:bg-primary/5"
                          >
                            <span className="block truncate font-semibold text-foreground">
                              {conversation.title || "Conversation support IA"}
                            </span>
                            <span className="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                              Conversation #{formatChatReference(conversation.id)}
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                              <span>{conversation.status}</span>
                              <span>
                                {loadingConversationId === conversation.id ? "Ouverture..." : new Date(conversation.updated_at).toLocaleDateString("fr-CH")}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        Aucune ancienne conversation trouvee pour ce compte.
                      </p>
                    )}
                  </div>
                ) : null}

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
                      {activeChatReference ? (
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {activeChatReference}
                        </p>
                      ) : null}
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
              </>
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-4 bg-muted/20 p-5 text-sm">
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-base font-semibold text-foreground">Chat indisponible</p>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    {loading
                      ? "Vérification de votre session en cours."
                      : "Connectez-vous pour utiliser le chat support TOK et retrouver vos conversations."}
                  </p>
                </div>
                <Button asChild className="rounded-full">
                  <Link to="/auth">Se connecter</Link>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
