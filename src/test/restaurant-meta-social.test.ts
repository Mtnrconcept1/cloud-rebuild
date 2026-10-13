import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRestaurantMetaCaption,
  isActiveRestaurantMetaCampaign,
  normalizeMetaChannels,
  normalizeRestaurantMetaImageUrl,
} from "../../supabase/functions/_shared/restaurant-meta-helpers";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261014010000_restaurant_meta_social_oauth.sql"),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "supabase/functions/restaurant-meta-social/index.ts"),
  "utf8",
);

describe("restaurant-owned Meta connections", () => {
  it("only accepts supported channels once", () => {
    expect(normalizeMetaChannels(["instagram", "facebook", "facebook"])).toEqual([]);
    expect(normalizeMetaChannels(["instagram", "facebook"])).toEqual(["instagram", "facebook"]);
    expect(normalizeMetaChannels(["tiktok"])).toEqual([]);
  });

  it("never passes external or private URLs to Meta's media downloader", () => {
    const origin = "https://example.supabase.co";
    expect(normalizeRestaurantMetaImageUrl(
      "https://example.supabase.co/storage/v1/object/public/social-post-media/a.jpg", origin,
    )).not.toBeNull();
    expect(normalizeRestaurantMetaImageUrl(
      "http://example.supabase.co/storage/v1/object/public/social-post-media/a.jpg", origin,
    )).toBeNull();
    expect(normalizeRestaurantMetaImageUrl("https://evil.site/a.jpg", origin)).toBeNull();
    expect(normalizeRestaurantMetaImageUrl(
      "https://example.supabase.co/storage/v1/object/sign/private/a.jpg", origin,
    )).toBeNull();
  });

  it("publishes only paid, active campaign content", () => {
    expect(isActiveRestaurantMetaCampaign("active", "paid")).toBe(true);
    expect(isActiveRestaurantMetaCampaign("draft", "paid")).toBe(false);
    expect(isActiveRestaurantMetaCampaign("active", "unpaid")).toBe(false);
  });

  it("limits caption length", () => {
    expect(buildRestaurantMetaCaption("Offre", "Nouveau menu")).toBe("Offre\n\nNouveau menu");
    expect(buildRestaurantMetaCaption("", "a".repeat(3000))).toHaveLength(2100);
  });

  it("prevents browser reads of tokens and binds rows to restaurants", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.restaurant_meta_accounts FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("UNIQUE (restaurant_id, page_id)");
    expect(migration).toContain("UNIQUE (account_id, source_type, source_id, channel)");
    expect(server).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(server).toContain("encrypted_page_token");
    expect(server).not.toContain("console.log(token");
  });
});
