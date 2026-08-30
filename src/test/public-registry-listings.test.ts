import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public REG restaurant listings", () => {
  it("keeps source-indexed businesses outside the operational restaurants table", () => {
    const migration = read("supabase/migrations/20260829220000_public_registry_restaurant_listings.sql");

    expect(migration).toContain("create table if not exists public.public_restaurant_listings");
    expect(migration).toContain("alter table public.public_restaurant_listings enable row level security");
    expect(migration).toContain("revoke all on table public.public_restaurant_listings from anon");
    expect(migration).toContain("search_restaurant_discovery_catalog");
    expect(migration).toContain("get_public_restaurant_listing");
    expect(migration).toContain("claim_status <> 'claimed'");
    expect(migration).toContain("false as supports_reservation");
    expect(migration).toContain("false as delivery_available");
    expect(migration).toContain("phone text");
    expect(migration).not.toMatch(/insert\s+into\s+public\.restaurants/i);
  });

  it("uses exactly the frozen 2230-row static source seed with an explicit public-field allow-list", () => {
    const seed = read("supabase/migrations/20260829220500_seed_public_registry_restaurants.sql");
    const rowMarker = "('REG/SITG – Répertoire des entreprises et établissements'";
    const insert = seed.match(/insert\s+into\s+public\.public_restaurant_listings\s*\((.*?)\)\s*values/is);

    expect(seed.split(rowMarker).length - 1).toBe(2230);
    expect(insert).not.toBeNull();
    const columns = String(insert?.[1] || "").split(",").map((value) => value.trim().toLowerCase());
    expect(columns).toEqual([
      "source", "source_url", "source_ref", "source_collected_on", "name", "category", "activity_detail",
      "address", "postal_code", "city", "municipality", "phone", "website_url", "latitude", "longitude", "slug",
    ]);

    expect(seed).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(seed).not.toContain("NUM_IDE");
    expect(seed).not.toContain("ID_ENTREPRISE");
    expect(seed).not.toContain("TEL_SECONDAIRE");
    expect(seed).not.toContain("mailto:");
    expect(seed).toContain("exact same-place duplicates");
    expect(seed).toContain("live TOK profile");
    expect(seed).toMatch(/'(?:\+?41|0)[0-9 .()\/-]{7,}'/);
  });

  it("contains no live-source generator in the final implementation", () => {
    const packageRoot = resolve(process.cwd(), "scripts");
    const publicRegGenerator = resolve(packageRoot, "generate-public-reg-seed.py");
    const scripts = readdirSync(packageRoot);

    expect(scripts).not.toContain("generate-public-reg-seed.py");
    expect(scripts).not.toContain("public-reg-fallback.b64");
    expect(() => readFileSync(publicRegGenerator)).toThrow();
  });

  it("renders a public-source profile with illustration, professional phone, claim and removal controls", () => {
    const page = read("src/pages/PublicRestaurantListingDetail.tsx");
    const app = read("src/App.tsx");

    expect(app).toContain('/restaurant-indexe/:slug');
    expect(page).toContain("Indexé depuis une base de données publique");
    expect(page).toContain("Fiche publique non revendiquée");
    expect(page).toContain("Image d’illustration");
    expect(page).toContain("Visuel générique de catégorie");
    expect(page).toContain('href={`tel:${listing.phone}`}');
    expect(page).toContain("Revendiquer mon restaurant");
    expect(page).toContain("Demander la suppression du restaurant");
    expect(page).toContain('source: "public_contact"');
    expect(page).toContain('action="public_contact"');
    expect(page).toContain("get_public_restaurant_listing");
  });

  it("uses only original local generic category illustrations", () => {
    const helper = read("src/lib/publicRestaurantIllustrations.ts");
    const assets = readdirSync(resolve(process.cwd(), "public/images/public-listings")).filter((name) => name.endsWith(".svg"));

    expect(assets).toHaveLength(17);
    for (const slug of ["pizza", "kebab", "gastronomique", "francais", "italien", "japonais", "restaurant"]) {
      expect(helper).toContain(`slug: "${slug}"`);
      expect(assets).toContain(`${slug}.svg`);
    }
    expect(helper).toContain('`/images/public-listings/${rule.slug}.svg`');
    expect(helper).toContain('src: "/images/public-listings/bar.svg"');
    expect(helper).toContain('src: "/images/public-listings/restaurant.svg"');
    expect(helper).not.toMatch(/https?:\/\//);
  });

  it("marks public-indexed cards, shows phone when present and disables transactional/favorite behavior", () => {
    const card = read("src/components/RestaurantCard.tsx");
    const search = read("src/pages/Recherche.tsx");
    const local = read("src/pages/LocalRestaurants.tsx");

    expect(card).toContain("Indexé depuis une base publique");
    expect(card).toContain("Image d’illustration");
    expect(card).toContain("getPublicRestaurantIllustration");
    expect(card).toContain('href={`tel:${phone}`}');
    expect(card).toContain("isPublicIndexedListing && phone");
    expect(card).toContain("if (isPublicIndexedListing) return;");
    expect(card).toContain("!isPublicIndexedListing && canShowReservationSlots");
    expect(card).toContain('`/restaurant-indexe/${encodeURIComponent(slug)}`');
    expect(search).toContain("search_restaurant_discovery_catalog");
    expect(local).toContain("search_restaurant_discovery_catalog");
    expect(search).toContain('listing_kind === "public_registry"');
    expect(local).toContain('listing_kind === "public_registry"');
    expect(search).toContain("phone: r.phone || null");
    expect(local).toContain("phone: restaurant.phone || null");
  });

  it("links a claim to the existing privileged restaurateur onboarding without weakening approval", () => {
    const auth = read("src/pages/Auth.tsx");
    const recovery = read("src/lib/privilegedSignupRecovery.ts");
    const migration = read("supabase/migrations/20260829220000_public_registry_restaurant_listings.sql");

    expect(auth).toContain('searchParams.get("claimRestaurant")');
    expect(auth).toContain("signup_public_listing_id");
    expect(auth).toContain("public_listing_id: payload.claimRestaurantId || null");
    expect(recovery).toContain("claimRestaurantId?: string");
    expect(migration).toContain("sync_public_restaurant_listing_claim_state");
    expect(migration).toContain("new.status = 'approved'");
    expect(migration).toContain("claimed_restaurant_id = v_restaurant_id");
    expect(migration).toContain("new.status = 'rejected'");
  });
});
