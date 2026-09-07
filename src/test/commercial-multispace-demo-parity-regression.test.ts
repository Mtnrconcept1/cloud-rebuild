import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readOptional = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

describe("commercial multi-space demo parity", () => {
  it("exposes the real commercial workspace alongside client, restaurant and courier", () => {
    const browserGrid = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");
    const actorGrid = read("src/components/commercial/CommercialDemoActorBrowserGrid.tsx");
    const frame = read("src/lib/commercialDemoFrame.ts");

    expect(frame).toContain('"client" | "restaurant" | "courier" | "commercial"');
    expect(browserGrid).toContain('buildCommercialDemoFrameUrl("commercial"');
    expect(browserGrid).toContain('data-browser-surface="commercial"');
    expect(actorGrid).toContain('surface: "client"');
    expect(actorGrid).toContain('surface: "restaurant"');
    expect(actorGrid).toContain('surface: "courier"');
  });

  it("routes demo orders through an authenticated Stripe Test checkout and confirms only cs_test sessions", () => {
    const journey = read("src/lib/commercialDemoJourney.ts");
    const checkout = read("supabase/functions/commercial-demo-checkout/index.ts");
    const multiSpace = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");

    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("confirmCommercialDemoCheckout");
    expect(journey).toContain("isStripeTestCheckoutSessionId");
    expect(journey).toContain("checkout.stripe.com");
    expect(journey).not.toContain('payment_provider: "none"');
    expect(checkout).toContain("getCommercialDemoStripeRuntime");
    expect(checkout).toContain("stripe.checkout.sessions.create");
    expect(checkout).toContain("commercial_demo_confirm_test_payment");
    expect(checkout).not.toContain("commercial_demo_confirm_simulated_payment");
    expect(checkout).toContain("requireDedicatedDemoRuntime()");
    expect(checkout).toContain("restaurant.is_active !== true");
    expect(multiSpace).toContain("commercial-demo:open-checkout");
    expect(multiSpace).toContain("confirmCommercialDemoCheckout");
    expect(multiSpace).toContain("checkout.stripe.com");
  });

  it("keeps reservation writes isolated in the dedicated demo session", () => {
    const reservationDialog = read("src/components/ReservationDialog.tsx");
    expect(reservationDialog).toContain("createCommercialDemoReservation");
    expect(reservationDialog).toContain('commercialDemoFrame?.surface === "client"');
  });

  it("keeps the real order-detail route available inside the client demo frame", () => {
    const routes = read("src/lib/commercialDemoClientRoutes.ts");
    const tracking = read("src/pages/SuiviCommande.tsx");
    const demoTracking = read("src/components/commercial/CommercialDemoOrderTracking.tsx");

    expect(routes).toContain('"/commande/"');
    expect(routes).not.toContain('if (url.pathname.startsWith("/commande/")) return "/commandes"');
    expect(tracking).toContain("CommercialDemoOrderTracking");
    expect(demoTracking).toContain("useCommercialDemoFrame");
    expect(demoTracking).not.toContain('from("orders")');
  });

  it("provisions only Stripe Test into the dedicated demo provider env", () => {
    const writer = read("scripts/write-commercial-demo-secrets-env.mjs");
    expect(writer).toContain('readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST")');
    expect(writer).toContain('startsWith("sk_test_")');
    expect(writer).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');
    expect(writer).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');
    expect(writer).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(writer).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
  });

  it("removes presentation quotas only in the dedicated demo database while preserving safety gates", () => {
    const migration = readOptional("supabase/demo-migrations/20260907084500_unlimited_commercial_demo_ai.sql");
    const edge = read("supabase/functions/commercial-demo-ai/index.ts");

    expect(migration).toContain("commercial_demo_ai_claim_request");
    expect(migration).toContain("v_provider_failures >= 6");
    expect(migration).toContain("'state', 'circuit_open'");
    expect(migration).toContain("v_global_processing >= 12");
    expect(migration).toContain("v_session_processing >= 2");
    expect(migration).not.toContain("v_commercial_calls + 1 > 60");
    expect(migration).not.toContain("v_global_calls + 1 > 600");
    expect(migration).not.toContain("'state', 'budget_exhausted'");
    expect(edge).toContain("MAX_CONCURRENT");
  });
});
