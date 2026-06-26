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
  it("adds the image Help button to client, restaurant, admin and courier menus", () => {
    const button = readProjectFile("src/components/help/ChefHelpButton.tsx");
    const navbar = readProjectFile("src/components/Navbar.tsx");
    const dashboardLayout = readProjectFile("src/components/DashboardLayout.tsx");
    const adminNavigation = readProjectFile("src/components/admin/AdminMobileNavigation.tsx");
    const courierLayout = readProjectFile("src/components/CourierDashboardLayout.tsx");
    const app = readProjectFile("src/App.tsx");

    expect(button).toContain('src="/help.png"');
    expect(button).toContain('aria-label="Help ! Ouvrir le chat IA"');
    expect(button).toContain("h-28 w-28 sm:h-32 sm:w-32");
    expect(button).toContain("h-full max-h-20 w-full max-w-20");
    expect(button).not.toContain("ChefHat");
    expect(existsSync(resolve(root, "public/help.png"))).toBe(true);
    expect(button).toContain("openHelpChat({ surface })");
    expect(navbar).toContain('ChefHelpButton surface="client"');
    expect(navbar).toContain('className="hidden h-20 w-20 lg:flex"');
    expect(dashboardLayout).toContain('ChefHelpButton surface="restaurant"');
    expect(adminNavigation).toContain('ChefHelpButton surface="admin"');
    expect(app).toContain('ChefHelpButton surface="admin" compact');
    expect(courierLayout).toContain('ChefHelpButton surface="courier"');
  });

  it("keeps the global support chat OpenAI-only without guided local flows", () => {
    const supportChat = readProjectFile("src/components/SupportChat.tsx");
    const edgeFunction = readProjectFile("supabase/functions/ai-client-support/index.ts");

    expect(supportChat).toContain("askClientSupport({");
    expect(supportChat).toContain("OpenAI API");
    expect(supportChat).toContain("OpenAI en ligne");
    expect(supportChat).toContain("agentId: selectedAgent");
    expect(supportChat).toContain("surface: chatSurface");
    expect(supportChat).not.toContain("CHAT_TREE");
    expect(supportChat).not.toContain("\"guided\"");
    expect(supportChat).not.toContain("SUPABASE_URL");
    expect(edgeFunction).toContain("ai_support_tickets");
    expect(edgeFunction).toContain("supportTicketId");
    expect(edgeFunction).toContain("OPENAI_API_KEY");
    expect(edgeFunction).toContain("createOpenAIResponse");
  });

  it("normalizes mixed-script AI support replies before they are stored or displayed", () => {
    const edgeFunction = readProjectFile("supabase/functions/ai-client-support/index.ts");

    expect(edgeFunction).toContain("DEVANAGARI_SCRIPT_PATTERN");
    expect(edgeFunction).toContain("normalizeFrenchSupportReply");
    expect(edgeFunction).toContain("normalizeSupportResult");
    expect(edgeFunction).toContain("const result = normalizeSupportResult");
    expect(edgeFunction).toContain("prochain message");
    expect(edgeFunction).toContain("Reponds uniquement en francais");
  });
});
