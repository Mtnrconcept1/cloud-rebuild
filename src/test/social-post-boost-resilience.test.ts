import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const edgePath = "supabase/functions/create-social-post-boost/index.ts";
const migrationPath = "supabase/migrations/20260728173500_actualites_boost_atomic_media.sql";
const imageIndexMigrationPath = "supabase/migrations/20260728173600_actualites_campaign_image_index.sql";

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("sponsored Actualites boost resilience", () => {
  it("uses one server-side transaction instead of independent paid campaign writes", () => {
    const source = read(edgePath);

    expect(source).toContain('adminClient.rpc(\n      "create_social_post_boost_atomic"');
    expect(source).not.toContain('.from("ad_campaigns")\n      .insert');
    expect(source).not.toContain('.from("social_post_promotions")\n      .insert');
    expect(source).toContain("social_post_boost_already_active");
    expect(source).toContain("campaign_credits_insufficient");
  });

  it("requires a verified TOK storage image and always resolves a conversion CTA", () => {
    const source = read(edgePath);

    expect(source).toContain("parseProjectStorageImage");
    expect(source).toContain("isAllowedStorageImage");
    expect(source).toContain('"images" | "social-post-media"');
    expect(source).toContain("inferCtaType");
    expect(source).toContain('return "menu";');
    expect(source).toContain("Une image TOK vérifiée est requise");
  });

  it("does not charge a campaign with a zero-sized audience", () => {
    const source = read(edgePath);

    expect(source).toContain("estimate_campaign_audience");
    expect(source).toContain('adjustment: "local_broadening"');
    expect(source).toContain('adjustment: "global_broadening"');
    expect(source).toContain("La mise en avant n'a pas été facturée");
    expect(source.indexOf("ensureReachableAudience")).toBeLessThan(
      source.indexOf("create_social_post_boost_atomic"),
    );
  });

  it("locks credits, media, CTA, campaign and promotion in the same database transaction", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("public.get_restaurant_credit_usage(p_restaurant_id)");
    expect(sql).toContain("social_post_boost_already_active");
    expect(sql).toContain("INSERT INTO public.ad_campaigns");
    expect(sql).toContain("INSERT INTO public.social_post_media");
    expect(sql).toContain("UPDATE public.social_posts");
    expect(sql).toContain("INSERT INTO public.social_post_promotions");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("only trusts campaign media backed by a verified storage object", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("campaign_media_campaign_not_found");
    expect(sql).toContain("campaign_media_asset_not_owned");
    expect(sql).toContain("campaign_media_storage_object_not_found");
    expect(sql).toContain("object.bucket_id = v_storage_bucket");
    expect(sql).toContain("'trusted_asset', true");
  });

  it("indexes verified campaign images from the public images bucket", () => {
    const sql = read(imageIndexMigrationPath);

    expect(sql).toContain("sync_actualites_media_image_index");
    expect(sql).toContain("v_source IN ('daily_dish_ai', 'campaign_image')");
    expect(sql).toContain("NEW.metadata ->> 'trusted_asset'");
    expect(sql).toContain("object.bucket_id = v_storage_bucket");
    expect(sql).toContain("'campaign_id', nullif(NEW.metadata ->> 'campaign_id', '')");
  });

  it("repairs paid active boosts created before the atomic flow", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("Repair active paid promotions created before the atomic flow");
    expect(sql).toContain("ON CONFLICT (post_id, sort_order) DO NOTHING");
    expect(sql).toContain("sp.cta_type = 'none'");
    expect(sql).toContain("ac.payment_status = 'paid'");
  });
});
