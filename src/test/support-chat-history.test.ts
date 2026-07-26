import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("support chat backend history", () => {
  it("loads previous backend conversations from the global chat history button", () => {
    const supportChat = read("src/components/SupportChat.tsx");
    const aiClient = read("src/lib/ai/tokAiClient.ts");

    expect(supportChat).toContain("History");
    expect(supportChat).toContain("Historique");
    expect(supportChat).toContain("loadConversationHistory");
    expect(supportChat).toContain("loadConversationMessages");
    expect(supportChat).toContain("activeConversationId");
    expect(supportChat).toContain("conversationId: activeConversationId");
    expect(supportChat).toContain("formatChatReference");
    expect(supportChat).toContain("activeChatReference");
    expect(supportChat).toContain("Conversation #");
    expect(supportChat).toContain("Ticket #");

    expect(aiClient).toContain("conversationId?: string | null");
    expect(aiClient).toContain("getClientSupportConversations");
    expect(aiClient).toContain("getClientSupportConversationMessages");
    expect(aiClient).toContain(')("ai_conversations")');
    expect(aiClient).toContain(')("ai_messages")');
  });

  it("continues an existing backend conversation instead of recreating it each turn", () => {
    const edgeFunction = read("supabase/functions/ai-client-support/index.ts");

    expect(edgeFunction).toContain("requestedConversationId");
    expect(edgeFunction).toContain("existingConversation");
    expect(edgeFunction).toContain("messagesToPersist");
    expect(edgeFunction).toContain("conversationId = requestedConversationId");
    expect(edgeFunction).toContain("const { error: userMessagesError } = await actor.adminClient");
    expect(edgeFunction).toContain(".insert(messagesToPersist.map((message) => ({");
    expect(edgeFunction).toContain("metadata: {");
    expect(edgeFunction).toContain('delivery: "admin_thread"');
    expect(edgeFunction).toContain('delivery: "ai_processing"');
    expect(edgeFunction).not.toContain(": undefined,");
    expect(edgeFunction).toContain("support_ticket_id");
  });
});
