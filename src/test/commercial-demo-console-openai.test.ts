import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial multi-space OpenAI console", () => {
  const consoleAi = read("src/components/commercial/CommercialDemoConsoleAi.tsx");
  const multiSpace = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const app = read("src/App.tsx");
  const client = read("src/lib/commercialDemoAi.ts");
  const edge = read("supabase/functions/commercial-demo-ai/index.ts");
  const shared = read("supabase/functions/_shared/commercial-demo-ai.ts");
  const workflow = read(".github/workflows/deploy-production.yml");
  const secretWriter = read("scripts/write-supabase-secrets-env.mjs");

  it("mounts a session-bound assistant directly in the commercial multi-space view", () => {
    expect(multiSpace).toContain('import CommercialDemoConsoleAi from "@/components/commercial/CommercialDemoConsoleAi"');
    expect(multiSpace).toContain("<CommercialDemoConsoleAi");
    expect(multiSpace).toContain("sessionId={snapshot.session.id}");
    expect(multiSpace).toContain("restaurantName={snapshot.demo_restaurant.name}");

    expect(consoleAi).toContain('surface: "restaurant"');
    expect(consoleAi).toContain('tool: "assistant"');
    expect(consoleAi).toContain('entrypoint: "commercial_multi_space_console"');
    expect(consoleAi).toContain("getCommercialDemoAiHistory(runtime, \"assistant\")");
    expect(consoleAi).toContain("maxLength={4000}");
    expect(consoleAi).not.toContain("restaurant_id");
    expect(consoleAi).not.toContain("restaurantId");
    expect(app).toContain('pathname === "/commercial/demo-live"');
    expect(app).toContain("&& !isCommercialDemoHost");
  });

  it("uses only the authenticated Supabase Edge gateway from the browser", () => {
    expect(consoleAi).toContain("askCommercialDemoAi");
    expect(client).toContain('const COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai"');
    expect(client).toContain("invokeSupabaseFunction");
    expect(consoleAi).not.toContain("api.openai.com");
    expect(consoleAi).not.toContain("OPENAI_API_KEY");
    expect(client).not.toContain("api.openai.com");
    expect(client).not.toContain("OPENAI_API_KEY");
  });

  it("derives commercial ownership and the canonical demo restaurant on the server", () => {
    expect(edge).toContain("authenticateRequest(req");
    expect(edge).toContain("allowServiceRole: false");
    expect(edge).toContain("resolveCommercialDemoAiContext(actor, sessionId)");
    expect(edge).toContain("normalizeClientContext");
    expect(edge).toContain('"restaurant_id"');

    expect(shared).toContain('actor.authMode !== "user_jwt"');
    expect(shared).toContain('normalizedRoles.includes("commercial")');
    expect(shared).toContain('.from("commercial_demo_order_sessions")');
    expect(shared).toContain('.eq("status", "active")');
    expect(shared).toContain("session.commercial_user_id !== actor.userId");
    expect(shared).toContain('.from("commercial_demo_accounts")');
    expect(shared).toContain('.from("restaurants")');
    expect(shared).toContain('.eq("is_demo", true)');
  });

  it("injects the existing GitHub secret into Supabase and fails closed without it", () => {
    expect(workflow).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(workflow).toContain("Assert server-only OpenAI secret");
    expect(workflow).toContain('if [[ -z "$OPENAI_API_KEY" ]]');
    expect(workflow).toContain("supabase_ci_retry secrets set --env-file");
    expect(secretWriter).toContain('"OPENAI_API_KEY"');
    expect(secretWriter).toContain("mode: 0o600");
    expect(secretWriter).toContain("fs.chmodSync(outFile, 0o600)");
    expect(workflow).not.toContain("VITE_OPENAI_API_KEY");
  });
});
