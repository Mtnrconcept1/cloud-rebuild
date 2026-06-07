import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

function readMigration(fragment: string) {
  const migration = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.includes(fragment))
    .sort()
    .at(-1);

  expect(migration, `Missing migration containing ${fragment}`).toBeTruthy();
  return readFileSync(resolve(MIGRATIONS_DIR, migration!), "utf8");
}

function readAllMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8") }));
}

describe("Actualites sponsored SQL safety guards", () => {
  it("does not use SQL array operators on jsonb target_pages", () => {
    for (const { name, sql } of readAllMigrations()) {
      expect(sql, `${name} must not treat ad_campaigns.target_pages as a SQL array`).not.toMatch(
        /ANY\s*\(\s*(?:\w+\.)?target_pages\s*\)/i,
      );
      expect(sql, `${name} must not compare actualites with ANY(target_pages)`).not.toMatch(
        /['"]actualites['"]\s*=\s*ANY/i,
      );
    }
  });

  it("does not aggregate UUID campaign ids with max", () => {
    for (const { name, sql } of readAllMigrations()) {
      expect(sql, `${name} must not call max() on UUID campaign ids`).not.toMatch(/max\s*\(\s*(?:\w+\.)?id\s*\)/i);
    }
  });

  it("keeps the sponsored feed ranking budget-weighted and rotating", () => {
    const sql = readMigration("actualites_budget_pacing_delivery_score");

    expect(sql).toContain("jsonb_target_pages_has_actualites");
    expect(sql).toContain("sponsored_weight");
    expect(sql).toContain("budget_daily");
    expect(sql).toContain("daily_spent");
    expect(sql).toContain("remaining_budget");
    expect(sql).toContain("budget_pacing_score");
    expect(sql).toContain("WHERE diversified.sponsored_weight > 0 OR diversified.restaurant_rank <=");
    expect(sql).toContain("floor(extract(epoch from now()) / 900)");
    expect(sql).toContain("-ln(greatest(0.000001, weighted.sponsored_random_u)) / greatest(weighted.sponsored_weight, 1)");
  });

  it("attributes sponsored conversions only after completed order or reservation activity", () => {
    const triggerSql = readMigration("actualites_weighted_rotation_and_conversion_attribution");
    const attributionSql = readMigration("actualites_multi_campaign_attribution");

    expect(triggerSql).toContain("record_actualites_order_conversion_on_orders");
    expect(triggerSql).toContain("record_actualites_reservation_conversion_on_reservations");
    expect(attributionSql).toContain("record_actualites_sponsored_conversion");
    expect(attributionSql).toContain("FOR v_event IN");
    expect(attributionSql).toContain("SELECT DISTINCT ON (e.campaign_id)");
    expect(attributionSql).toContain("e.created_at >= now() - interval '24 hours'");
    expect(attributionSql).toContain("e.event_type IN ('cta_click', 'click')");
    expect(attributionSql).toContain("record_ad_campaign_event(");
    expect(attributionSql).toContain("'journey_type', v_journey_type");
    expect(attributionSql).toContain("'payment_method', v_payment_method");
  });

  it("records Actualites impressions and clicks for every eligible campaign on a post", () => {
    const sql = readMigration("actualites_multi_campaign_attribution");

    expect(sql).toContain("FOR v_campaign IN");
    expect(sql).toContain("SELECT DISTINCT ON (spp.campaign_id)");
    expect(sql).toContain("v_campaign_count := v_campaign_count + 1");
    expect(sql).toContain("CASE WHEN v_campaign_count > 0 AND p_event_type = 'impression' THEN v_campaign_count ELSE 0 END");
    expect(sql).not.toContain("INTO v_promotion_id, v_campaign_id");
  });

  it("allows public reads and anonymous impression/click tracking without opening social write actions", () => {
    const sql = readMigration("public_actualites_and_anonymous_tracking");

    expect(sql).toContain("social_posts_public_select");
    expect(sql).toContain("TO anon, authenticated");
    expect(sql).toContain("IF v_auth_user_id IS NULL AND p_event_type NOT IN ('impression', 'click', 'cta_click') THEN");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO anon, authenticated");
  });

  it("does not let restaurant owners or admins inflate campaign metrics", () => {
    const helperSql = readMigration("actualites_internal_actor_helper");
    const campaignSql = readMigration("actualites_budget_pacing_delivery_score");
    const organicSql = readMigration("ignore_internal_actualites_organic_metrics");

    expect(helperSql).toContain("is_restaurant_internal_actor");
    expect(helperSql).toContain("r.owner_id = p_user_id");
    expect(helperSql).toContain("public.has_role(p_user_id, 'admin')");
    expect(campaignSql).toContain("IF public.is_restaurant_internal_actor(p_user_id, p_restaurant_id) THEN");
    expect(campaignSql).toContain("RETURN false;");
    expect(organicSql).toContain("v_is_internal_actor := public.is_restaurant_internal_actor(v_auth_user_id, v_restaurant_id)");
    expect(organicSql).toContain("IF v_is_internal_actor THEN");
    expect(organicSql).toContain("RETURN v_event_id;");
  });
});
