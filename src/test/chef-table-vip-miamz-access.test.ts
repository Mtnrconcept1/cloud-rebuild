import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  if (!match) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, match), "utf8");
}

describe("Chef Table VIP access", () => {
  it("stores audited VIP access requirements on chef table drops", () => {
    const sql = latestMigrationContaining(/required_miamz_points/i);

    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+is_vip\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+required_miamz_points\s+integer\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    expect(sql).toMatch(/chef_table_drops_vip_miamz_check/i);
    expect(sql).toMatch(/p_payload->>'is_vip'/i);
    expect(sql).toMatch(/p_payload->>'required_miamz_points'/i);
    expect(sql).toMatch(/v_is_vip/i);
    expect(sql).toMatch(/v_required_miamz_points/i);
  });

  it("lets admins mark a drop VIP and configure the Miamz threshold through the governed RPC", () => {
    const page = read("src/pages/admin/DropsManagement.tsx");

    expect(page).toContain("Table VIP");
    expect(page).toContain("required_miamz_points");
    expect(page).toContain("MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD");
    expect(page).toContain("admin_save_chef_table_drop");
  });

  it("surfaces and blocks VIP drops through Tok One before checkout", () => {
    const page = read("src/pages/ChefsTable.tsx");
    const checkout = read("supabase/functions/create-checkout/index.ts");

    expect(page).toContain("is_vip");
    expect(page).toContain("required_miamz_points");
    expect(page).toContain("useIsTokOneMember");
    expect(page).toContain("ensureVipTokOneAccess");
    expect(page).toContain("Table VIP cadenassee");
    expect(page).toContain("Reserve Tok One");
    expect(page).not.toContain("ensureVipMiamzAccess");
    expect(page).not.toContain("loyalty_points");
    expect(checkout).toContain("getLatestTokOneSubscription");
    expect(checkout).toContain("hasActiveTokOneSubscription");
    expect(checkout).toContain("reserve aux abonnes Tok One actifs");
    expect(checkout).not.toContain('.select("loyalty_points")');
  });

  it("notifies Tok One members through in-app and push when offers go live", () => {
    const sql = latestMigrationContaining(/notify_tok_one_members_new_offer/i);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.notify_tok_one_members_new_offer");
    expect(sql).toContain("public.tok_one_subscriptions");
    expect(sql).toContain("'active', 'trialing'");
    expect(sql).toContain("'tok_one_offer'");
    expect(sql).toContain("'requested_channels'");
    expect(sql).toContain("'push', true");
    expect(sql).toContain("public.queue_notification_deliveries");
    expect(sql).toContain("public.trigger_flash_sale_subscription_alert");
    expect(sql).toContain("public.trigger_anti_gaspi_subscription_alert");
    expect(sql).toContain("public.trigger_chefs_table_subscription_alert");
  });
});
