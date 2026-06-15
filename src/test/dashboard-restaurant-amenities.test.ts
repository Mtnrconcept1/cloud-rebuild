import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("Dashboard restaurant amenities", () => {
  it("lets restaurateurs manage Google Business style amenities from Mon restaurant", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardRestaurant.tsx");
    const types = readSource("src/integrations/supabase/types.ts");

    expect(dashboard).toContain("RESTAURANT_AMENITY_GROUPS");
    expect(dashboard).toContain("Commodités et services");
    expect(dashboard).toContain("Parking gratuit");
    expect(dashboard).toContain("Parking payant");
    expect(dashboard).toContain("Wi-Fi gratuit");
    expect(dashboard).toContain("Accès handicapé");
    expect(dashboard).toContain("Animaux acceptés");
    expect(dashboard).toContain("Drive-in");
    expect(dashboard).toContain("amenities: form.amenities");
    expect(dashboard).toContain("toggleAmenity");

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
