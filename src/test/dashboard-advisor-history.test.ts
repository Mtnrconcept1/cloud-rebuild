import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("dashboard advisor history", () => {
  it("exposes a restaurant-scoped consultable AI history", () => {
    const source = readSource("src/pages/dashboard/DashboardAdvisor.tsx");
    const aiClient = readSource("src/lib/ai/tokAiClient.ts");

    expect(source).toContain("AI_HISTORY_STORAGE_PREFIX");
    expect(source).toContain("saveAdvisorHistoryEntry");
    expect(source).toContain("loadAdvisorHistory");
    expect(source).toContain("getRestaurantAdvisorConversations");
    expect(source).toContain("createRestaurantAdvisorConversation");
    expect(source).toContain("appendRestaurantAdvisorConversationMessages");
    expect(source).toContain("archiveRestaurantAdvisorConversation");
    expect(source).toContain("backendConversationId");
    expect(source).toContain("mergeAdvisorHistoryEntries");
    expect(source).toContain("Historique");
    expect(source).toContain("Charger");
    expect(source).toContain("setHistoryOpen");
    expect(source).not.toContain("sur cet appareil");

    expect(aiClient).toContain("getRestaurantAdvisorConversations");
    expect(aiClient).toContain('surface === "dashboard-advisor"');
    expect(aiClient).toContain('endpoint === "restaurant-advisor"');
    expect(aiClient).toContain('endpoint === "ai-restaurant-agent"');
    expect(aiClient).toContain("ai_conversations");
    expect(aiClient).toContain("ai_messages");
  });

  it("keeps signed demo images transient and storage URLs out of visible text", () => {
    const source = readSource("src/pages/dashboard/DashboardAdvisor.tsx");

    expect(source).toContain("sanitizeAdvisorVisibleText");
    expect(source).toContain("sanitizeAdvisorVisibleContent");
    expect(source).toContain("SUPABASE_VISIBLE_URL_PATTERN");
    expect(source).toContain("COMMERCIAL_DEMO_SIGNED_IMAGE_PATTERN");
    expect(source).toContain("COMMERCIAL_DEMO_STORED_IMAGE_PLACEHOLDER");
    expect(source).toContain("<ReactMarkdown urlTransform={advisorMarkdownUrlTransform}>");
    expect(source).toContain("{sanitizeAdvisorVisibleContent(message.content)}");
    expect(source).toContain("{sanitizeAdvisorVisibleText(message.content)}");
    expect(source).toContain("reference ${getShortAdvisorReference(photo.id)}");
    expect(source).toContain("Image associee: reference ${getShortAdvisorReference(dish.id)}");
    expect(source).not.toContain('${photo.mediaUrl}');
    expect(source).not.toContain('Image: ${dish.imageUrl}');
  });
});
