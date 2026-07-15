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
  const menu = read("src/pages/dashboard/DashboardMenu.tsx");

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

  it("prices demo orders from the session restaurant's real menu", () => {
    const orderFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.commercial_demo_create_order("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.commercial_demo_create_reservation("),
    );

    expect(orderFunction).toContain("v_input_item->>'menu_item_id'");
    expect(orderFunction).toContain("item.id = v_menu_item_id");
    expect(orderFunction).toContain("item.restaurant_id = v_session.demo_restaurant_id");
    expect(orderFunction).toContain("item.is_available IS TRUE");
    expect(orderFunction).toContain("round(v_menu_item.price * 100)::integer");
    expect(orderFunction).toContain("public.is_feature_flag_active('commandes')");
    expect(orderFunction).not.toContain("commercial_demo_catalog_items");
    expect(orderFunction).not.toContain("v_input_item->>'unit_amount_cents'");
  });

  it("covers reservation FK lookup and rejects a null party size explicitly", () => {
    expect(migration).toContain("commercial_demo_reservations_restaurant_idx");
    expect(migration).toContain("ON public.commercial_demo_reservations (demo_restaurant_id)");
    expect(migration).toContain("p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 20");
  });

  it("replaces external or financial side effects with explicit tool sandboxes", () => {
    for (const tool of [
      "advisor",
      "billing",
      "pack",
      "campaigns",
      "social",
      "photos",
      "actualites",
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

  it("blocks paid menu AI actions while keeping normal demo menu mutations available", () => {
    const photoGeneration = menu.slice(
      menu.indexOf("const generateMenuPhoto = async () =>"),
      menu.indexOf("const openMenuImport = () =>"),
    );
    const photoAnalysis = menu.slice(
      menu.indexOf("const analyzeMenuPhotos = async () =>"),
      menu.indexOf("const updateImportedMenuItem ="),
    );

    expect(photoGeneration).toContain('commercialDemoFrame?.surface === "restaurant"');
    expect(photoGeneration.indexOf('commercialDemoFrame?.surface === "restaurant"'))
      .toBeLessThan(photoGeneration.indexOf("startTokImageCreationJob"));
    expect(photoAnalysis).toContain('commercialDemoFrame?.surface === "restaurant"');
    expect(photoAnalysis.indexOf('commercialDemoFrame?.surface === "restaurant"'))
      .toBeLessThan(photoAnalysis.indexOf('supabase.functions.invoke<MenuImportResponse>("menu-image-import"'));
    expect(menu).toContain('supabase.from("menu_items").insert');
    expect(menu).toContain(".update(form)");
  });
});
