import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo multi-space fidelity regression", () => {
  const browserGrid = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");
  const multiSpace = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const actorWorkspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const cart = read("src/pages/Panier.tsx");
  const journey = read("src/lib/commercialDemoJourney.ts");
  const checkout = read("supabase/functions/commercial-demo-checkout/index.ts");
  const demoSecretWriter = read("scripts/write-commercial-demo-secrets-env.mjs");

  it("renders the four real application spaces in the remote-control console", () => {
    expect(browserGrid).toContain("type RemoteBrowserSurface = CommercialDemoFrameSurface");
    expect(browserGrid).toContain('surface: "client"');
    expect(browserGrid).toContain('surface: "restaurant"');
    expect(browserGrid).toContain('surface: "commercial"');
    expect(browserGrid).toContain('surface: "courier"');
    expect(browserGrid).toContain('initialPath: "/commercial"');
    expect(browserGrid).toContain('() => ["client", "restaurant", "commercial", "courier"]');
    expect(browserGrid).toContain("commercial: initialRuntime");
    expect(browserGrid).not.toContain("thirdSurface");
    expect(multiSpace).toContain("quatre");
    expect(multiSpace).toContain("Client, Restaurateur, Commercial et Livreur");
  });

  it("uses an isolated real Stripe Checkout Test flow instead of accepting payment locally", () => {
    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("confirmCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout");
    expect(journey).toContain('action: "create"');
    expect(journey).toContain('action: "confirm"');
    expect(journey).toContain("isStripeTestCheckoutSessionId");
    expect(journey).toContain("checkout.stripe.com");

    expect(checkout).toContain("getCommercialDemoStripeRuntime");
    expect(checkout).toContain("stripe.checkout.sessions.create");
    expect(checkout).toContain("stripe.checkout.sessions.retrieve");
    expect(checkout).toContain("stripeSession.livemode !== false");
    expect(checkout).toContain("idempotencyKey");
    expect(checkout).toContain('"commercial_demo_confirm_test_payment"');
    expect(checkout).toContain("no_financial_ledger: true");
    expect(checkout).not.toContain('payment_provider: "none"');

    expect(actorWorkspace).toContain("4242 4242 4242 4242");
    expect(actorWorkspace).toContain("createCommercialDemoCheckout");
    expect(actorWorkspace).toContain("Payer avec Stripe Test");

    // Panier keeps a compatibility name, but that bridge must itself open the
    // exact same validated Stripe Test Checkout and never accept payment locally.
    expect(cart).toContain("simulateCommercialDemoPayment");
    expect(journey).toContain("Compatibility bridge");
    expect(journey).toContain("const checkout = await createCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout(");
    expect(journey).not.toContain('action: "simulate"');

    expect(multiSpace).toContain("confirmCommercialDemoCheckout");
    expect(multiSpace).toContain("isCommercialDemoFrameMessage(event.data)");
    expect(multiSpace).toContain('sourceFrame.surface !== "client"');
    expect(multiSpace).toContain('checkoutUrl.hostname !== "checkout.stripe.com"');
    expect(multiSpace).toContain("Stripe Test uniquement");
  });

  it("provisions only a validated sk_test key into the dedicated demo runtime", () => {
    expect(demoSecretWriter).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(demoSecretWriter).toContain('startsWith("sk_test_")');
    expect(demoSecretWriter).toContain('"STRIPE_SECRET_KEY"');
    expect(demoSecretWriter).not.toContain('["DEMO_PAYMENT_MODE", "simulated"]');
    expect(demoSecretWriter).not.toContain("sk_live_");
  });
});
