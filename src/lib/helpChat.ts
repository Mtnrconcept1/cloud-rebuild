export type HelpChatAgentId = "support_ai" | "orders_ai" | "payments_ai";

export type HelpChatSurface = "client" | "restaurant" | "admin" | "courier" | "public";

export type HelpChatOpenOptions = {
  agentId?: HelpChatAgentId;
  surface?: HelpChatSurface;
};

declare global {
  interface Window {
    openChat?: (options?: HelpChatOpenOptions) => void;
  }
}

export function openHelpChat(options: HelpChatOpenOptions = {}) {
  if (typeof window === "undefined") return;
  window.openChat?.(options);
}
