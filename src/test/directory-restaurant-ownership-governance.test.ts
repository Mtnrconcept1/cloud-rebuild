import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("directory restaurant ownership governance", () => {
  it("shows provenance and both owner actions only through the directory notice", () => {
    const component = read("src/components/DirectoryRestaurantOwnershipNotice.tsx");

    expect(component).toContain("Restaurant indexé depuis des données publiques");
    expect(component).toContain("registre du commerce");
    expect(component).toContain("Revendiquer mon restaurant");
    expect(component).toContain("Supprimer mon restaurant");
    expect(component).toContain('.eq("is_directory_listing", true)');
    expect(component).not.toContain('.from("restaurants").delete()');
  });

  it("prefills the existing restaurateur signup and persists a claim intent after authentication", () => {
    const component = read("src/components/DirectoryRestaurantOwnershipNotice.tsx");
    const persistence = read("src/components/DirectoryClaimPersistenceBridge.tsx");

    expect(component).toContain('params.set("type", "restaurateur")');
    expect(component).toContain('params.set("claimRestaurant", restaurant.id)');
    expect(component).toContain('businessName: params.get("claimName")');
    expect(component).toContain('restaurantName: params.get("claimName")');
    expect(component).toContain('setControlledField(id, value)');
    expect(persistence).toContain("restaurant_directory_claim_requests");
    expect(persistence).toContain('event === "SIGNED_IN"');
  });

  it("requires private evidence and never auto-deletes an indexed restaurant", () => {
    const migration = read("supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql");
    const component = read("src/components/DirectoryRestaurantOwnershipNotice.tsx");

    expect(migration).toContain("restaurant_directory_removal_requests");
    expect(migration).toContain("cardinality(document_paths) >= 2");
    expect(migration).toContain("restaurant-removal-evidence");
    expect(migration).toContain("false,\n  10485760");
    expect(component).toContain("Extrait récent du registre du commerce");
    expect(component).toContain("Pièce d’identité du propriétaire/gérant");
    expect(component).toContain("La suppression n’est jamais automatique");
  });
});
