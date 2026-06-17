import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getRestaurantAmenityOptions, normalizeRestaurantAmenities } from "@/lib/restaurantAmenities";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("Dashboard restaurant amenities", () => {
  it("normalizes selected amenities for public restaurant fiches", () => {
    expect(normalizeRestaurantAmenities(["free_wifi", "", 12, "terrace"])).toEqual(["free_wifi", "terrace"]);
    expect(getRestaurantAmenityOptions(["free_wifi", "terrace"]).map((option) => option.label)).toEqual([
      "Wi-Fi gratuit",
      "Terrasse",
    ]);
  });

  it("lets restaurateurs manage Google Business style amenities from Mon restaurant", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardRestaurant.tsx");
    const amenities = readSource("src/lib/restaurantAmenities.ts");
    const detail = readSource("src/pages/RestaurantDetail.tsx");
    const types = readSource("src/integrations/supabase/types.ts");

    expect(dashboard).toContain("RESTAURANT_AMENITY_GROUPS");
    expect(dashboard).toContain("@/lib/restaurantAmenities");
    expect(amenities).toContain("Parking gratuit");
    expect(amenities).toContain("Parking payant");
    expect(amenities).toContain("Wi-Fi gratuit");
    expect(amenities).toContain("Accès handicapé");
    expect(amenities).toContain("Animaux acceptés");
    expect(amenities).toContain("Drive-in");
    expect(dashboard).toContain("amenities: form.amenities");
    expect(dashboard).toContain("toggleAmenity");
    expect(detail).toContain("getRestaurantAmenityOptions");
    expect(detail).toContain("Commodités et services");

    expect(types).toContain("amenities: string[]");
    expect(types).toContain("amenities?: string[]");
  });

  it("adds an idempotent restaurants amenities migration", () => {
    const migration = readSource("supabase/migrations/20260615005145_restaurant_amenities.sql");

    expect(migration).toContain("ALTER TABLE public.restaurants");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS amenities text[]");
    expect(migration).toContain("DEFAULT '{}'::text[]");
  });
});
