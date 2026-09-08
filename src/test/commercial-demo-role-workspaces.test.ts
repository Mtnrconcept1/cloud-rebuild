import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo role workspaces", () => {
  const browserGrid = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");
  const multiSpace = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const consoleAi = read("src/components/commercial/CommercialDemoConsoleAi.tsx");
  const demoAiClient = read("src/lib/commercialDemoAi.ts");
  const demoAiEdge = read("supabase/functions/commercial-demo-ai/index.ts");
  const reviews = read("src/pages/dashboard/DashboardAvis.tsx");
  const campaigns = read("src/pages/dashboard/DashboardCampagnes.tsx");
  const menu = read("src/pages/dashboard/DashboardMenu.tsx");
  const floorPlan = read("src/pages/dashboard/DashboardPlanSalle.tsx");
  const social = read("src/hooks/useSocialFeed.ts");
  const isolationPreparationPath = "supabase/migrations/20260719015244_prepare_demo_isolation_for_activation.sql";
  const activationPreparationPath = "supabase/migrations/20260719110000_prepare_commercial_demo_activation.sql";
  const isolationPreparation = read(isolationPreparationPath);
  const activationPreparation = read(activationPreparationPath);
  const migration = read("supabase/migrations/20260719113000_activate_commercial_demo_restaurant.sql");
  const activeInvariantMigration = read("supabase/migrations/20260719124500_keep_commercial_demo_restaurants_active.sql");
  const checkout = read("supabase/functions/commercial-demo-checkout/index.ts");

  it("always exposes the client restaurant commercial and courier dashboards", () => {
    expect(browserGrid).toContain("type RemoteBrowserSurface = CommercialDemoFrameSurface");
    expect(browserGrid).toContain('() => ["client", "restaurant", "commercial", "courier"]');
    expect(browserGrid).toContain('surface: "commercial"');
    expect(browserGrid).not.toContain("thirdSurface");
    expect(multiSpace).toContain("Client, Restaurateur, Commercial et Livreur");
    expect(consoleAi).toContain('entrypoint: "commercial_multi_space_console"');
  });

  it("uses Stripe Test without touching production accounting or Connect", () => {
    expect(multiSpace).toContain("Stripe Test uniquement");
    expect(checkout).toContain("getCommercialDemoStripeRuntime");
    expect(checkout).toContain('stripeRuntime.mode !== "test"');
    expect(checkout).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(checkout).toContain("stripe.checkout.sessions.create");
    expect(checkout).toContain("stripe.checkout.sessions.retrieve");
    expect(checkout).toContain("stripeSession.livemode !== false");
    expect(checkout).toContain("no_financial_ledger: true");
    expect(checkout).toContain("restaurant.stripe_account_id");
    expect(checkout).toContain("restaurant.stripe_connect_charges_enabled === true");
    expect(checkout).not.toContain('from("financial_ledger")');
    expect(checkout).not.toContain('from("payment_transactions")');
  });

  it("uses the server OpenAI gateway for every remaining demo AI workflow", () => {
    expect(demoAiClient).toContain("referenceImages?: string[]");
    expect(demoAiEdge).toContain('type: "input_image"');
    expect(demoAiEdge).toContain("reference.dataUrl");
    expect(menu).toContain('entrypoint: "restaurant_menu_image_import"');
    expect(reviews).toContain('entrypoint: "restaurant_review_reply"');
    expect(campaigns).toContain('entrypoint: "restaurant_campaign_optimizer"');
    expect(floorPlan).toContain('entrypoint: "restaurant_floor_plan"');
    expect(reviews).not.toContain("Moteur local zéro coût");
    expect(campaigns).not.toContain("optimisés localement, sans appel IA");
    expect(floorPlan).not.toContain("tok-demo-floor-plan-local-v1");
  });

  it("activates the isolated restaurant and mirrors Admin-enabled tools", () => {
    expect(isolationPreparationPath < activationPreparationPath).toBe(true);
    expect(isolationPreparation).toContain("DROP CONSTRAINT IF EXISTS restaurants_demo_isolation_check");
    expect(isolationPreparation).not.toContain("COALESCE(is_active, false) IS FALSE");
    expect(isolationPreparation).toContain("stripe_account_id IS NULL");
    expect(isolationPreparation).toContain("stripe_connect_details_submitted IS FALSE");
    expect(isolationPreparation).toContain("stripe_connect_charges_enabled IS FALSE");
    expect(isolationPreparation).toContain("stripe_connect_payouts_enabled IS FALSE");
    expect(activationPreparation).toContain("DISABLE TRIGGER protect_demo_restaurant_identity");
    expect(activationPreparation).toContain("SET is_active = true");
    expect(activationPreparation).toContain("ENABLE TRIGGER protect_demo_restaurant_identity");
    expect(activationPreparation.indexOf("DISABLE TRIGGER")).toBeLessThan(activationPreparation.indexOf("UPDATE public.restaurants"));
    expect(activationPreparation.indexOf("UPDATE public.restaurants")).toBeLessThan(activationPreparation.indexOf("ENABLE TRIGGER"));
    expect(migration).toContain("WHERE is_demo IS TRUE");
    expect(migration).toContain("SET is_active = true");
    expect(migration).toContain("stripe_account_id IS NULL");
    expect(migration).toContain("stripe_connect_charges_enabled IS FALSE");
    expect(activeInvariantMigration).toContain("CREATE TRIGGER enforce_commercial_demo_restaurant_active");
    expect(activeInvariantMigration).toContain("NEW.is_active := true");
    expect(activeInvariantMigration).toContain("WHEN (NEW.is_demo IS TRUE)");
    expect(social).toContain('"actualites-posts"');
    expect(social).toContain("unlimitedPosts: true");
  });
});
