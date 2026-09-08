import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCorsHeaders } from "../../supabase/functions/_shared/cors";

import {
  isCommercialDemoHost,
  isStripeTestCheckoutSessionId,
  shouldBlockCommercialDemoHostRequest,
} from "../lib/commercialDemoHostSecurity";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const commercialInput = (rawUrl: string, method = "POST") => ({
  rawUrl,
  method,
  currentOrigin: "https://commercial.thetok.ch",
  currentHostname: "commercial.thetok.ch",
});

describe("commercial.thetok.ch production transaction isolation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("matches only the dedicated exact host and requires cs_test sessions", () => {
    expect(isCommercialDemoHost("commercial.thetok.ch")).toBe(true);
    expect(isCommercialDemoHost("COMMERCIAL.THETOK.CH.")).toBe(true);
    expect(isCommercialDemoHost("commercial.thetok.ch.evil.example")).toBe(false);
    expect(isCommercialDemoHost("thetok.ch")).toBe(false);

    expect(isStripeTestCheckoutSessionId("cs_test_demo_123")).toBe(true);
    expect(isStripeTestCheckoutSessionId("cs_live_demo_123")).toBe(false);
    expect(isStripeTestCheckoutSessionId("cs_test_bad-value")).toBe(false);
  });

  it("blocks production checkout/order/reservation traffic but allows isolated demo APIs", () => {
    const supabase = "https://placeholder.supabase.co";
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/create-checkout`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/validate-order`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/process-refund`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/manage-tok-one-subscription`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/create-social-post-boost`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/generate-marketing-visual`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/commercial-demo-ai`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://evil-project.supabase.co/functions/v1/commercial-demo-ai"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/commercial-demo-ai`, "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/commercial-demo-ai-preview`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/ai-image-enhance`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://api.openai.com/v1/images/generations"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://api.openai.com/v1/responses"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/orders?select=*`, "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/group_members?select=*`, "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/invoices?select=*`, "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/reservations`, "POST"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/payment_intents`, "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/user_subscriptions`, "POST"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/get_customer_orders_dashboard`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/validate_and_create_reservation`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/search_restaurants_catalog`))).toBe(true);

    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/commercial-demo-checkout`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://evil.example/functions/v1/commercial-demo-checkout"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/commercial_demo_create_order`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/commercial_demo_create_reservation`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://evil-project.supabase.co/rest/v1/rpc/commercial_demo_create_order"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/commercial_demo_orders`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput("https://evil-project.supabase.co/rest/v1/commercial_demo_orders", "GET"))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/commercial_prospects`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/restaurants`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest({
      ...commercialInput(`${supabase}/functions/v1/create-checkout`),
      currentHostname: "www.thetok.ch",
    })).toBe(false);
  });

  it("keeps the OpenAI secret and provider traffic outside the browser bundle", () => {
    const hostGuard = read("src/lib/commercialDemoHostSecurity.ts");
    const effects = read("src/lib/commercialDemoEffects.ts");
    const client = read("src/lib/commercialDemoAi.ts");
    const edge = read("supabase/functions/commercial-demo-ai/index.ts");

    expect(hostGuard).toContain('COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai"');
    expect(effects).toContain('"commercial-demo-ai"');
    expect(client).toContain('"commercial-demo-ai"');
    expect(client).not.toContain("api.openai.com");
    expect(client).not.toContain("OPENAI_API_KEY");
    expect(edge).toContain("api.openai.com");
    expect(edge).toContain("OPENAI_API_KEY");
  });

  it("installs the browser guard before auth and validates Stripe Test across frames", () => {
    const app = read("src/App.tsx");
    const boundary = read("src/components/commercial/CommercialDemoHostSecurityBoundary.tsx");
    const journey = read("src/lib/commercialDemoJourney.ts");
    const actor = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
    const orchestrator = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
    const cart = read("src/pages/Panier.tsx");

    expect(app.indexOf("<CommercialDemoHostSecurityBoundary>"))
      .toBeLessThan(app.indexOf("<AuthProvider>"));
    expect(boundary).toContain("shouldBlockCommercialDemoHostRequest");
    expect(boundary).toContain("production-transaction-blocked");
    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("confirmCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout");
    expect(journey).toContain('action: "create"');
    expect(journey).toContain('action: "confirm"');
    expect(journey).toContain("isStripeTestCheckoutSessionId");
    expect(journey).toContain("checkout.stripe.com");
    expect(journey).not.toContain('action: "simulate"');
    expect(actor).toContain("createCommercialDemoCheckout");
    expect(actor).toContain("sendCheckoutToParent");
    expect(actor).toContain("Payer avec Stripe Test");
    expect(orchestrator).toContain("confirmCommercialDemoCheckout");
    expect(orchestrator).toContain('checkoutUrl.hostname !== "checkout.stripe.com"');
    expect(cart).toContain("simulateCommercialDemoPayment");
    expect(journey).toContain("Compatibility bridge");
  });

  it("rejects the commercial host in live checkout and confines Stripe Test to the demo route", () => {
    const liveCheckout = read("supabase/functions/create-checkout/index.ts");
    const sharedGuard = read("supabase/functions/_shared/commercial-demo-host.ts");
    const demoCheckout = read("supabase/functions/commercial-demo-checkout/index.ts");

    const hostGuardIndex = liveCheckout.indexOf("if (isCommercialDemoHostRequest(req))");
    expect(hostGuardIndex).toBeGreaterThan(-1);
    expect(hostGuardIndex).toBeLessThan(liveCheckout.indexOf("authenticateRequest(req"));
    expect(hostGuardIndex).toBeLessThan(liveCheckout.indexOf("getStripeRuntimeForCheckoutKind(effectiveKind)"));
    expect(liveCheckout).toContain("COMMERCIAL_DEMO_LIVE_CHECKOUT_BLOCKED");
    expect(liveCheckout).toContain("if (isCommercialDemoUrl(return_url))");
    expect(liveCheckout).toContain('assertProductionFlowAllowed(actor, "paiement réel")');
    expect(liveCheckout.indexOf('assertProductionFlowAllowed(actor, "paiement réel")'))
      .toBeLessThan(liveCheckout.indexOf("getStripeRuntimeForCheckoutKind(effectiveKind)"));
    expect(sharedGuard).toContain('COMMERCIAL_DEMO_HOSTNAME = "commercial.thetok.ch"');
    expect(sharedGuard).toContain('req.headers.get("origin")');
    expect(sharedGuard).toContain('req.headers.get("referer")');
    expect(sharedGuard).toContain('"commercial.thetok.ch"');
    expect(demoCheckout).toContain("if (!isCommercialDemoCheckoutRequestAllowed(req))");
    expect(demoCheckout).toContain("COMMERCIAL_DEMO_HOST_REQUIRED");
    expect(demoCheckout).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(demoCheckout).toContain('.from("commercial_demo_accounts")');
    expect(demoCheckout).toContain("restaurant.is_demo !== true");
    expect(demoCheckout).toContain('restaurant.status !== "demo"');
    expect(demoCheckout).toContain("getCommercialDemoStripeRuntime");
    expect(demoCheckout).toContain('stripeRuntime.mode !== "test"');
    expect(demoCheckout).toContain('"STRIPE_SECRET_KEY_TEST"');
    expect(demoCheckout).toContain("stripeSession.livemode !== false");
    expect(demoCheckout).toContain("normalizeCheckoutReturnUrl");
    expect(demoCheckout).not.toContain("sk_live_");
    expect(sharedGuard).toContain('supabaseHostname.endsWith(".supabase.co")');
    expect(sharedGuard).toContain('hostname === "localhost"');
    expect(sharedGuard).toContain('hostname.endsWith(".test")');
  });

  it("blocks commercial identities before every sensitive production flow", () => {
    const auth = read("supabase/functions/_shared/auth.ts");
    expect(auth).toContain("export async function assertProductionFlowAllowed(");
    expect(auth).toContain('.from("commercial_demo_accounts")');
    expect(auth).toContain('.includes("commercial")');
    expect(auth).not.toContain('.eq("is_active", true)');
    expect(auth).toContain("if (actor.isServiceRole) return");
    expect(auth).not.toContain("if (actor.isServiceRole || actor.isAdmin) return");
    expect(auth).toContain('normalizeRole(actor.accountType) === "commercial_demo"');
    expect(auth).toContain("hasCommercialRole && !actor.isAdmin");
    expect(auth).toContain("COMMERCIAL_DEMO_PRODUCTION_FLOW_BLOCKED");
    expect(auth).toContain("COMMERCIAL_DEMO_ACCOUNT_CHECK_UNAVAILABLE");

    const guardedFunctions = [
      "create-checkout",
      "validate-order",
      "authorize-match-group-order",
      "create-reservation",
      "create-zero-attente-reservation",
      "create-chefs-table-reservation",
      "manage-tok-one-subscription",
      "manage-restaurant-subscription",
      "complete-restaurant-credit-pack-checkout",
      "create-social-post-boost",
      "process-refund",
      "cancel-pending-order-checkout",
      "complete-order-checkout",
      "restaurant-order-status",
      "stripe-connect-onboard",
      "stripe-connect-status",
      "analyze-restaurant-image",
      "restaurant-media-governance",
      "provision-commercial-accounts",
    ];

    for (const functionName of guardedFunctions) {
      const source = read(`supabase/functions/${functionName}/index.ts`);
      const guardIndex = source.indexOf("await assertProductionFlowAllowed(actor");
      expect(guardIndex, `${functionName} must use the shared guard`).toBeGreaterThan(-1);
      expect(guardIndex, `${functionName} must block before reading request JSON`)
        .toBeLessThan(source.indexOf("req.json"));
    }
  });

  it("allows browser preflights from the dedicated commercial origin", () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    const headers = buildCorsHeaders(new Request("https://project.supabase.co/functions/v1/commercial-demo-checkout", {
      method: "OPTIONS",
      headers: { Origin: "https://commercial.thetok.ch" },
    }));

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://commercial.thetok.ch");
    expect(headers.Vary).toBe("Origin");
  });

  it("allows only a validated Stripe Test return path on the commercial host", () => {
    const demoCheckout = read("supabase/functions/commercial-demo-checkout/index.ts");
    const orchestrator = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");

    expect(demoCheckout).toContain("return_url");
    expect(demoCheckout).toContain('COMMERCIAL_DEMO_HOSTNAME');
    expect(demoCheckout).toContain('url.pathname = "/commercial/demo-live"');
    expect(demoCheckout).toContain('url.searchParams.set("demo_checkout", state)');
    expect(demoCheckout).toContain('"{CHECKOUT_SESSION_ID}"');
    expect(orchestrator).toContain('params.get("demo_checkout") === "success"');
    expect(orchestrator).toContain("isStripeTestCheckoutSessionId(stripeSessionId)");
    expect(orchestrator).toContain("isCommercialDemoFrameMessage(event.data)");
    expect(orchestrator).toContain('sourceFrame.surface !== "client"');
    expect(orchestrator).toContain('checkoutUrl.hostname !== "checkout.stripe.com"');
  });

  it("blocks production order/reservation rows and reads at the database boundary", () => {
    const migration = read("supabase/migrations/20260715023000_commercial_demo_transaction_host_isolation.sql");
    const adminCompatibilityMigration = read("supabase/migrations/20260715050654_distinguish_admin_from_commercial_demo.sql");
    const restrictionPredicate = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted("),
      migration.indexOf("REVOKE ALL", migration.indexOf("CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted(")),
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted(");
    expect(migration).toContain("commercial_role.role = 'commercial'::public.app_role");
    expect(migration).toContain("account.is_active");
    expect(restrictionPredicate).toContain("FROM public.commercial_demo_accounts AS account");
    expect(restrictionPredicate).toContain("FROM auth.users AS managed_user");
    expect(restrictionPredicate).toContain("raw_app_meta_data ->> 'account_type'");
    expect(restrictionPredicate).not.toContain("account.is_active");
    expect(restrictionPredicate).not.toContain("role_assignment.role = 'admin'::public.app_role");
    expect(adminCompatibilityMigration).toContain("FROM public.commercial_demo_accounts AS account");
    expect(adminCompatibilityMigration).toContain("raw_app_meta_data ->> 'account_type'");
    expect(adminCompatibilityMigration).toContain("FROM public.user_roles AS admin_role");
    expect(adminCompatibilityMigration).toContain("AND NOT EXISTS");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(");
    expect(migration).toContain("demo_candidate.id = public.commercial_demo_current_restaurant_id()");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_branch(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_post(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.block_commercial_demo_account_production_transaction()");
    expect(migration).toContain("public.commercial_demo_user_is_restricted(auth.uid())");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.%I");
    expect(migration).toContain("'orders'");
    expect(migration).toContain("'reservations'");
    expect(migration).toContain("'payment_intents'");
    expect(migration).toContain("'payment_transactions'");
    expect(migration).toContain("'financial_ledger'");
    expect(migration).toContain("'platform_revenue_entries'");
    expect(migration).toContain("'restaurant_invoices'");
    expect(migration).toContain("'restaurant_subscriptions'");
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("scope_production_restaurants_for_commercial_demo_accounts");
    expect(migration).toContain("scope_production_menu_items_for_commercial_demo_accounts");
    expect(migration).toContain("block_production_access_for_commercial_demo_accounts");
    expect(migration).toContain("'create_order_with_items'");
    expect(migration).toContain("'search_restaurants_catalog'");
    expect(migration).toContain("'get_match_group_public_feed'");
    expect(migration).toContain("'get_social_feed_premium_banners'");
    expect(migration).toContain("protect_commercial_demo_account_boundary");
    expect(migration).toContain("COMMERCIAL_DEMO_ACCOUNT_TOMBSTONE_REQUIRED");
    expect(migration).toContain("restaurant_stripe_connect_ready(uuid)");
    expect(migration).toContain("compute_restaurant_reservation_fees(uuid,date,date)");
    expect(migration).toContain("COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED");
    expect(migration).toContain("COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED");
  });
});
