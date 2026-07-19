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
  const pack = read("src/pages/dashboard/DashboardPack.tsx");
  const social = read("src/hooks/useSocialFeed.ts");
  const migration = read("supabase/migrations/20260719113000_activate_commercial_demo_restaurant.sql");
  const checkout = read("supabase/functions/commercial-demo-checkout/index.ts");

  it("always exposes the client restaurant and courier dashboards", () => {
    expect(browserGrid).toContain('type RemoteBrowserSurface = Exclude<CommercialDemoFrameSurface, "commercial">');
    expect(browserGrid).toContain('() => ["client", "restaurant", "courier"]');
    expect(browserGrid).not.toContain('surface: "commercial"');
    expect(browserGrid).not.toContain("thirdSurface");
    expect(multiSpace).toContain("Client, Restaurateur et Livreur");
    expect(consoleAi).toContain('visible_spaces: ["client", "restaurant", "courier"]');
  });

  it("keeps Stripe strictly in test mode for commercial demonstrations", () => {
    expect(multiSpace).toContain("Stripe Test uniquement");
    expect(checkout).toContain('stripeRuntime.mode !== "test"');
    expect(checkout).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(checkout).toContain('stripeSession.livemode !== false');
    expect(checkout).toContain('no_financial_ledger: "true"');
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
    expect(migration).toContain("WHERE is_demo IS TRUE");
    expect(migration).toContain("SET is_active = true");
    expect(migration).toContain("stripe_account_id IS NULL");
    expect(migration).toContain("stripe_connect_charges_enabled IS FALSE");
    expect(pack).toContain("Tous les modules actifs");
    expect(social).toContain('"actualites-posts"');
    expect(social).toContain("unlimitedPosts: true");
  });
});
