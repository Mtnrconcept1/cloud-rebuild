import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("restaurant dashboard review response workflow", () => {
  it("adds audited restaurant RPCs for read state, replies, reporting and notifications", () => {
    const sql = latestMigrationContaining(/restaurant_report_review/i);

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS restaurant_read_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS restaurant_read_by");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS reported_at");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.review_reports");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.restaurant_mark_review_read");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.restaurant_reply_review");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.restaurant_report_review");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.trigger_restaurant_review_notification");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.trigger_review_report_admin_notification");
    expect(sql).toContain("public.enqueue_notification");
    expect(sql).toContain("review_report");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.restaurant_report_review");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.restaurant_report_review");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("drops existing admin review RPCs before redefining them to avoid return type drift", () => {
    const sql = latestMigrationContaining(/restaurant_report_review/i);
    const adminRpcSignatures = [
      "public.admin_update_review_status(uuid, text, text)",
      "public.admin_delete_review(uuid, text)",
      "public.admin_reply_review(uuid, text)",
    ];

    for (const signature of adminRpcSignatures) {
      const dropIndex = sql.indexOf(`DROP FUNCTION IF EXISTS ${signature}`);
      const createIndex = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature.replace(/\(.*$/, "(")}`);
      expect(dropIndex, `${signature} should be dropped before recreation`).toBeGreaterThanOrEqual(0);
      expect(createIndex, `${signature} should be recreated`).toBeGreaterThan(dropIndex);
    }
  });

  it("lets restaurateurs filter, sort, read, reply, generate AI replies and report reviews", () => {
    const dashboard = readProjectFile("src/pages/dashboard/DashboardAvis.tsx");
    const aiClient = readProjectFile("src/lib/ai/tokAiClient.ts");

    expect(dashboard).toContain("readFilter");
    expect(dashboard).toContain("sortMode");
    expect(dashboard).toContain("restaurant_read_at");
    expect(dashboard).toContain("restaurant_mark_review_read");
    expect(dashboard).toContain("restaurant_reply_review");
    expect(dashboard).toContain("restaurant_report_review");
    expect(dashboard).toContain("runRestaurantAgent");
    expect(dashboard).toContain('action: "review_reply"');
    expect(dashboard).toContain("restaurant_ai_profiles");
    expect(dashboard).toContain("Style de réponse automatique");
    expect(dashboard).toContain("Générer une réponse IA");
    expect(dashboard).toContain("Signaler l'avis");
    expect(aiClient).toContain("RestaurantAgentAction");
    expect(aiClient).not.toContain("OPENAI_API_KEY");
  });

  it("surfaces reported reviews for admin decisions and hides non-published reviews publicly", () => {
    const admin = readProjectFile("src/pages/admin/AdminAvis.tsx");
    const routing = readProjectFile("src/lib/notificationRouting.ts");
    const restaurantDetail = readProjectFile("src/pages/RestaurantDetail.tsx");

    expect(admin).toContain("review_reports");
    expect(admin).toContain("Signalements restaurateur");
    expect(admin).toContain("Restaurer l'avis");
    expect(admin).toContain("Archiver l'avis");
    expect(admin).toContain("admin_update_review_status");
    expect(admin).toContain("admin_delete_review");
    expect(routing).toContain('notification.type === "review"');
    expect(routing).toContain('notification.type === "review_report"');
    expect(routing).toContain("/dashboard/avis");
    expect(routing).toContain("/admin/avis");
    expect(restaurantDetail).toContain('.eq("status", "published")');
  });

  it("adds AI review replies to restaurant launch packs", () => {
    const packsPage = readProjectFile("src/pages/PacksRestaurateur.tsx");
    const launchPacks = readProjectFile("src/lib/launchPacks.ts");
    const sql = latestMigrationContaining(/ai_review_replies/i);

    expect(launchPacks).toContain('"ai_review_replies"');
    expect(launchPacks).toContain("MessageSquareReply");
    expect(packsPage).toContain("Réponses IA aux avis");
    expect(sql).toContain("ai_review_replies");
    expect(sql).toContain("Réponses IA aux avis");
  });
});
