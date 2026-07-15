import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
    const supabase = "https://project.supabase.co";
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/create-checkout`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/validate-order`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/process-refund`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/manage-tok-one-subscription`))).toBe(true);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/functions/v1/create-social-post-boost`))).toBe(true);
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
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/commercial_demo_create_order`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/rpc/commercial_demo_create_reservation`))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/commercial_demo_orders`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/commercial_prospects`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest(commercialInput(`${supabase}/rest/v1/restaurants`, "GET"))).toBe(false);
    expect(shouldBlockCommercialDemoHostRequest({
      ...commercialInput(`${supabase}/functions/v1/create-checkout`),
      currentHostname: "www.thetok.ch",
    })).toBe(false);
  });

  it("installs the browser guard before auth and validates the test session across frames", () => {
    const app = read("src/App.tsx");
    const boundary = read("src/components/commercial/CommercialDemoHostSecurityBoundary.tsx");
    const journey = read("src/lib/commercialDemoJourney.ts");
    const actor = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
    const frame = read("src/lib/commercialDemoFrame.ts");
    const orchestrator = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
    const cart = read("src/pages/Panier.tsx");

    expect(app.indexOf("<CommercialDemoHostSecurityBoundary>"))
      .toBeLessThan(app.indexOf("<AuthProvider>"));
    expect(boundary).toContain("shouldBlockCommercialDemoHostRequest");
    expect(boundary).toContain("production-transaction-blocked");
    expect(journey).toContain("isStripeTestCheckoutSessionId(record.stripe_session_id)");
    expect(journey).toContain("stripeSessionId,");
    expect(actor).toContain("result.stripe_session_id");
    expect(frame).toContain('/^cs_test_[A-Za-z0-9_]+$/');
    expect(orchestrator).toContain("isStripeTestCheckoutSessionId(stripeSessionId)");
    expect(cart).toContain("checkout.stripe_session_id");
  });

  it("rejects the commercial host in live checkout before auth or Stripe runtime selection", () => {
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
    expect(demoCheckout).toContain("getCommercialDemoStripeRuntime()");
    expect(demoCheckout).toContain("returnHost === COMMERCIAL_DEMO_HOSTNAME");
    expect(demoCheckout).toContain("isCommercialDemoProductionRuntime()");
    expect(demoCheckout).not.toContain("configuredHosts");
    expect(demoCheckout).not.toContain("OWNED_PREVIEW_HOST");
    expect(sharedGuard).toContain('supabaseHostname.endsWith(".supabase.co")');
    expect(sharedGuard).toContain('hostname === "localhost"');
    expect(sharedGuard).toContain('hostname.endsWith(".test")');
  });

  it("blocks commercial identities before every sensitive production flow", () => {
    const auth = read("supabase/functions/_shared/auth.ts");
    expect(auth).toContain("export async function assertProductionFlowAllowed(");
    expect(auth).toContain('.from("commercial_demo_accounts")');
    expect(auth).toContain('.includes("commercial")');
    expect(auth).toContain("if (actor.isServiceRole || actor.isAdmin) return");
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
    ];

    for (const functionName of guardedFunctions) {
      const source = read(`supabase/functions/${functionName}/index.ts`);
      const guardIndex = source.indexOf("await assertProductionFlowAllowed(actor");
      expect(guardIndex, `${functionName} must use the shared guard`).toBeGreaterThan(-1);
      expect(guardIndex, `${functionName} must block before reading request JSON`)
        .toBeLessThan(source.indexOf("req.json"));
    }
  });

  it("blocks production order/reservation rows and reads at the database boundary", () => {
    const migration = read("supabase/migrations/20260715023000_commercial_demo_transaction_host_isolation.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.commercial_demo_user_is_restricted(");
    expect(migration).toContain("commercial_role.role = 'commercial'::public.app_role");
    expect(migration).toContain("account.is_active");
    expect(migration).toContain("role_assignment.role = 'admin'::public.app_role");
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
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("scope_production_restaurants_for_commercial_demo_accounts");
    expect(migration).toContain("scope_production_menu_items_for_commercial_demo_accounts");
    expect(migration).toContain("block_production_access_for_commercial_demo_accounts");
    expect(migration).toContain("'create_order_with_items'");
    expect(migration).toContain("'search_restaurants_catalog'");
    expect(migration).toContain("'get_match_group_public_feed'");
    expect(migration).toContain("'get_social_feed_premium_banners'");
    expect(migration).toContain("COMMERCIAL_DEMO_PRODUCTION_TRANSACTION_BLOCKED");
    expect(migration).toContain("COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED");
  });
});
