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

  it("keeps restaurant and admin review replies separated by author type", () => {
    const sql = latestMigrationContaining(/review_replies_review_author_type_unique_idx/i);

    expect(sql).toContain("DROP CONSTRAINT");
    expect(sql).toContain("review_replies_review_author_type_unique_idx");
    expect(sql).toContain("ON public.review_replies (review_id, author_type)");
    expect(sql).toContain("AND author_type = 'restaurant_staff'");
    expect(sql).toContain("AND author_type = 'admin'");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.restaurant_reply_review(uuid, text)");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.admin_reply_review(uuid, text)");
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
    expect(restaurantDetail).toContain('.or("status.is.null,status.eq.published")');
  });

  it("shows legacy published reviews and restaurant replies on public restaurant pages", () => {
    const restaurantDetail = readProjectFile("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("review_replies(id, reply_text, author_type, created_at)");
    expect(restaurantDetail).toContain('.or("status.is.null,status.eq.published")');
    expect(restaurantDetail).toContain("getRestaurantStaffReply");
    expect(restaurantDetail).toContain('author_type === "restaurant_staff"');
    expect(restaurantDetail).toContain("Réponse du restaurant");
  });

  it("normalizes public review replies returned as either an object or an array", () => {
    const restaurantDetail = readProjectFile("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("RestaurantReviewReply[] | RestaurantReviewReply | null");
    expect(restaurantDetail).toContain("function getReviewReplies");
    expect(restaurantDetail).toContain("Array.isArray(review.review_replies)");
    expect(restaurantDetail).toContain("return [review.review_replies]");
    expect(restaurantDetail).toContain("getReviewReplies(review).find");
  });

  it("keeps AI review replies available through subscription and credit surfaces after launch packs", () => {
    const packsPage = readProjectFile("src/pages/PacksRestaurateur.tsx");
    const disableLaunchPacks = latestMigrationContaining(/Stop commercializing legacy restaurant launch packs/i);

    expect(packsPage).toContain("Abonnements restaurateur");
    expect(packsPage).toContain("Recharges de crédits TOK");
    expect(disableLaunchPacks).toContain("UPDATE public.launch_packs");
    expect(disableLaunchPacks).toContain("is_active = false");
  });
});
