import { readFileSync } from "node:fs";
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
    expect(migration).not.toMatch(/insert\s+into\s+public\.restaurants/i);
  });

  it("freezes exactly 2230 physical establishments by stable REG IDs and requests only approved public fields", () => {
    const generator = read("scripts/generate-public-reg-seed.py");
    const outFieldsMatch = generator.match(/OUT_FIELDS\s*=\s*","\.join\(\[(.*?)\]\)/s);

    expect(generator).toContain("EXPECTED_COUNT = 2230");
    expect(generator).toContain("STABLE_IDS =");
    expect(generator).toContain("ID_ETABLISSEMENT IN");
    expect(generator).not.toContain("OBJECT_IDS =");
    expect(generator).toContain('type_reg != "Etablissement"');
    expect(generator).toContain('ALLOWED_NOGA = {"561001", "561003", "563001", "563002"}');
    expect(outFieldsMatch).not.toBeNull();

    const outFields = outFieldsMatch?.[1] || "";
    for (const publicField of [
      "ID_ETABLISSEMENT",
      "TYPE_REG",
      "NOM",
      "COMPLEMENT_LOCALI",
      "CODE_NOGA",
      "ACTIVITE_DETAIL",
      "TEL_PRINCIPAL",
      "SITE_INTERNET",
      "ADRESSE",
      "PHYS_NPA",
      "PHYS_LOCALITE",
      "PHYS_COMMUNE",
    ]) {
      expect(outFields).toContain(publicField);
    }
    for (const excludedField of [
      "EMAIL",
      "FAX",
      "TAILLE",
      "NUM_IDE",
      "ID_ENTREPRISE",
      "TEL_SECONDAIRE",
    ]) {
      expect(outFields).not.toContain(excludedField);
    }
  });

  it("generates a privacy-minimized source seed with duplicate publication guards", () => {
    const seed = read("supabase/migrations/20260829220500_seed_public_registry_restaurants.sql");
    const rowMarker = "('REG/SITG – Répertoire des entreprises et établissements'";

    expect(seed.split(rowMarker).length - 1).toBe(2230);
    expect(seed).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(seed).not.toContain("NUM_IDE");
    expect(seed).not.toContain("ID_ENTREPRISE");
    expect(seed).not.toContain("TEL_SECONDAIRE");
    expect(seed).toContain("exact same-place duplicates");
    expect(seed).toContain("live TOK profile");
  });

  it("renders a neutral public-source profile with claim and removal controls", () => {
    const page = read("src/pages/PublicRestaurantListingDetail.tsx");
    const app = read("src/App.tsx");

    expect(app).toContain('/restaurant-indexe/:slug');
    expect(page).toContain("Indexé depuis une base de données publique");
    expect(page).toContain("Fiche publique non revendiquée");
    expect(page).toContain("Revendiquer mon restaurant");
    expect(page).toContain("Demander la suppression du restaurant");
    expect(page).toContain('source: "public_contact"');
    expect(page).toContain('action="public_contact"');
    expect(page).toContain("get_public_restaurant_listing");
    expect(page).not.toMatch(/<img\b/i);
  });

  it("marks public-indexed cards and disables transactional/favorite behavior", () => {
    const card = read("src/components/RestaurantCard.tsx");
    const search = read("src/pages/Recherche.tsx");
    const local = read("src/pages/LocalRestaurants.tsx");

    expect(card).toContain("Indexé depuis une base publique");
    expect(card).toContain('isPublicIndexedListing ? "/logotok.png"');
    expect(card).toContain("if (isPublicIndexedListing) return;");
    expect(card).toContain("!isPublicIndexedListing && canShowReservationSlots");
    expect(card).toContain('`/restaurant-indexe/${encodeURIComponent(slug)}`');
    expect(search).toContain("search_restaurant_discovery_catalog");
    expect(local).toContain("search_restaurant_discovery_catalog");
    expect(search).toContain('listing_kind === "public_registry"');
    expect(local).toContain('listing_kind === "public_registry"');
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
