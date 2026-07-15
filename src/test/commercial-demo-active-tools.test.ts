import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo active tools and reservations", () => {
  const migration = read("supabase/migrations/20260715003424_commercial_demo_reservations_and_active_tools.sql");
  const app = read("src/App.tsx");
  const layout = read("src/components/DashboardLayout.tsx");
  const clientLayout = read("src/components/CustomerDashboardLayout.tsx");
  const provider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const safeTools = read("src/components/commercial/CommercialDemoToolBoundary.tsx");
  const service = read("src/lib/commercialDemoJourney.ts");
  const reservations = read("src/components/dashboard/CommercialDemoScenario.tsx");
  const cart = read("src/pages/Panier.tsx");
  const cartProvider = read("src/lib/cart.tsx");
  const clientHome = read("src/pages/ClientDashboardHome.tsx");
  const tokOne = read("src/hooks/useTokOne.ts");
  const menu = read("src/pages/dashboard/DashboardMenu.tsx");
  const crm = read("src/pages/dashboard/DashboardCrm.tsx");
  const restaurantDashboard = read("src/pages/dashboard/DashboardRestaurant.tsx");
  const partnerContract = read("src/components/contracts/RestaurantPartnerContractCard.tsx");
  const stripeConnectOnboard = read("supabase/functions/stripe-connect-onboard/index.ts");

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
    expect(demoBranch).toContain("menu_item_id: item.menuItemId");
    expect(service).toContain("menu_item_id?: string");
  });

  it("keeps demo client navigation away from production order details", () => {
    expect(app).toContain('allowedPrefixes: ["/restaurant/"]');
    expect(app).not.toContain('allowedPrefixes: ["/restaurant/", "/commande/"]');
    expect(clientHome).toContain('if (pathname.startsWith("/commande/")) return "/commandes";');
    expect(clientLayout).toContain('featuresAny: ["reservation", "commandes"]');
    expect(clientLayout).toContain("demoOnly: true");
    expect(clientLayout).toContain("return !item.demoOnly && hasActiveFeature");
  });

  it("does not read or apply real customer benefits during a demo checkout", () => {
    expect(cart).toContain("useIsTokOneMember({\n    enabled: !isCommercialDemoClient,");
    expect(cart).toContain("enabled: Boolean(user && !isCommercialDemoClient)");
    expect(cart).toContain("!isCommercialDemoClient && !isChefsTableCheckout && checkoutStep === \"suggestions\"");
    expect(cart).toContain("Démonstration isolée — Stripe Test uniquement");
    expect(tokOne).toContain("export function useIsTokOneMember(options: QueryOptions = {})");
    expect(tokOne).toContain("useTokOneSubscription(options)");
  });

  it("namespaces every embedded frame without clearing the browser cart", () => {
    expect(cartProvider).toContain("`miamz-demo:${commercialDemoFrame.config.sessionId}:${commercialDemoFrame.surface}`");
    expect(cartProvider).toContain("if (isCommercialDemoFrame)");
    expect(cartProvider).toContain("if (!isCommercialDemoFrame && user && hasPrivilegedRole(roles))");
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
    expect(service).toContain("getCommercialDemoPresetItems(current.catalog_items)");
    expect(service).toContain("menu_item_id: item.id");
    expect(service).not.toContain("const DEMO_ITEMS");
    expect(cart).toContain("menu_item_id: item.menuItemId");
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

  it("opens premium CRM only for the demo restaurant while preserving real pack gating", () => {
    expect(crm).toContain("isDemoMode,");
    expect(crm).toContain("isDemoMode || isPremiumOrEliteRestaurantSubscription(subscription");
    expect(crm).toContain("hasPremiumCrmAccess={hasPremiumCrmAccess}");
    expect(crm).not.toContain("const hasPremiumCrmAccess = true");
  });

  it("simulates restaurant contract signing locally before any production insert", () => {
    const handleSign = partnerContract.slice(
      partnerContract.indexOf("const handleSign = async () =>"),
      partnerContract.indexOf("return (", partnerContract.indexOf("const handleSign = async () =>")),
    );

    expect(partnerContract).toContain('commercialDemoFrame?.surface === "restaurant"');
    expect(handleSign).toContain("if (isCommercialDemoRestaurant)");
    expect(handleSign).toContain("setDemoContract({");
    expect(handleSign).toContain('title: "Signature simulée"');
    expect(handleSign).toContain("return;");
    expect(handleSign.indexOf("if (isCommercialDemoRestaurant)"))
      .toBeLessThan(handleSign.indexOf('.from("restaurant_contracts")'));
    expect(handleSign).toContain("generateRestaurantPartnerContractSha256");
  });

  it("blocks Stripe Connect in both the demo frame and the server before Stripe is initialized", () => {
    const handlerStart = restaurantDashboard.indexOf("const handleStripeConnect = async () =>");
    const clientHandler = restaurantDashboard.slice(
      handlerStart,
      restaurantDashboard.indexOf("return (", handlerStart),
    );
    expect(clientHandler).toContain('commercialDemoFrame?.surface === "restaurant"');
    expect(clientHandler.indexOf('commercialDemoFrame?.surface === "restaurant"'))
      .toBeLessThan(clientHandler.indexOf("fetchWithFreshAccessToken"));
    expect(restaurantDashboard).toContain("const handleSave = async () =>");

    const serverGuard = stripeConnectOnboard.slice(
      stripeConnectOnboard.indexOf("const restaurant = await requireRestaurantAccess"),
      stripeConnectOnboard.indexOf("accountId = text(restaurant.stripe_account_id)"),
    );
    expect(serverGuard).toContain("{ allowDemo: true }");
    expect(serverGuard).toContain("if (restaurant.is_demo)");
    expect(serverGuard).toContain("DEMO_SIDE_EFFECT_BLOCKED");
    expect(serverGuard.indexOf("if (restaurant.is_demo)"))
      .toBeLessThan(serverGuard.indexOf('getStripeRuntimeForCheckoutKind("stripe-connect")'));
  });
});
