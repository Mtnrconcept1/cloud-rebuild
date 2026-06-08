import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function latestMigrationContaining(pattern: RegExp) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("admin review moderation governance", () => {
  it("adds audited admin RPCs for review moderation", () => {
    const sql = latestMigrationContaining(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_review_action_history/i);

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_review_action_history/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_review_status/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_delete_review/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_reply_review/i);
    expect(sql).toMatch(/reason is required/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.admin_review_action_history/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.admin_review_action_history\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_delete_review/i);
  });

  it("routes sensitive review actions through audited RPCs", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminAvis.tsx"), "utf8");

    expect(page).toContain("admin_update_review_status");
    expect(page).toContain("admin_delete_review");
    expect(page).toContain("admin_reply_review");
    expect(page).toContain("moderationPriority");
    expect(page).toContain("getReviewReplies");
    expect(page).toContain("getRestaurantReply");
    expect(page).toContain("getAdminReply");
    expect(page).toContain("Réponse restaurateur");
    expect(page).toContain('author_type === "restaurant_staff"');
    expect(page).toContain('author_type === "admin"');
    expect(page).toContain("Raison obligatoire");
    expect(page).toContain("Priorite");
    expect(page).not.toContain('.from("reviews").update');
    expect(page).not.toContain('.from("reviews").delete');
    expect(page).not.toContain('.from("review_replies").insert');
  });
});
