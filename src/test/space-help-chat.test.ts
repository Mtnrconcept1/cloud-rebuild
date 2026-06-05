import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("space Help chat access", () => {
  it("adds a chef-hat Help button to client, restaurant, admin and courier menus", () => {
    const button = readProjectFile("src/components/help/ChefHelpButton.tsx");
    const navbar = readProjectFile("src/components/Navbar.tsx");
    const dashboardLayout = readProjectFile("src/components/DashboardLayout.tsx");
    const adminNavigation = readProjectFile("src/components/admin/AdminMobileNavigation.tsx");
    const courierLayout = readProjectFile("src/components/CourierDashboardLayout.tsx");
    const app = readProjectFile("src/App.tsx");

    expect(button).toContain("ChefHat");
    expect(button).toContain("Help !");
    expect(button).toContain("Chat IA OpenAI");
    expect(button).toContain("openHelpChat({ surface })");
    expect(navbar).toContain('ChefHelpButton surface="client"');
    expect(dashboardLayout).toContain('ChefHelpButton surface="restaurant"');
    expect(adminNavigation).toContain('ChefHelpButton surface="admin"');
    expect(app).toContain('ChefHelpButton surface="admin" compact');
    expect(courierLayout).toContain('ChefHelpButton surface="courier"');
  });

  it("keeps the global support chat OpenAI-only without guided local flows", () => {
    const supportChat = readProjectFile("src/components/SupportChat.tsx");
    const edgeFunction = readProjectFile("supabase/functions/ai-client-chat/index.ts");

    expect(supportChat).toContain('invokeSupabaseFunction<ClientChatResponse>("ai-client-chat"');
    expect(supportChat).toContain("OpenAI API");
    expect(supportChat).toContain("OpenAI en ligne");
    expect(supportChat).toContain("agentId: selectedAgent");
    expect(supportChat).toContain("surface: chatSurface");
    expect(supportChat).not.toContain("CHAT_TREE");
    expect(supportChat).not.toContain("\"guided\"");
    expect(supportChat).not.toContain("SUPABASE_URL");
    expect(edgeFunction).toContain("type ChatSurface");
    expect(edgeFunction).toContain("getSurfaceInstruction(surface)");
    expect(edgeFunction).toContain("OPENAI_API_KEY");
    expect(edgeFunction).toContain("createOpenAIResponse");
  });
});
