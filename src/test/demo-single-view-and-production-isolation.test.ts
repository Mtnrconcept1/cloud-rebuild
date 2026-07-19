import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("real and demo restaurant isolation", () => {
  const ownerRestaurants = read("src/pages/dashboard/useOwnerRestaurants.ts");
  const productionMigration = read(
    "supabase/migrations/20260719170000_production_demo_restaurant_read_isolation.sql",
  );
  const demoMigration = read(
    "supabase/demo-migrations/20260719170000_dedicated_demo_restaurant_read_isolation.sql",
  );
  const singleDemo = read("src/components/commercial/CommercialSingleSpaceDemo.tsx");
  const demoPage = read("src/pages/CommercialDemoLive.tsx");
  const workspaceChooser = read("src/pages/WorkspaceChooser.tsx");
  const frameProvider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const restaurantHome = read("src/components/commercial/CommercialDemoRestaurantHome.tsx");
  const actorWorkspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const courierHome = read("src/pages/courier/CourierHome.tsx");

  it("fails closed when a production restaurant selector is hydrated", () => {
    expect(ownerRestaurants).toContain('.eq("owner_id", user!.id)');
    expect(ownerRestaurants).toContain('.eq("is_demo", false)');
    expect(ownerRestaurants.indexOf('.eq("owner_id", user!.id)'))
      .toBeLessThan(ownerRestaurants.indexOf('.eq("is_demo", false)'));
  });

  it("adds a restrictive production RLS barrier and keeps the dedicated demo project usable", () => {
    expect(productionMigration).toContain("AS RESTRICTIVE");
    expect(productionMigration).toContain("USING (is_demo IS FALSE)");
    expect(productionMigration).toContain("restaurant.is_demo IS FALSE");
    expect(productionMigration).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(productionMigration).toContain("REVOKE ALL ON FUNCTION");

    expect(demoMigration).toContain(
      "DROP POLICY IF EXISTS production_hide_demo_restaurants",
    );
    expect(demoMigration).toContain("demo_account.user_id = (SELECT auth.uid())");
    expect(demoMigration).toContain(
      "demo_account.demo_restaurant_id = restaurant.id",
    );
    expect(demoMigration).toContain("demo_account.is_active");
  });

  it("routes a requested surface to one dashboard and reserves the grid for the explicit multi view", () => {
    expect(demoPage).toContain("isDemoWorkspaceSurface(requestedSurface)");
    expect(demoPage).toContain("<CommercialSingleSpaceDemo surface={requestedSurface} />");
    expect(singleDemo).toContain("SURFACE_HOME");
    expect(singleDemo).toContain("buildCommercialDemoFrameUrl");
    expect(singleDemo).toContain("getCommercialNavigationHref(\"/commercial/demo-live\")");
    expect(singleDemo).toContain("commercial-demo-single-frame");
  });

  it("keeps environment explanations in employee navigation instead of actor dashboards", () => {
    expect(workspaceChooser).toContain("canAccessDemo ? (");
    expect(workspaceChooser).toContain(
      '{canAccessDemo ? "Accès réel" : "Vos espaces"}',
    );

    for (const source of [frameProvider, restaurantHome, actorWorkspace, courierHome]) {
      expect(source).not.toContain("Vrai dashboard");
      expect(source).not.toContain("Fenêtre de démonstration");
      expect(source).not.toContain("présentation restaurateur de production");
    }
  });
});
