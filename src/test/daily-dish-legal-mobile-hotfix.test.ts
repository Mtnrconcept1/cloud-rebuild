import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("daily dish, mobile cookies and legal consent hotfix", () => {
  const trustedAssetMigration = read("supabase/migrations/20260727190000_daily_dish_actualites_trusted_asset.sql");
  const triggerMigration = read("supabase/migrations/20260727190100_daily_dish_actualites_trigger_metadata.sql");
  const dailyDishClient = read("src/lib/ai/dailyDishAi.ts");
  const cookieBanner = read("src/components/legal/LegalConsentBanner.tsx");
  const auth = read("src/pages/Auth.tsx");

  it("accepts only an exact server-proven public PhotoPro gallery object", () => {
    expect(trustedAssetMigration).toContain("asset.restaurant_id = v_post.restaurant_id");
    expect(trustedAssetMigration).toContain("asset.user_id = v_post.author_id");
    expect(trustedAssetMigration).toContain("gallery_storage_bucket");
    expect(trustedAssetMigration).toContain("v_storage_bucket IS DISTINCT FROM 'images'");
    expect(trustedAssetMigration).toContain("NEW.media_path IS DISTINCT FROM v_asset_path");
    expect(trustedAssetMigration).toContain("NEW.media_url IS DISTINCT FROM v_asset_url");
    expect(trustedAssetMigration).toContain("FROM storage.objects object");
    expect(trustedAssetMigration).toContain("'trusted_asset', true");
    expect(trustedAssetMigration).not.toContain("'ai-generated-assets'::text");
  });

  it("keeps ordinary browser uploads confined to the social post namespace", () => {
    expect(trustedAssetMigration).toContain("NEW.media_path NOT LIKE v_post.restaurant_id::text || '/' || NEW.post_id::text || '/%'");
    expect(trustedAssetMigration).toContain("object.bucket_id = 'social-post-media'");
    expect(trustedAssetMigration).toContain("'trusted_asset', false");
    expect(triggerMigration).toContain("UPDATE OF");
    expect(triggerMigration).toContain("media_url");
    expect(triggerMigration).toContain("metadata");
  });

  it("shows a recoverable publication message instead of the raw database code", () => {
    expect(dailyDishClient).toContain("daily_dish_publication_failed");
    expect(dailyDishClient).toContain("la publication n’a pas pu être finalisée");
    expect(dailyDishClient).toContain("ne créera pas de doublon");
  });

  it("keeps the cookie settings button above the restaurateur bottom navigation", () => {
    expect(cookieBanner).toContain('pathname === "/dashboard"');
    expect(cookieBanner).toContain("bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]");
    expect(cookieBanner).toContain("left-[calc(env(safe-area-inset-left,0px)+0.75rem)]");
  });

  it("requires an explicit legal acceptance or refusal without closing on checkbox change", () => {
    expect(auth).toContain("legalAcceptanceDraft");
    expect(auth).toContain("checked={legalAcceptanceDraft}");
    expect(auth).toContain("setLegalAcceptanceDraft(checked === true)");
    expect(auth).toContain("disabled={!legalAcceptanceDraft}");
    expect(auth).toContain("Accepter et continuer");
    expect(auth).toContain("Refuser");
    expect(auth).toContain("setIsLogin(true)");
    expect(auth).toContain("pointer-events-auto");
  });
});
