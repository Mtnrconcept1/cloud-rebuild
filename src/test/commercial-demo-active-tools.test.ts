import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo active tools and reservations", () => {
  const migration = read("supabase/migrations/20260715003424_commercial_demo_reservations_and_active_tools.sql");
  const app = read("src/App.tsx");
  const layout = read("src/components/DashboardLayout.tsx");
  const provider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const safeTools = read("src/components/commercial/CommercialDemoToolBoundary.tsx");
  const service = read("src/lib/commercialDemoJourney.ts");
  const reservations = read("src/components/dashboard/CommercialDemoScenario.tsx");
  const cart = read("src/pages/Panier.tsx");

  it("opens the real restaurant dashboard namespace but keeps admin flags authoritative", () => {
    expect(app).toContain('allowedPrefixes: ["/dashboard/"]');
    expect(app).toContain("snapshot.active_features.includes(flagName)");
    expect(layout).toContain("new Set(commercialDemoFrame.snapshot.active_features)");
    expect(layout).not.toContain("COMMERCIAL_DEMO_SAFE_RESTAURANT_PATHS");
    expect(layout).not.toContain("return isDemoMode || !item.feature");
  });

  it("returns exactly one demo restaurant catalogue in the isolated snapshot", () => {
    expect(migration).toContain("WHERE restaurant.id = v_session.demo_restaurant_id");
    expect(migration).toContain("AND restaurant.is_demo");
    expect(migration).toContain("'demo_restaurant', jsonb_build_object(");
    expect(migration).toContain("'catalog_items', v_catalog_items");
    expect(migration).toContain("public.is_feature_flag_active(flag.name)");
    expect(migration).toContain("'active_features', v_active_features");
  });

  it("stores fake reservations in a read-only-browser, RLS and Realtime domain", () => {
    expect(migration).toContain("CREATE TABLE public.commercial_demo_reservations");
    expect(migration).toContain("ALTER TABLE public.commercial_demo_reservations ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (public.commercial_demo_can_access_user(commercial_user_id))");
    expect(migration).toContain("GRANT SELECT ON TABLE public.commercial_demo_reservations");
    expect(migration).toContain("commercial_demo_create_reservation");
    expect(migration).toContain("commercial_demo_transition_reservation");
    expect(migration).toContain("p_expected_version IS DISTINCT FROM v_reservation.version");
    expect(migration).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_reservations");
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.reservations\b/);
  });

  it("connects client and restaurant reservation actions through the shared snapshot", () => {
    expect(service).toContain('"commercial_demo_create_reservation"');
    expect(service).toContain('"commercial_demo_transition_reservation"');
    expect(service).toContain('table: "commercial_demo_reservations"');
    expect(reservations).toContain("commercialDemoFrame.snapshot.reservations");
    expect(reservations).toContain('"restaurant_confirm"');
    expect(reservations).toContain('"restaurant_mark_arrived"');
    expect(provider).toContain("reservation_created");
    expect(provider).toContain("reservation_confirmed");
  });

  it("routes the real cart only to the demo order RPC and Stripe Test endpoint", () => {
    const demoBranch = cart.slice(
      cart.indexOf('commercialDemoFrame?.surface === "client"'),
      cart.indexOf('let accessToken = ""'),
    );
    expect(demoBranch).toContain("createCommercialDemoOrder");
    expect(demoBranch).toContain("createCommercialDemoCheckout");
    expect(demoBranch).toContain("openCommercialDemoCheckout");
    expect(demoBranch).not.toContain('"create-checkout"');
    expect(demoBranch).not.toContain('"validate-order"');
    expect(demoBranch).not.toContain("apply_checkout_benefits");
  });

  it("replaces external or financial side effects with explicit tool sandboxes", () => {
    for (const tool of [
      "advisor",
      "billing",
      "pack",
      "campaigns",
      "social",
      "support",
      "tok-connect",
      "accounting-inflow",
      "accounting-outflow",
    ]) {
      expect(app).toContain(`<CommercialDemoToolBoundary tool="${tool}">`);
    }
    expect(safeTools).toContain('frame?.surface === "restaurant"');
    expect(safeTools).toContain("effets externes remplacés par une sandbox");
    expect(safeTools).not.toContain("invokeSupabaseFunction");
    expect(safeTools).not.toContain("supabase.from");
    expect(safeTools).not.toContain("fetch(");
  });
});
