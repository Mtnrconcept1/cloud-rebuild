import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, History, Loader2, MessageSquarePlus, Send, ShieldCheck, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askAdminDashboardChat,
  askClientSupport,
  getAdminDashboardChatConversations,
  getAdminDashboardChatMessages,
  getClientSupportConversationMessages,
  getClientSupportConversations,
  type ClientSupportConversation,
  type TokAiMessage,
} from "@/lib/ai/tokAiClient";
import { normalizeVisibleAiSupportText } from "@/lib/ai/supportText";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isAdminAppHost, isAdminPath } from "@/lib/adminDomains";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import { type HelpChatAgentId, type HelpChatOpenOptions, type HelpChatSurface } from "@/lib/helpChat";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  askCommercialDemoAi,
  getCommercialDemoAiHistory,
  type CommercialDemoAiConversation,
  type CommercialDemoAiRuntime,
} from "@/lib/commercialDemoAi";

type ChatMessage = {
  id?: string;
  type: "bot" | "user";
  text: string;
};

type RealtimeAiMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
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
  admin_dashboard_ai: {
    id: "admin_dashboard_ai",
    label: "Assistant IA Admin",
    badge: "Acces administrateur principal",
  },
};

const SURFACE_LABELS: Record<HelpChatSurface, string> = {
  client: "l'espace client",
  restaurant: "le dashboard restaurateur",
  admin: "l'administration TOK",
  courier: "l'espace livreur",
  public: "TOK",
};

const TYPING_ROLE_LABELS: Record<string, string> = {
  admin: "TOK",
  client: "Le client",
  restaurant: "Le restaurateur",
  restaurateur: "Le restaurateur",
  courier: "Le livreur",
  public: "La personne",
};

const supabase = getSupabase();

function getDefaultAgentForSurface(surface: HelpChatSurface): HelpChatAgentId {
  if (surface === "admin") return "admin_dashboard_ai";
  if (surface === "courier") return "orders_ai";
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

function getInitialHistory(
  agentId: HelpChatAgentId,
  surface: HelpChatSurface,
  commercialDemo = false,
): ChatMessage[] {
  const agent = AGENTS[agentId];
  const surfaceLabel = SURFACE_LABELS[surface] || SURFACE_LABELS.client;

  return [
    {
      type: "bot",
      text: commercialDemo
        ? `Bonjour, je suis ${agent.label} dans la session de démonstration de ${surfaceLabel}. Testez librement : mes réponses utilisent réellement OpenAI, restent isolées et ne débitent aucun crédit TOK.`
        : `Bonjour, je suis ${agent.label}, piloté par OpenAI pour ${surfaceLabel}. Décrivez votre question ou le blocage à résoudre.`,
    },
  ];
}

function toClientSupportConversation(conversation: CommercialDemoAiConversation): ClientSupportConversation {
  return {
    id: conversation.id,
    scope: conversation.surface === "restaurant" ? "restaurant" : "client",
    title: conversation.title,
    status: conversation.status,
    support_incident_id: null,
    restaurant_id: null,
    order_id: null,
    reservation_id: null,
    metadata: {
      commercial_demo: true,
      context: { surface: conversation.surface },
    },
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  };
}

function isHelpChatSurface(value: unknown): value is HelpChatSurface {
  return value === "client" || value === "restaurant" || value === "admin" || value === "courier" || value === "public";
}

function isHelpChatAgentId(value: unknown): value is HelpChatAgentId {
  return value === "support_ai" || value === "orders_ai" || value === "payments_ai" || value === "admin_dashboard_ai";
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

function getSupportTypingTopic(activeConversationId: string | null, supportTicketId: string | null) {
  const target = activeConversationId || supportTicketId;
  return target ? `support-chat-${target}` : null;
}

function isConversationHandedOff(conversation: ClientSupportConversation) {
  const metadata = conversation.metadata || {};
  return metadata.handoff_to_admin === true || metadata.ai_disabled === true;
}

function isAdminSupportMessage(message: RealtimeAiMessage) {
  const metadata = message.metadata || {};
  return metadata.author_role === "admin" || metadata.source === "admin-support";
}

function getTypingRoleForSurface(surface: HelpChatSurface) {
  if (surface === "restaurant") return "restaurant";
  if (surface === "courier") return "courier";
  return "client";
}

function getChatUnavailableMessage({
  loading,
  featureFlagsLoading,
  isAdminRoute,
  isAdminFeatureEnabled,
  roles,
}: {
  loading: boolean;
  featureFlagsLoading: boolean;
  isAdminRoute: boolean;
  isAdminFeatureEnabled: boolean;
  roles: string[];
}) {
  if (loading) return "Vérification de votre session en cours.";
  if (isAdminRoute && featureFlagsLoading) return "Chargement des droits de l'Assistant IA Admin.";
  if (isAdminRoute && !roles.includes("admin")) return "Compte administrateur requis pour utiliser l'Assistant IA Admin.";
  if (isAdminRoute && !isAdminFeatureEnabled) return "L'Assistant IA Admin est désactivé par feature flag.";
  return "Connectez-vous pour utiliser le chat support TOK et retrouver vos conversations.";
}

export default function SupportChat() {
  const location = useLocation();
  const commercialDemoFrame = useCommercialDemoFrame();
  const demoRuntime = useMemo<CommercialDemoAiRuntime | null>(() => {
    if (!commercialDemoFrame || commercialDemoFrame.surface === "commercial") return null;
    return {
      sessionId: commercialDemoFrame.config.sessionId,
      surface: commercialDemoFrame.surface,
    };
  }, [commercialDemoFrame]);
  const isCommercialDemo = Boolean(demoRuntime);
  const initialSurface: HelpChatSurface = demoRuntime?.surface || "client";
  const initialAgent = getDefaultAgentForSurface(initialSurface);
  const { user, loading, roles } = useAuth();
  const { activeFeatures, loading: featureFlagsLoading } = useFeatureFlagSnapshot({
    enabled: !isCommercialDemo,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [chatSurface, setChatSurface] = useState<HelpChatSurface>(initialSurface);
  const [selectedAgent, setSelectedAgent] = useState<HelpChatAgentId>(initialAgent);
  const [history, setHistory] = useState<ChatMessage[]>(() =>
    getInitialHistory(initialAgent, initialSurface, isCommercialDemo)
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [supportTicketId, setSupportTicketId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ClientSupportConversation[]>([]);
  const [demoConversationHistory, setDemoConversationHistory] = useState<CommercialDemoAiConversation[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [remoteTypingRole, setRemoteTypingRole] = useState("admin");
  const [humanHandoffActive, setHumanHandoffActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatDialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const activeAgent = AGENTS[selectedAgent];
  const activeChatReference = getActiveChatReference(activeConversationId, supportTicketId);
  const isAdminRoute = isAdminPath(location.pathname)
    || (typeof window !== "undefined" && isAdminAppHost(window.location.hostname));
  const adminDashboardAiChatEnabled = !featureFlagsLoading && activeFeatures.has("admin_dashboard_ai_chat");
  const isAdminPrivilegedSurface = chatSurface === "admin"
    && selectedAgent === "admin_dashboard_ai"
    && isAdminRoute;
  const isChatAvailable = Boolean(user)
    && !loading
    && (!isAdminPrivilegedSurface || (roles.includes("admin") && adminDashboardAiChatEnabled));
  const availableAgents = !isCommercialDemo && isAdminRoute && chatSurface === "admin"
    ? [AGENTS.admin_dashboard_ai]
    : Object.values(AGENTS).filter((agent) => agent.id !== "admin_dashboard_ai");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isTyping, remoteTyping]);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = chatDialogRef.current;
    if (!dialog) return;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");

    const focusFrame = window.requestAnimationFrame(() => {
      const messageInput = dialog.querySelector<HTMLInputElement>('input:not([disabled])');
      const firstFocusableElement = getFocusableElements()[0];
      (messageInput || firstFocusableElement || dialog).focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      } else if (event.shiftKey && (activeElement === firstElement || activeElement === dialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      const previouslyFocusedElement = previouslyFocusedElementRef.current;
      if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
      previouslyFocusedElementRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    window.openChat = (options?: HelpChatOpenOptions) => {
      const normalized = normalizeOpenOptions(options);
      const openingFromAdminSurface = isAdminPath(location.pathname)
        || (typeof window !== "undefined" && isAdminAppHost(window.location.hostname));
      const canOpenAdminAgent = openingFromAdminSurface
        && !isCommercialDemo
        && (normalized.surface === "admin" || !options?.surface);
      const nextSurface = demoRuntime?.surface
        || (canOpenAdminAgent ? "admin" : normalized.surface === "admin" ? "public" : normalized.surface);
      const nextAgentId = canOpenAdminAgent
        ? "admin_dashboard_ai"
        : normalized.agentId === "admin_dashboard_ai"
          ? "support_ai"
          : normalized.agentId;

      setChatSurface(nextSurface);
      setSelectedAgent(nextAgentId);
      setHistory(getInitialHistory(nextAgentId, nextSurface, isCommercialDemo));
      setActiveConversationId(null);
      setSupportTicketId(null);
      setIsHistoryOpen(false);
      setHistoryError(null);
      setInputValue("");
      setIsTyping(false);
      setRemoteTyping(false);
      setHumanHandoffActive(false);
      setIsOpen(true);
    };

    return () => {
      window.openChat = undefined;
    };
  }, [demoRuntime?.surface, isCommercialDemo, location.pathname]);

  useEffect(() => {
    if (isCommercialDemo || !isAdminRoute || featureFlagsLoading) return;
    if (chatSurface === "admin" && selectedAgent === "admin_dashboard_ai") return;

    setChatSurface("admin");
    setSelectedAgent("admin_dashboard_ai");
    setHistory(getInitialHistory("admin_dashboard_ai", "admin", false));
    setActiveConversationId(null);
    setSupportTicketId(null);
    setIsHistoryOpen(false);
    setHistoryError(null);
    setInputValue("");
    setIsTyping(false);
    setRemoteTyping(false);
    setHumanHandoffActive(false);
  }, [chatSurface, featureFlagsLoading, isAdminRoute, isCommercialDemo, selectedAgent]);

  useEffect(() => {
    if (!isChatAvailable) {
      setIsHistoryOpen(false);
      setIsHistoryLoading(false);
      setLoadingConversationId(null);
      setInputValue("");
      setIsTyping(false);
      setRemoteTyping(false);
      setHumanHandoffActive(false);
    }
  }, [isChatAvailable]);

  useEffect(() => {
    if (isCommercialDemo || !isChatAvailable || !activeConversationId || isAdminPrivilegedSurface) return;

    const messageChannel = supabase
      .channel(`support-chat-messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_messages", filter: `conversation_id=eq.${activeConversationId}` },
        ({ new: inserted }) => {
          const message = inserted as RealtimeAiMessage;
          if (!message?.id || !message.content || !["user", "assistant"].includes(message.role)) return;

          const nextMessage: ChatMessage = {
            id: message.id,
            type: message.role === "user" ? "user" : "bot",
            text: normalizeVisibleAiSupportText(message.content),
          };

          if (message.role === "assistant" && isAdminSupportMessage(message)) {
            setHumanHandoffActive(true);
          }

          setHistory((previous) => {
            if (previous.some((item) => item.id === nextMessage.id)) return previous;
            if (previous.some((item) => item.type === nextMessage.type && item.text === nextMessage.text)) return previous;
            return [...previous, nextMessage];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(messageChannel);
    };
  }, [activeConversationId, isAdminPrivilegedSurface, isChatAvailable, isCommercialDemo]);

  useEffect(() => {
    const topic = getSupportTypingTopic(activeConversationId, supportTicketId);
    if (isCommercialDemo || !isChatAvailable || !topic || isAdminPrivilegedSurface) return;

    const typingChannel = supabase
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const role = String((payload as Record<string, unknown>)?.role || "");
        const typing = Boolean((payload as Record<string, unknown>)?.isTyping);
        if (!role || role === getTypingRoleForSurface(chatSurface)) return;

        if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
        setRemoteTypingRole(role);
        setRemoteTyping(typing);
        if (typing) {
          remoteTypingTimeoutRef.current = setTimeout(() => setRemoteTyping(false), 3500);
        }
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      setRemoteTyping(false);
      if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
      if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
      void supabase.removeChannel(typingChannel);
      if (typingChannelRef.current === typingChannel) typingChannelRef.current = null;
    };
  }, [activeConversationId, chatSurface, isAdminPrivilegedSurface, isChatAvailable, isCommercialDemo, supportTicketId]);

  const resetChat = () => {
    setHistory(getInitialHistory(selectedAgent, chatSurface, isCommercialDemo));
    setActiveConversationId(null);
    setSupportTicketId(null);
    setHistoryError(null);
    setInputValue("");
    setIsTyping(false);
    setRemoteTyping(false);
    setHumanHandoffActive(false);
  };

  const handleAgentChange = (agentId: HelpChatAgentId) => {
    setSelectedAgent(agentId);
    setHistory(getInitialHistory(agentId, chatSurface, isCommercialDemo));
    setActiveConversationId(null);
    setSupportTicketId(null);
    setInputValue("");
    setIsTyping(false);
    setRemoteTyping(false);
    setHumanHandoffActive(false);
  };

  const broadcastClientTyping = (typing: boolean) => {
    const channel = typingChannelRef.current;
    if (!channel) return;

    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { role: getTypingRoleForSurface(chatSurface), isTyping: typing },
    });
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (isCommercialDemo || isAdminPrivilegedSurface) return;

    broadcastClientTyping(Boolean(value.trim()));
    if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
    localTypingStopTimeoutRef.current = setTimeout(() => broadcastClientTyping(false), 1600);
  };

  const loadConversationHistory = async () => {
    if (!isChatAvailable) return;

    setIsHistoryOpen(true);
    setHistoryError(null);
    setIsHistoryLoading(true);

    try {
      if (demoRuntime) {
        const conversations = (await getCommercialDemoAiHistory(demoRuntime, "support_chat"))
          .filter((conversation) => conversation.surface === demoRuntime.surface);
        setDemoConversationHistory(conversations);
        setConversationHistory(conversations.map(toClientSupportConversation));
        return;
      }
      const conversations = isAdminPrivilegedSurface
        ? await getAdminDashboardChatConversations()
        : await getClientSupportConversations();
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
      if (demoRuntime) {
        let demoConversation = demoConversationHistory.find((item) => item.id === conversation.id);
        if (!demoConversation) {
          const conversations = (await getCommercialDemoAiHistory(demoRuntime, "support_chat"))
            .filter((item) => item.surface === demoRuntime.surface);
          setDemoConversationHistory(conversations);
          demoConversation = conversations.find((item) => item.id === conversation.id);
        }
        if (!demoConversation) throw new Error("Conversation de démonstration introuvable.");

        const nextHistory = demoConversation.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            id: message.id,
            type: message.role === "user" ? "user" as const : "bot" as const,
            text: normalizeVisibleAiSupportText(message.content),
          }));
        const nextSurface = demoConversation.surface;
        const nextAgentId = getDefaultAgentForSurface(nextSurface);
        setChatSurface(nextSurface);
        setSelectedAgent(nextAgentId);
        setActiveConversationId(demoConversation.id);
        setSupportTicketId(null);
        setHumanHandoffActive(false);
        setHistory(nextHistory.length > 0
          ? nextHistory
          : getInitialHistory(nextAgentId, nextSurface, true));
        setInputValue("");
        setIsTyping(false);
        setIsHistoryOpen(false);
        return;
      }
      const { surface, agentId } = getConversationContext(conversation);
      const nextSurface = surface || chatSurface;
      const nextAgentId = agentId || selectedAgent;
      const messages = isAdminPrivilegedSurface
        ? await getAdminDashboardChatMessages(conversation.id)
        : await getClientSupportConversationMessages(conversation.id);
      const nextHistory = messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          id: message.id,
          type: message.role === "user" ? "user" as const : "bot" as const,
          text: normalizeVisibleAiSupportText(message.content),
        }));

      setChatSurface(nextSurface);
      setSelectedAgent(nextAgentId);
      setActiveConversationId(conversation.id);
      setSupportTicketId(null);
      setHumanHandoffActive(isConversationHandedOff(conversation));
      setHistory(nextHistory.length > 0 ? nextHistory : getInitialHistory(nextAgentId, nextSurface, false));
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
    broadcastClientTyping(false);
    setHistory(nextHistory);
    setIsTyping(true);

    try {
      if (demoRuntime) {
        const data = await askCommercialDemoAi({
          runtime: demoRuntime,
          tool: "support_chat",
          message: userMsg,
          conversationId: activeConversationId,
          context: {
            agentId: selectedAgent,
            surface: demoRuntime.surface,
            currentPath: location.pathname,
          },
        });
        setActiveConversationId(data.conversation_id);
        setSupportTicketId(null);
        setHumanHandoffActive(false);
        setHistory((previous) => [
          ...previous,
          {
            type: "bot",
            text: normalizeVisibleAiSupportText(data.reply),
          },
        ]);
        return;
      }

      const messages: TokAiMessage[] = nextHistory
        .filter((message) => message.text.trim().length > 0)
        .map((message) => ({
          role: message.type === "user" ? "user" : "assistant",
          content: message.text,
        }));

      if (isAdminPrivilegedSurface) {
        const data = await askAdminDashboardChat({
          messages,
          conversationId: activeConversationId,
          context: {
            agentId: selectedAgent,
            surface: chatSurface,
            currentPath: location.pathname,
            currentUrl: `${location.pathname}${location.search}`,
          },
        });

        setActiveConversationId(data.conversationId || activeConversationId);
        setSupportTicketId(null);
        setHistory((previous) => [
          ...previous,
          {
            type: "bot",
            text: [
              data.reply || "L'Assistant IA Admin n'a pas pu generer de reponse pour le moment.",
              data.suggested_actions?.length ? `\nActions proposees:\n${data.suggested_actions.map((item) => `- ${item}`).join("\n")}` : "",
              data.cited_sources?.length ? `\nSources analysees: ${data.cited_sources.join(", ")}` : "",
            ].filter(Boolean).join("\n"),
          },
        ]);
        return;
      }

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
      setHumanHandoffActive(Boolean(data?.handoffToAdmin || data?.aiDisabled || humanHandoffActive));
      const normalizedReply = normalizeVisibleAiSupportText(data?.reply || "");

      if (data?.handoffToAdmin || data?.aiDisabled) {
        return;
      }

      setHistory((previous) => [
        ...previous,
        {
          type: "bot",
          text: data?.supportTicketId
            ? `${normalizedReply}\n\nTicket support créé : ${data.supportTicketId}`
            : normalizedReply || "L'Assistant IA OpenAI n'a pas pu générer de réponse pour le moment.",
        },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      setHistory((previous) => [
        ...previous,
        {
          type: "bot",
          text: isAdminPrivilegedSurface
            ? [
              "L'Assistant IA Admin est indisponible pour le moment.",
              errorMessage ? `Détail technique : ${errorMessage}` : "",
            ].filter(Boolean).join("\n")
            : isCommercialDemo
              ? "L'Assistant IA de démonstration est momentanément indisponible. Vérifiez que le flag Chat IA est actif puis réessayez."
              : "L'Assistant IA OpenAI est indisponible pour le moment. Réessayez dans quelques instants.",
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
          className="fixed inset-0 z-[1740] bg-black/30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-[calc(env(safe-area-inset-right,0px)+1rem)] z-[1750] flex max-w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-2rem)] flex-col items-end gap-4 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:right-[calc(env(safe-area-inset-right,0px)+1.5rem)]">
        {isOpen ? (
          <div
            ref={chatDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-chat-title"
            tabIndex={-1}
            className="flex h-[min(560px,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem))] w-[min(350px,calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-2rem))] min-w-0 animate-in flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl outline-none slide-in-from-bottom-5 md:w-[420px]"
          >
            <div className="bg-primary p-4 text-primary-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Bot className="h-6 w-6" />
                  </div>

                  <div className="min-w-0">
                    <p id="support-chat-title" className="truncate text-sm font-bold">
                      {isChatAvailable ? (humanHandoffActive ? "Support TOK en direct" : activeAgent.label) : "Chat indisponible"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${isChatAvailable ? "animate-pulse bg-green-400" : "bg-amber-200"}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        {isChatAvailable
                          ? (humanHandoffActive
                            ? "TOK prend le relais"
                            : isCommercialDemo ? "OpenAI réel · Démo illimitée" : "OpenAI en ligne")
                          : "Connexion requise"}
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
                      <span className="max-[379px]:sr-only">Historique</span>
                    </Button>
                  ) : null}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                    aria-label="Fermer le chat"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {isChatAvailable ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block text-[10px] font-bold uppercase tracking-widest opacity-80">
                    {humanHandoffActive
                      ? "Conversation prise en charge"
                      : isAdminPrivilegedSurface
                        ? "Assistant admin"
                        : isCommercialDemo ? "Assistant IA Démo" : "Assistant OpenAI"}
                    <select
                      value={selectedAgent}
                      onChange={(event) => handleAgentChange(event.target.value as HelpChatAgentId)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs outline-none"
                    >
                      {availableAgents.map((agent) => (
                        <option key={agent.id} value={agent.id} className="text-black">
                          {agent.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Badge variant="outline" className="h-9 justify-center rounded-xl border-white/20 bg-white/10 text-[10px] uppercase tracking-widest text-white">
                    {SURFACE_LABELS[chatSurface]}
                  </Badge>
                  {isAdminPrivilegedSurface ? (
                    <div className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white sm:col-span-2">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Acces administrateur principal
                    </div>
                  ) : null}
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
                              {isConversationHandedOff(conversation) ? <span>TOK en direct</span> : null}
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
                        className={`min-w-0 max-w-[85%] whitespace-pre-line rounded-2xl p-3 text-sm shadow-sm [overflow-wrap:anywhere] ${
                          message.type === "user"
                            ? "rounded-br-none bg-primary text-primary-foreground"
                            : "rounded-bl-none border bg-card"
                        }`}
                      >
                        {normalizeVisibleAiSupportText(message.text)}
                      </div>
                    </div>
                  ))}

                  {isTyping || remoteTyping ? (
                    <div className="flex animate-in justify-start fade-in duration-300">
                      <div className="rounded-2xl rounded-bl-none border bg-card px-3 py-4 shadow-sm">
                        {remoteTyping && !isTyping ? (
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {TYPING_ROLE_LABELS[remoteTypingRole] || "La personne"} ecrit
                          </p>
                        ) : null}
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
                        className="max-w-full whitespace-normal text-center text-[10px] uppercase tracking-tighter opacity-60 [overflow-wrap:anywhere]"
                      >
                        {humanHandoffActive
                          ? "TOK en direct"
                          : isCommercialDemo ? "OpenAI réel · crédits Démo illimités · coût suivi en interne" : activeAgent.badge}
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
                      onChange={(event) => handleInputChange(event.target.value)}
                      maxLength={4000}
                      aria-label="Message au support TOK"
                      placeholder={isAdminPrivilegedSurface
                        ? "Question sur les données admin, logs ou opérations..."
                        : isCommercialDemo
                          ? "Testez une question dans cette session Démo..."
                          : "Écrivez votre message à l'Assistant IA OpenAI..."}
                      className="h-10 rounded-full border-0 bg-muted/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/30"
                      disabled={isTyping}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      aria-label="Envoyer le message"
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
                    {getChatUnavailableMessage({
                      loading,
                      featureFlagsLoading,
                      isAdminRoute,
                      isAdminFeatureEnabled: adminDashboardAiChatEnabled,
                      roles,
                    })}
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
