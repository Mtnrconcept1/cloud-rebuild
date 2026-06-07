import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SMOKE_SQL_PATH = resolve(process.cwd(), "supabase/tests/critical_rpc_smoke.sql");
const DOC_PATH = resolve(process.cwd(), "docs/testing/supabase-rpc-guards.md");

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

function readSmokeSql() {
  expect(existsSync(SMOKE_SQL_PATH), "Missing executable Supabase RPC smoke test").toBe(true);
  return readFileSync(SMOKE_SQL_PATH, "utf8");
}

describe("Supabase critical RPC contracts", () => {
  it("keeps the current critical Actualites and campaign RPC definitions in migrations", () => {
    const feedSql = readMigration("actualites_budget_pacing_delivery_score");
    const socialEventSql = readMigration("actualites_multi_campaign_attribution");
    const campaignSql = readMigration("actualites_budget_pacing_delivery_score");
    const conversionSql = readMigration("actualites_multi_campaign_attribution");

    expect(feedSql).toContain("DROP FUNCTION IF EXISTS public.get_social_feed_v2(integer, timestamptz, text);");
    expect(feedSql).toContain("CREATE FUNCTION public.get_social_feed_v2(");
    expect(feedSql).toContain("RETURNS TABLE (");
    expect(feedSql).toContain("SECURITY INVOKER");

    expect(socialEventSql).toContain("CREATE OR REPLACE FUNCTION public.record_social_feed_event(");
    expect(socialEventSql).toContain("RETURNS uuid");
    expect(socialEventSql).toContain("SECURITY DEFINER");
    expect(socialEventSql).toContain("SET search_path = public, extensions");

    expect(campaignSql).toContain("CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(");
    expect(campaignSql).toContain("RETURNS boolean");
    expect(campaignSql).toContain("SECURITY DEFINER");

    expect(conversionSql).toContain("CREATE OR REPLACE FUNCTION public.record_actualites_sponsored_conversion(");
    expect(conversionSql).toContain("RETURNS boolean");
    expect(conversionSql).toContain("SECURITY DEFINER");
  });

  it("prevents regressions from known Postgres type mistakes", () => {
    for (const { name, sql } of readAllMigrations()) {
      expect(sql, `${name} must not treat jsonb target_pages as a SQL array`).not.toMatch(
        /ANY\s*\(\s*(?:\w+\.)?target_pages\s*\)/i,
      );
      expect(sql, `${name} must not aggregate UUID ids with max()`).not.toMatch(/max\s*\(\s*(?:\w+\.)?id\s*\)/i);
    }
  });

  it("keeps sponsored feed selection budget weighted, rotating, and jsonb-safe", () => {
    const feedSql = readMigration("actualites_budget_pacing_delivery_score");

    expect(feedSql).toContain("jsonb_target_pages_has_actualites");
    expect(feedSql).toContain("public.jsonb_target_pages_has_actualites(ac.target_pages)");
    expect(feedSql).toContain("sponsored_weight");
    expect(feedSql).toContain("budget_daily");
    expect(feedSql).toContain("daily_spent");
    expect(feedSql).toContain("remaining_budget");
    expect(feedSql).toContain("days_remaining");
    expect(feedSql).toContain("daily_budget_plan");
    expect(feedSql).toContain("daily_budget_remaining");
    expect(feedSql).toContain("budget_pacing_score");
    expect(feedSql).toContain("least(weighted.daily_budget_remaining, weighted.remaining_budget / greatest(weighted.days_remaining, 1))");
    expect(feedSql).toContain("WHERE diversified.sponsored_weight > 0 OR diversified.restaurant_rank <=");
    expect(feedSql).toContain("floor(extract(epoch from now()) / 900)");
    expect(feedSql).toContain("-ln(greatest(0.000001, weighted.sponsored_random_u)) / greatest(weighted.sponsored_weight, 1)");
  });

  it("keeps social event tracking safe for anonymous users and internal actors", () => {
    const socialEventSql = readMigration("actualites_multi_campaign_attribution");

    expect(socialEventSql).toContain(
      "IF p_event_type NOT IN ('impression', 'click', 'cta_click', 'reaction', 'comment', 'share', 'save', 'follow', 'repost') THEN",
    );
    expect(socialEventSql).toContain("IF v_auth_user_id IS NULL AND p_event_type NOT IN ('impression', 'click', 'cta_click') THEN");
    expect(socialEventSql).toContain("v_is_internal_actor := public.is_restaurant_internal_actor(v_auth_user_id, v_restaurant_id)");
    expect(socialEventSql).toContain("is_internal_actor");
    expect(socialEventSql).toContain("IF v_is_internal_actor THEN");
    expect(socialEventSql).toContain("RETURN v_first_event_id;");
    expect(socialEventSql).toContain("SELECT public.record_ad_campaign_event(");
    expect(socialEventSql).toContain("CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END");
    expect(socialEventSql).toContain("FOR v_campaign IN");
    expect(socialEventSql).toContain("SELECT DISTINCT ON (spp.campaign_id)");
  });

  it("keeps campaign metrics append-only, deduplicated, and protected from owner inflation", () => {
    const campaignSql = readMigration("actualites_budget_pacing_delivery_score");
    const metricWriteSql = readMigration("allow_internal_campaign_metric_writes");

    expect(campaignSql).toContain("IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN");
    expect(campaignSql).toContain("p_conversion_type NOT IN ('order', 'reservation', 'zero-attente')");
    expect(campaignSql).toContain("IF public.is_restaurant_internal_actor(p_user_id, p_restaurant_id) THEN");
    expect(campaignSql).toContain("RETURN false;");
    expect(campaignSql).toContain("ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING");
    expect(campaignSql).toContain("GET DIAGNOSTICS v_rows = ROW_COUNT");
    expect(campaignSql).toContain("impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END");
    expect(campaignSql).toContain("clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END");
    expect(campaignSql).toContain("conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END");
    expect(campaignSql).toContain("spent = COALESCE(spent, 0) + v_cost");
    expect(campaignSql).toContain("daily_spent = CASE");
    expect(campaignSql).toContain("ROUND(COALESCE(v_campaign.cpm_rate, 9.50) / 1000.0, 6)");

    expect(metricWriteSql).toContain("current_setting('tok.internal_campaign_metric_write', true)");
    expect(metricWriteSql).toContain("IF TG_OP = 'UPDATE' AND v_internal_metric_write THEN");
    expect(metricWriteSql).toContain("to_jsonb(NEW) - ARRAY[");
    expect(metricWriteSql).toContain("Seules les metriques de campagne peuvent etre mises a jour par le tracking interne.");
    expect(metricWriteSql).toContain("PERFORM set_config('tok.internal_campaign_metric_write', 'on', true);");
    expect(metricWriteSql).toContain("PERFORM set_config('tok.internal_campaign_metric_write', v_previous_metric_write, true);");
  });

  it("keeps sponsored conversions attributed only from valid recent paid clicks", () => {
    const conversionSql = readMigration("actualites_multi_campaign_attribution");

    expect(conversionSql).toContain("IF p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN");
    expect(conversionSql).toContain("AND e.event_type IN ('cta_click', 'click')");
    expect(conversionSql).toContain("AND COALESCE(e.is_internal_actor, false) = false");
    expect(conversionSql).toContain("AND e.created_at >= now() - interval '24 hours'");
    expect(conversionSql).toContain("AND ac.payment_status = 'paid'");
    expect(conversionSql).toContain("SELECT DISTINCT ON (e.campaign_id)");
    expect(conversionSql).toContain("v_dedupe_key := encode(");
    expect(conversionSql).toContain("concat_ws('|', 'actualites', v_event.campaign_id::text, p_conversion_type, p_entity_id::text)");
    expect(conversionSql).toContain("SELECT public.record_ad_campaign_event(");
    expect(conversionSql).toContain("'journey_type', v_journey_type");
    expect(conversionSql).toContain("'payment_method', v_payment_method");
    expect(conversionSql).toContain("'attribution_window_hours', 24");
    expect(conversionSql).toContain("campaign_conversions_count");
  });

  it("locks critical RPC grants to the intended client or service roles", () => {
    const publicTrackingSql = readMigration("public_actualites_and_anonymous_tracking");
    const campaignSql = readMigration("actualites_budget_pacing_delivery_score");
    const internalActorSql = readMigration("actualites_internal_actor_helper");
    const grantsSql = readMigration("security_rpc_grants_hardening");

    expect(publicTrackingSql).toContain("GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO anon, authenticated");
    expect(publicTrackingSql).toContain("GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO anon, authenticated");

    expect(campaignSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;",
    );
    expect(campaignSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;",
    );
    expect(campaignSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;",
    );
    expect(campaignSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;",
    );

    expect(internalActorSql).toContain("GRANT EXECUTE ON FUNCTION public.is_restaurant_internal_actor(uuid, uuid) TO anon, authenticated, service_role");
    expect(grantsSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;",
    );
    expect(grantsSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) TO service_role;",
    );
  });

  it("provides an executable local SQL smoke test for the critical RPC flow", () => {
    const smokeSql = readSmokeSql();

    expect(smokeSql).toContain("BEGIN;");
    expect(smokeSql).toContain("ROLLBACK;");
    expect(smokeSql).toContain("INSERT INTO auth.users");
    expect(smokeSql).toContain("INSERT INTO public.restaurants");
    expect(smokeSql).toContain("INSERT INTO public.social_posts");
    expect(smokeSql).toContain("INSERT INTO public.ad_campaigns");
    expect(smokeSql).toContain("INSERT INTO public.social_post_promotions");
    expect(smokeSql).toContain("public.get_social_feed_v2(10, NULL, 'for_you')");
    expect(smokeSql).toContain("public.record_social_feed_event(");
    expect(smokeSql).toContain("public.record_ad_campaign_event(");
    expect(smokeSql).toContain("public.record_actualites_sponsored_conversion(");
    expect(smokeSql).toContain("owner click must be marked internal");
    expect(smokeSql).toContain("customer conversion must be recorded");
  });

  it("documents the CI and local execution workflow for these guards", () => {
    const docs = readFileSync(DOC_PATH, "utf8");

    expect(docs).toContain("src/test/supabase-critical-rpc-contracts.test.ts");
    expect(docs).toContain("supabase/tests/critical_rpc_smoke.sql");
    expect(docs).toContain("pnpm run test -- src/test/actualites-sponsored-sql.test.ts src/test/supabase-critical-rpc-contracts.test.ts");
    expect(docs).toContain("supabase db reset --local");
  });
});
