import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readMigrationContaining = (fragment: string) => {
  const migrationsDir = resolve(root, "supabase/migrations");
  const file = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .find((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(fragment));
  if (!file) throw new Error(`Migration containing ${fragment} not found`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
};

describe("commercial demo AI workspaces", () => {
  const migration = read("supabase/migrations/20260715015956_commercial_demo_ai_workspaces.sql");
  const runtimeMigration = readMigrationContaining("commercial_demo_ai_requests");
  const edge = read("supabase/functions/commercial-demo-ai/index.ts");
  const edgeShared = read("supabase/functions/_shared/commercial-demo-ai.ts");
  const server = `${edgeShared}\n${edge}`;
  const client = read("src/lib/commercialDemoAi.ts");
  const tokAiClient = read("src/lib/ai/tokAiClient.ts");
  const creationJobs = read("src/lib/ai/aiCréationJobs.ts");
  const effects = read("src/lib/commercialDemoEffects.ts");
  const provider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const advisor = read("src/pages/dashboard/DashboardAdvisor.tsx");
  const embeddedChat = read("src/components/support/TokAiSupportChat.tsx");
  const floatingChat = read("src/components/SupportChat.tsx");
  const marketingStudio = read("src/components/dashboard/TokAiMarketingStudio.tsx");
  const photos = read("src/pages/dashboard/DashboardPhotos.tsx");
  const photoStudio = read("src/components/dashboard/TokAiPhotoStudioV2.tsx");
  const app = read("src/App.tsx");

  it("creates dedicated session-bound tables for conversations, messages and visual generations", () => {
    for (const table of [
      "commercial_demo_ai_conversations",
      "commercial_demo_ai_messages",
      "commercial_demo_ai_generations",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role`);
      expect(migration).toContain(`GRANT SELECT ON TABLE public.${table} TO authenticated, service_role`);
    }

    expect(migration).toContain("FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)");
    expect(migration).toContain("REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)");
    expect(migration).toContain("FOREIGN KEY (conversation_id, session_id, commercial_user_id, demo_restaurant_id)");
  });

  it("uses scoped RLS and repeats the authorization check inside every security-definer RPC", () => {
    expect(migration.match(/USING \(public\.commercial_demo_can_access_user\(commercial_user_id\)\)/g)).toHaveLength(3);

    for (const signature of [
      "commercial_demo_ai_respond(",
      "commercial_demo_ai_history(",
      "commercial_demo_ai_archive_conversation(",
      "commercial_demo_ai_generate_visual(",
      "commercial_demo_ai_generation_history(",
    ]) {
      const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${signature}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = migration.indexOf("CREATE OR REPLACE FUNCTION public.", start + 40);
      const body = migration.slice(start, next < 0 ? migration.length : next);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = public, pg_temp");
      expect(body).toContain("public.commercial_demo_can_access_user(v_session.commercial_user_id)");
    }

    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_respond");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_generate_visual");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_generation_history");
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.commercial_demo_ai_[\s\S]*?TO anon/);
  });

  it("keeps administrator flags authoritative and bounds all user-controlled payloads", () => {
    expect(migration).toContain("WHEN 'assistant' THEN 'dashboard-advisor'");
    expect(migration).toContain("WHEN 'support_chat' THEN 'ai_support_chat'");
    expect(migration).toContain("public.is_feature_flag_active(v_required_feature)");
    expect(migration).toContain("public.is_feature_flag_active('dashboard-photos')");
    expect(migration).toContain("pg_column_size(COALESCE(p_context, '{}'::jsonb)) > 32768");
    expect(migration).toContain("char_length(v_message) NOT BETWEEN 1 AND 4000");
    expect(migration).toContain("char_length(v_prompt) NOT BETWEEN 1 AND 6000");
    expect(migration).toContain("Commercial demo AI rate limit reached");
    expect(migration).toContain("Commercial demo visual rate limit reached");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Commercial demo AI session history limit reached");
    expect(migration).toContain("Commercial demo AI conversation history limit reached");
    expect(migration).toContain("Commercial demo visual history limit reached");
    expect(migration).toContain("LIMIT 100");
    expect(runtimeMigration).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.commercial_demo_ai_respond/i);
    expect(runtimeMigration).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.commercial_demo_ai_generate_visual/i);
  });

  it("persists real OpenAI output in demo-only tables and private demo storage", () => {
    expect(runtimeMigration).toContain("commercial_demo_ai_requests");
    expect(runtimeMigration).toContain("request_id");
    expect(runtimeMigration).toContain("payload_hash");
    expect(runtimeMigration).toContain("processing");
    expect(runtimeMigration).toContain("completed");
    expect(runtimeMigration).toContain("failed");
    expect(runtimeMigration).toContain("credit_units");
    expect(runtimeMigration).toMatch(/CHECK\s*\(\s*credit_units\s*=\s*0\s*\)/i);
    expect(runtimeMigration).toContain("estimated_cost_chf");
    expect(runtimeMigration).not.toMatch(/CHECK\s*\(\s*estimated_cost_chf\s*=\s*0\s*\)/i);
    expect(runtimeMigration).toContain("commercial-demo-ai");
    expect(runtimeMigration).toContain("SET public = false");
    expect(edge).toContain('Deno.env.get("OPENAI_API_KEY")');
    expect(edge).toContain("https://api.openai.com/");
    expect(server).toContain("estimated_cost_chf");
    expect(server).toContain("credit_units: 0");
    expect(server).not.toContain("tok-demo-zero-cost-v1");
    expect(server).not.toContain("output_svg");
    expect(server).not.toContain("image/svg+xml");

    for (const productionTarget of [
      "ai_conversations",
      "ai_messages",
      "ai_generation_jobs",
      "ai_usage_events",
      "restaurant_ai_subscriptions",
      "restaurant_media",
      "storage.objects",
      "financial_ledger",
    ]) {
      const dml = new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:public\\.)?${productionTarget}\\b`, "i");
      expect(runtimeMigration).not.toMatch(dml);
      expect(server).not.toMatch(new RegExp(`\\.from\\(["']${productionTarget}["']\\)`, "i"));
    }
  });

  it("routes live demo AI through the single authenticated Edge Function", () => {
    expect(provider).toContain("dataset.commercialDemoSessionId = config.sessionId");
    expect(client).toContain('"commercial-demo-ai"');
    expect(client).toContain('action: "chat"');
    expect(client).toContain('action: "visual_generate"');
    expect(client).toContain('action: "visual_history"');
    expect(client).toContain("request_id");
    expect(client).toContain("const requestId = createRequestId()");
    expect(client).toContain("generation_seed: request.generationSeed || null");
    expect(client).not.toMatch(/requestId\s*=\s*[^\n]*generationSeed/);
    expect(client).toContain("output_url");
    expect(client).toContain("estimated_cost_chf");
    expect(client).toContain('"commercial_demo_ai_history"');
    expect(client).toContain('"commercial_demo_ai_archive_conversation"');
    expect(client).toContain("request.styleMode");
    expect(client).toContain("request.demoReferencePalette?.primaryColor");
    expect(client).not.toContain('"commercial_demo_ai_respond"');
    expect(client).not.toContain('"commercial_demo_ai_generate_visual"');
    expect(client).not.toContain('"commercial_demo_ai_generation_history"');
    expect(client).not.toContain("encodeURIComponent(svg)");
    expect(client).not.toContain("tok-demo-zero-cost-v1");
    expect(client).toContain('!value.trim().toLowerCase().startsWith("data:image/svg+xml")');

    const imageFunction = tokAiClient.slice(
      tokAiClient.indexOf("export function generateTokDishImage"),
      tokAiClient.indexOf("export function runAccountingAgent"),
    );
    expect(imageFunction).toContain("getCommercialDemoAiRuntime()");
    expect(imageFunction).toContain("generateCommercialDemoVisual(commercialDemoRuntime, request)");
    expect(imageFunction.indexOf("generateCommercialDemoVisual"))
      .toBeLessThan(imageFunction.indexOf('"ai-image-enhance"'));
    expect(creationJobs).toContain("getCommercialDemoAiRuntime()");
    expect(creationJobs).toContain("`${AI_CREATIONS_STORAGE_KEY}:commercial-demo:${runtime.sessionId}:${runtime.surface}`");

    expect(advisor).toContain("askCommercialDemoAi");
    expect(advisor).toContain("getCommercialDemoAiHistory");
    expect(advisor).toContain("urlTransform={advisorMarkdownUrlTransform}");
    const demoSelectionBranch = advisor.slice(
      advisor.indexOf("if (isCommercialDemo && commercialDemoFrame) {", advisor.indexOf("setIsSelectionLoading")),
      advisor.indexOf("let cancelled = false", advisor.indexOf("setIsSelectionLoading")),
    );
    expect(demoSelectionBranch).toContain("snapshot.catalog_items");
    expect(demoSelectionBranch).toContain("snapshot.demo_restaurant.image_url");
    expect(demoSelectionBranch).not.toContain("supabase.from");
    expect(embeddedChat).toContain("askCommercialDemoAi");
  });

  it("allows only the dedicated demo Edge slug and read/archive RPCs through the firewall", () => {
    for (const rpc of [
      "commercial_demo_ai_history",
      "commercial_demo_ai_archive_conversation",
    ]) {
      expect(effects).toContain(`"${rpc}"`);
    }
    expect(effects).toContain('"commercial-demo-ai"');
    expect(effects).not.toContain('"commercial_demo_ai_respond"');
    expect(effects).not.toContain('"commercial_demo_ai_generate_visual"');
    expect(effects).not.toContain('"commercial_demo_ai_generation_history"');
    expect(effects).toContain("isTrustedSupabaseOrigin");
  });

  it("mounts the real Chat IA behind the admin flag and isolates every demo effect", () => {
    expect(app).toContain('const aiSupportChatEnabled = hasFeature("ai_support_chat")');
    expect(app).toContain("aiSupportChatEnabled === true");
    expect(app).toContain('commercialDemoFrame.surface !== "commercial"');
    expect(app).toContain("<SupportChat />");

    expect(floatingChat).toContain("useCommercialDemoFrame()");
    expect(floatingChat).toContain('getCommercialDemoAiHistory(demoRuntime, "support_chat")');
    expect(floatingChat).toContain('tool: "support_chat"');
    expect(floatingChat).toContain("conversationId: activeConversationId");
    expect(floatingChat).toContain("conversation.surface === demoRuntime.surface");
    expect(floatingChat).toContain("isCommercialDemo || !isChatAvailable || !activeConversationId");
    expect(floatingChat).toContain("isCommercialDemo || !isChatAvailable || !topic");
    expect(floatingChat).toContain("crédits Démo illimités");
    expect(floatingChat).toContain("coût suivi en interne");
    expect(floatingChat).not.toContain("0 CHF");

    const demoSend = floatingChat.slice(
      floatingChat.indexOf("if (demoRuntime) {", floatingChat.indexOf("const handleSendMessage")),
      floatingChat.indexOf("const messages: TokAiMessage[]", floatingChat.indexOf("const handleSendMessage")),
    );
    expect(demoSend).toContain("askCommercialDemoAi");
    expect(demoSend).not.toContain("askClientSupport");
    expect(demoSend).not.toContain("askAdminDashboardChat");
  });

  it("runs the real Marketing Studio with in-memory references and no production fallback", () => {
    expect(marketingStudio).toContain("buildCommercialDemoMarketingResources(commercialDemoFrame.snapshot)");
    expect(marketingStudio).toContain("buildCommercialDemoBusinessContext(commercialDemoFrame.snapshot)");
    expect(marketingStudio).toContain("URL.createObjectURL(file)");
    expect(marketingStudio).toContain("Les fichiers restent hors du Storage");
    expect(marketingStudio).toContain("transmises temporairement à OpenAI");
    expect(marketingStudio).toContain("generateCommercialDemoVisual(demoRuntime, generationRequest)");
    expect(marketingStudio).toContain("crédits Démo illimités");
    expect(marketingStudio).toContain("coût suivi en interne");
    expect(marketingStudio).not.toContain("0 CHF");
    expect(marketingStudio).toContain("Générer avec OpenAI · crédits Démo illimités");
    expect(marketingStudio).toContain("buildCommercialDemoReferencePalette(generationResources)");
    expect(marketingStudio).toContain("styleMode,");
    expect(marketingStudio).toContain("demoReferencePalette,");
    expect(marketingStudio).toContain('getCommercialDemoVisualHistory(demoRuntime, "marketing_studio", 20)');
    expect(marketingStudio).toContain("Créations Démo persistées");
    expect(marketingStudio).not.toContain(".replaceAll(");

    const demoUpload = marketingStudio.slice(
      marketingStudio.indexOf("if (isCommercialDemo) {", marketingStudio.indexOf("const handleResourceFiles")),
      marketingStudio.indexOf("const { data: userData", marketingStudio.indexOf("const handleResourceFiles")),
    );
    expect(demoUpload).toContain("URL.createObjectURL(file)");
    expect(demoUpload).not.toContain("supabase.storage");
    expect(demoUpload).not.toContain('from("restaurant_media")');

    const demoDelete = marketingStudio.slice(
      marketingStudio.indexOf("if (isCommercialDemo) {", marketingStudio.indexOf("const deleteMarketingResource")),
      marketingStudio.indexOf("if (!resource.persisted)", marketingStudio.indexOf("const deleteMarketingResource")),
    );
    expect(demoDelete).toContain("return;");
    expect(demoDelete).not.toContain("supabase.storage");
    expect(demoDelete).not.toContain('from("restaurant_media")');

    const generation = marketingStudio.slice(
      marketingStudio.indexOf("const requestGeneration"),
      marketingStudio.indexOf("const generatedMarketingImageUrl"),
    );
    expect(generation).toContain("demoRuntime\n        ? await generateCommercialDemoVisual");
    expect(generation).toContain(": await startTokImageCréationJob");
    expect(generation).toContain("if (!isCommercialDemo && !generationResources.length)");
  });

  it("isolates local advisor history by demo session and keeps storage best-effort", () => {
    expect(advisor).toContain("commercial-demo:${demoAiRuntime.sessionId}:${demoAiRuntime.surface}");
    expect(advisor).toContain("window.localStorage.setItem");
    expect(advisor).toContain("Private browsing and full storage must not turn a successful backend reply into an error");
    expect(advisor).toContain("getAdvisorHistoryEntryKey");
    expect(advisor).toContain("candidate.id !== entry.id && getAdvisorHistoryEntryKey(candidate) !== targetKey");
    expect(advisor).toContain("const demoAiRuntime = useMemo<CommercialDemoAiRuntime | null>");
    expect(embeddedChat).toContain("const demoRuntime = useMemo<CommercialDemoAiRuntime | null>");
  });

  it("keeps the real Photos workspace and creation history on demo-only data", () => {
    const loadFunction = photos.slice(photos.indexOf("const load = async"), photos.indexOf("useEffect(() =>", photos.indexOf("const load = async")));
    expect(loadFunction).toContain("if (isCommercialDemo && commercialDemoFrame)");
    expect(loadFunction.indexOf("if (isCommercialDemo && commercialDemoFrame)")).toBeLessThan(loadFunction.indexOf('.from("restaurant_media")'));
    expect(photos).toContain("getCommercialDemoVisualHistory(runtime, undefined, 60)");
    expect(photos).toContain("<CommercialDemoVisualGallery");
    expect(photos).toContain("writeCommercialDemoToolState(");
    expect(photos).toContain("sanitizeCommercialDemoGalleryForStorage(next)");
    expect(photos).toContain('item.media_url.includes(COMMERCIAL_DEMO_SIGNED_IMAGE_PATH)');
    expect(photos).toContain("URL.createObjectURL(file)");
    expect(photos).toContain("n'est jamais envoyé au Storage de production");
    expect(photoStudio).toContain('const isCommercialDemo = commercialDemoFrame?.surface === "restaurant"');
    expect(photoStudio).toContain("buildCommercialDemoPhotoPalette");
    expect(photoStudio).toContain('writeCommercialDemoToolState(sessionId, "photos-gallery", next)');
    expect(photoStudio.indexOf("if (isCommercialDemo && commercialDemoFrame)", photoStudio.indexOf("const addToGallery")))
      .toBeLessThan(photoStudio.indexOf('.from("restaurant_media")', photoStudio.indexOf("const addToGallery")));
    expect(photoStudio).toContain("Générer avec OpenAI · crédits Démo illimités");
    expect(photoStudio).toContain("transmise temporairement à OpenAI uniquement lors de la retouche");
  });
});
