from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_test(path: str, title: str, block: str) -> None:
    file = ROOT / path
    text = file.read_text()
    pattern = re.compile(r'  it\("' + re.escape(title) + r'", \(\) => \{.*?\n  \}\);', re.S)
    next_text, count = pattern.subn(block.rstrip(), text, count=1)
    if count != 1:
        raise RuntimeError(f"expected one test block for {path}: {title}, found {count}")
    file.write_text(next_text)


def replace_exact(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f"missing expected text in {path}: {old}")
    file.write_text(text.replace(old, new, 1))


replace_test(
    "src/test/commercial-demo-client-home.test.ts",
    "keeps every client-home link inside the isolated frame allowlist",
    '''  it("keeps every client-home link inside the isolated frame allowlist", () => {
    expect(clientHome).toContain("function getClientDashboardHomeTarget");
    expect(clientHome).toContain("return getCommercialDemoClientTarget(target)");
    expect(clientRoutes).toContain('"/commande/"');
    expect(clientRoutes).not.toContain('if (url.pathname.startsWith("/commande/")) return "/commandes";');
    expect(clientRoutes).toContain("isCommercialDemoClientPathAllowed(url.pathname)");
    expect(clientRoutes).toContain('return "/recherche";');
    expect(clientHome).toContain("to={clientTarget(action.to)}");
    expect(clientHome).toContain('to={clientTarget(`/commande/');
  });''',
)

replace_exact(
    "src/test/commercial-demo-visible-navigation-isolation.test.ts",
    "    expect(clientRoutes).not.toContain('\"/commande/\",');",
    "    expect(clientRoutes).toContain('\"/commande/\",');",
)

replace_test(
    "src/test/commercial-demo-host-payment-isolation.test.ts",
    "installs the browser guard before auth and validates the simulated payment across frames",
    '''  it("installs the browser guard before auth and validates Stripe Test checkout across frames", () => {
    const app = read("src/App.tsx");
    const boundary = read("src/components/commercial/CommercialDemoHostSecurityBoundary.tsx");
    const journey = read("src/lib/commercialDemoJourney.ts");
    const orchestrator = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
    const cart = read("src/pages/Panier.tsx");

    expect(app.indexOf("<CommercialDemoHostSecurityBoundary>"))
      .toBeLessThan(app.indexOf("<AuthProvider>"));
    expect(boundary).toContain("shouldBlockCommercialDemoHostRequest");
    expect(boundary).toContain("production-transaction-blocked");
    expect(journey).toContain("simulateCommercialDemoPayment");
    expect(journey).toContain("createCommercialDemoCheckout");
    expect(journey).toContain("openCommercialDemoCheckout");
    expect(journey).toContain("checkout.stripe.com");
    expect(journey).toContain('type: "commercial-demo:open-checkout"');
    expect(journey).not.toContain('payment_provider: "none"');
    expect(orchestrator).toContain("confirmCommercialDemoCheckout");
    expect(orchestrator).toContain("isStripeTestCheckoutSessionId");
    expect(orchestrator).toContain("checkout.stripe.com");
    expect(cart).toContain("simulateCommercialDemoPayment");
  });''',
)

replace_test(
    "src/test/commercial-demo-host-payment-isolation.test.ts",
    "rejects the commercial host in live checkout and confines the simulator to the demo project",
    '''  it("rejects the commercial host in live checkout and confines Stripe Test to the demo project", () => {
    const liveCheckout = read("supabase/functions/create-checkout/index.ts");
    const sharedGuard = read("supabase/functions/_shared/commercial-demo-host.ts");
    const demoCheckout = read("supabase/functions/commercial-demo-checkout/index.ts");

    const hostGuardIndex = liveCheckout.indexOf("if (isCommercialDemoHostRequest(req))");
    expect(hostGuardIndex).toBeGreaterThan(-1);
    expect(hostGuardIndex).toBeLessThan(liveCheckout.indexOf("authenticateRequest(req"));
    expect(hostGuardIndex).toBeLessThan(liveCheckout.indexOf("getStripeRuntimeForCheckoutKind(effectiveKind)"));
    expect(liveCheckout).toContain("COMMERCIAL_DEMO_LIVE_CHECKOUT_BLOCKED");
    expect(sharedGuard).toContain('COMMERCIAL_DEMO_HOSTNAME = "commercial.thetok.ch"');
    expect(demoCheckout).toContain("requireDedicatedDemoRuntime()");
    expect(demoCheckout).toContain("getCommercialDemoStripeRuntime");
    expect(demoCheckout).toContain("stripe.checkout.sessions.create");
    expect(demoCheckout).toContain("stripe.checkout.sessions.retrieve");
    expect(demoCheckout).toContain("stripeSession.livemode !== false");
    expect(demoCheckout).toContain('"commercial_demo_confirm_test_payment"');
    expect(demoCheckout).toContain('stripeRuntime.mode !== "test"');
    expect(demoCheckout).not.toContain('from("orders")');
    expect(demoCheckout).not.toContain('from("financial_ledger")');
    expect(demoCheckout).not.toContain("STRIPE_SECRET_KEY_LIVE");
  });''',
)

replace_test(
    "src/test/commercial-demo-host-payment-isolation.test.ts",
    "does not open a payment-provider return path on the commercial host",
    '''  it("opens only the validated Stripe Test return path on the commercial host", () => {
    const demoCheckout = read("supabase/functions/commercial-demo-checkout/index.ts");
    const orchestrator = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");

    expect(demoCheckout).toContain("return_url");
    expect(demoCheckout).toContain("buildReturnUrl");
    expect(demoCheckout).toContain('url.pathname = "/commercial/demo-live"');
    expect(demoCheckout).toContain('url.searchParams.set("demo_checkout", state)');
    expect(demoCheckout).toContain('url.searchParams.set("stripe_session_id", "{CHECKOUT_SESSION_ID}")');
    expect(orchestrator).toContain("isStripeTestCheckoutSessionId");
    expect(orchestrator).toContain("checkout.stripe.com");
    expect(orchestrator).toContain("event.source as Window");
    expect(orchestrator).toContain('sourceFrame.surface !== "client"');
  });''',
)

replace_test(
    "src/test/commercial-demo-dedicated-project.test.ts",
    "syncs real AI keys without injecting any payment-provider credential",
    '''  it("syncs real AI keys and only a Stripe Test credential into the dedicated demo project", () => {
    expect(secretsWriter).toContain('["OPENAI_API_KEY", requireSecret("OPENAI_API_KEY")]');
    expect(secretsWriter).toContain('readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST")');
    expect(secretsWriter).toContain('startsWith("sk_test_")');
    expect(secretsWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');
    expect(secretsWriter).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');
    expect(secretsWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(secretsWriter).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
    expect(workflow).toContain("write-commercial-demo-secrets-env.mjs");
    expect(workflow).toContain("commercial-demo.providers.env");
    expect(workflow).toContain(
      'secrets set --env-file "${RUNNER_TEMP}/commercial-demo.providers.env" --project-ref "$COMMERCIAL_DEMO_PROJECT_REF"',
    );
    expect(workflow).toContain(
      'functions deploy "${functions[@]}" --project-ref "$COMMERCIAL_DEMO_PROJECT_REF"',
    );
  });''',
)

replace_exact(
    "src/test/commercial-demo-role-workspaces.test.ts",
    '    expect(browserGrid).toContain(\'type RemoteBrowserSurface = Exclude<CommercialDemoFrameSurface, "commercial">\');\n    expect(browserGrid).toContain(\'() => ["client", "restaurant", "courier"]\');\n    expect(browserGrid).not.toContain(\'surface: "commercial"\');\n    expect(browserGrid).not.toContain("thirdSurface");',
    '    expect(browserGrid).toContain(\'type ActorBrowserSurface = Exclude<CommercialDemoFrameSurface, "commercial">\');\n    expect(browserGrid).toContain(\'buildCommercialDemoFrameUrl("commercial"\');\n    expect(browserGrid).toContain(\'data-browser-surface="commercial"\');\n    expect(browserGrid).toContain("<CommercialDemoActorBrowserGrid");',
)

replace_test(
    "src/test/commercial-demo-role-workspaces.test.ts",
    "simulates accepted payments without contacting Stripe",
    '''  it("uses Stripe Test only and keeps production finance isolated", () => {
    expect(multiSpace).toContain("Stripe Test uniquement");
    expect(multiSpace).toContain("confirmCommercialDemoCheckout");
    expect(multiSpace).toContain("checkout.stripe.com");
    expect(checkout).toContain("requireDedicatedDemoRuntime()");
    expect(checkout).toContain("getCommercialDemoStripeRuntime");
    expect(checkout).toContain("stripe.checkout.sessions.create");
    expect(checkout).toContain("stripeSession.livemode !== false");
    expect(checkout).toContain('"commercial_demo_confirm_test_payment"');
    expect(checkout).toContain('finance_routing_mode: "demo_isolated"');
    expect(checkout).not.toContain('from("financial_ledger")');
    expect(checkout).not.toContain("STRIPE_SECRET_KEY_LIVE");
  });''',
)

# Browser grid split: the commercial surface is now a faithful standalone frame,
# while the existing rich actor controls live in CommercialDemoActorBrowserGrid.
replace_exact(
    "src/test/commercial-multi-space-demo.test.ts",
    '  const browsers = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");',
    '  const browsers = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");\n  const actorBrowsers = read("src/components/commercial/CommercialDemoActorBrowserGrid.tsx");',
)

replace_test(
    "src/test/commercial-multi-space-demo.test.ts",
    "mounts real same-origin SPA instances with isolated browser histories",
    '''  it("mounts the commercial frame plus real actor SPA instances with isolated browser histories", () => {
    expect(app).toContain("getCommercialDemoFrameConfig()");
    expect(app).toContain("<BrowserRouter basename={commercialDemoFrame?.basename}>");
    expect(browsers).toContain('buildCommercialDemoFrameUrl("commercial"');
    expect(browsers).toContain('data-browser-surface="commercial"');
    expect(browsers).toContain("<CommercialDemoActorBrowserGrid");
    expect(actorBrowsers).toContain("<iframe");
    expect(actorBrowsers).toContain('surface: "client"');
    expect(actorBrowsers).toContain('surface: "restaurant"');
    expect(actorBrowsers).toContain('surface: "courier"');
    expect(actorBrowsers).toContain('initialPath: "/mon-espace"');
    expect(actorBrowsers).toContain('initialPath: "/dashboard"');
    expect(actorBrowsers).toContain('initialPath: "/courier"');
    expect(actorBrowsers).toContain("ResizeObserver");
    expect(actorBrowsers).toContain("frameWindow.history.back()");
    expect(actorBrowsers).toContain("frameWindow.history.forward()");
    expect(actorBrowsers).toContain("frameWindow.location.reload()");
    expect(actorBrowsers).toContain('type: "commercial-demo:navigate"');
    expect(page).toContain("overflow-x-hidden");
  });''',
)

replace_test(
    "src/test/commercial-multi-space-demo.test.ts",
    "keeps the remote-control console responsive, observable and safe to reset",
    '''  it("keeps the actor remote-control console responsive, observable and safe to reset", () => {
    expect(actorBrowsers).toContain('type ViewportMode = "auto" | ViewportPreset');
    expect(actorBrowsers).toContain("useResponsiveViewportPreset()");
    expect(actorBrowsers).toContain("VIEWPORT_MODE_ORDER.map");
    expect(actorBrowsers).toContain('referrerPolicy="no-referrer"');
    expect(actorBrowsers).toContain('key={`${definition.surface}:${sessionId}`}');
    expect(actorBrowsers).toContain('layout === "control"');
    expect(actorBrowsers).toContain('layout === "mosaic"');
    expect(actorBrowsers).toContain("isCommercialDemoFrameEscapeMessage");
    expect(actorBrowsers).toContain("event.source !== frameRef.current?.contentWindow");
  });''',
)

replace_exact(
    "src/test/commercial-multi-space-demo.test.ts",
    '    expect(clientRoutes).not.toContain(\'"/commande/",\');',
    '    expect(clientRoutes).toContain(\'"/commande/",\');',
)

replace_test(
    "src/test/commercial-multi-space-demo.test.ts",
    "simulates accepted payment server-side and refreshes every real dashboard",
    '''  it("opens Stripe Test and confirms the paid snapshot across every real dashboard", () => {
    expect(workspace).toContain("simulateCommercialDemoPayment");
    expect(experience).toContain("confirmCommercialDemoCheckout");
    expect(experience).toContain("isStripeTestCheckoutSessionId");
    expect(experience).toContain("checkout.stripe.com");
    expect(service).toContain('"commercial-demo-checkout"');
    expect(service).toContain('action: "create"');
    expect(service).toContain('action: "confirm"');
    expect(service).toContain("createCommercialDemoCheckout");
    expect(service).toContain("openCommercialDemoCheckout");
    expect(service).not.toContain('payment_provider: "none"');
  });''',
)

replace_test(
    "src/test/customer-order-tracking-no-simulation.test.ts",
    "does not advance a delivery to completed with local simulation timers",
    '''  it("does not advance a live delivery to completed with local simulation timers", () => {
    const page = read("src/pages/SuiviCommandeLive.tsx");
    const wrapper = read("src/pages/SuiviCommande.tsx");

    expect(page).not.toContain("SIMULATION_PHASE_SECONDS");
    expect(page).not.toContain("simulationPhase");
    expect(page).not.toContain("simulationCountdown");
    expect(page).not.toContain("setSimulationPhase");
    expect(page).not.toContain("generateRoute");
    expect(page).not.toContain("window.setTimeout");
    expect(page).toContain("hasLiveCourierFlow ? liveTracking : null");
    expect(page).toContain("Statut restaurant");
    expect(page).toContain("Aucun flux livreur n'est encore disponible");
    expect(wrapper).toContain("CommercialDemoOrderTracking");
    expect(wrapper).toContain("SuiviCommandeLive");
  });''',
)

# Replace the obsolete simulator contract wholesale with Stripe Test invariants.
payment_test = ROOT / "src/test/commercial-demo-payment-simulator.test.ts"
payment_test.write_text('''import { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\n\nimport { describe, expect, it } from "vitest";\n\nconst root = process.cwd();\nconst read = (path: string) => readFileSync(resolve(root, path), "utf8");\n\ndescribe("dedicated commercial demo Stripe Test checkout", () => {\n  const edge = read("supabase/functions/commercial-demo-checkout/index.ts");\n  const journey = read("src/lib/commercialDemoJourney.ts");\n  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");\n  const secretsWriter = read("scripts/write-commercial-demo-secrets-env.mjs");\n  const workflow = read(".github/workflows/deploy-production.yml");\n  const liveCheckout = read("supabase/functions/create-checkout/index.ts");\n  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");\n\n  it("runs only in the dedicated demo project and authenticates the commercial actor", () => {\n    expect(edge).toContain('DEMO_PROJECT_URL = "https://hzldfhjfgjcadmpghhhf.supabase.co"');\n    expect(edge).toContain("requireDedicatedDemoRuntime()");\n    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");\n    expect(edge).toContain('actor.roles.includes("commercial")');\n    expect(edge).toContain('.from("commercial_demo_accounts")');\n    expect(edge).toContain('restaurant.status !== "demo"');\n  });\n\n  it("uses authoritative demo order data and Stripe Test only", () => {\n    expect(edge).toContain('"commercial_demo_get_checkout_order"');\n    expect(edge).toContain("order.total_amount_cents");\n    expect(edge).toContain('order.currency !== "chf"');\n    expect(edge).toContain('order.stripe_mode !== "test"');\n    expect(edge).toContain("getCommercialDemoStripeRuntime");\n    expect(edge).toContain("stripe.checkout.sessions.create");\n    expect(edge).toContain("stripe.checkout.sessions.retrieve");\n    expect(edge).toContain("stripeSession.livemode !== false");\n    expect(edge).not.toContain('from("orders")');\n    expect(edge).not.toContain('from("financial_ledger")');\n    expect(edge).not.toContain('from("payment_transactions")');\n  });\n\n  it("binds cs_test sessions to the demo order before service-only confirmation", () => {\n    expect(edge).toContain("requireTestCheckoutSessionId");\n    expect(edge).toContain("cs_test_");\n    expect(edge).toContain("assertStripeSessionMatchesOrder");\n    expect(edge).toContain('finance_routing_mode: "demo_isolated"');\n    expect(edge).toContain('no_financial_ledger: "true"');\n    expect(edge).toContain('"commercial_demo_confirm_test_payment"');\n    expect(edge).toContain("p_checkout_session_id: stripeSession.id");\n    expect(edge).toContain('payment_status: "test_paid"');\n  });\n\n  it("opens only checkout.stripe.com and confirms the snapshot on return", () => {\n    expect(journey).toContain("createCommercialDemoCheckout");\n    expect(journey).toContain("confirmCommercialDemoCheckout");\n    expect(journey).toContain("openCommercialDemoCheckout");\n    expect(journey).toContain("checkout.stripe.com");\n    expect(journey).toContain('type: "commercial-demo:open-checkout"');\n    expect(journey).toContain("isStripeTestCheckoutSessionId");\n    expect(experience).toContain("confirmCommercialDemoCheckout");\n    expect(experience).toContain("isStripeTestCheckoutSessionId");\n    expect(experience).toContain("checkout.stripe.com");\n  });\n\n  it("provisions only a Stripe test secret into the dedicated demo project", () => {\n    expect(secretsWriter).toContain('readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST")');\n    expect(secretsWriter).toContain('startsWith("sk_test_")');\n    expect(secretsWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');\n    expect(secretsWriter).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');\n    expect(secretsWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");\n    expect(secretsWriter).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");\n    expect(workflow).toContain("write-commercial-demo-secrets-env.mjs");\n    expect(workflow).toContain("commercial-demo.providers.env");\n  });\n\n  it("leaves production Stripe checkout and webhook defenses unchanged", () => {\n    expect(liveCheckout).toContain('effectiveKind === "commercial-demo-order"');\n    expect(liveCheckout).toContain("if (isCommercialDemoHostRequest(req))");\n    expect(stripeWebhook).toContain("commercial_demo_event_ignored_by_live_webhook");\n    expect(stripeWebhook).toContain('checkoutKind === "commercial-demo-order"');\n    expect(stripeWebhook).toContain("ignore_commercial_demo_test_event");\n  });\n});\n''')

replace_exact(
    "src/test/demo-workspace-access.test.ts",
    '    expect(browserGrid).toContain(\'() => ["client", "restaurant", "courier"]\');',
    '    expect(browserGrid).toContain(\'data-browser-surface="commercial"\');\n    expect(browserGrid).toContain("<CommercialDemoActorBrowserGrid");',
)

replace_test(
    "src/test/deploy-production-secret-scope.test.ts",
    "scopes the dedicated demo to server AI and no payment-provider secret",
    '''  it("scopes the dedicated demo to server AI and a Stripe Test secret only", () => {
    const demoSecretNames = secretEnvironmentNames(prepareDemoSecrets);
    for (const name of [
      "FIRECRAWL_API_KEY",
      "OPENAI_API_KEY",
      "SUPABASE_ACCESS_TOKEN",
      "STRIPE_SECRET_KEY_TEST",
    ]) {
      expect(demoSecretNames).toContain(name);
    }
    expect(demoSecretNames).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(demoSecretNames).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
    expect(secretEnvironmentNames(configureDemoAuth)).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(demoSecretWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');
    expect(demoSecretWriter).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');
    expect(demoSecretWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(prepareDemoSecrets).toContain("STRIPE_SECRET_KEY_TEST");
  });''',
)

print("Updated stale commercial demo contracts for Stripe Test and four-space parity.")
