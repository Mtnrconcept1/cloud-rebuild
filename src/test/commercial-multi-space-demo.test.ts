import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial real multi-dashboard demonstration", () => {
  const app = read("src/App.tsx");
  const clientRoutes = read("src/lib/commercialDemoClientRoutes.ts");
  const page = read("src/pages/CommercialDemoLive.tsx");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const browsers = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");
  const actorBrowsers = read("src/components/commercial/CommercialDemoActorBrowserGrid.tsx");
  const courierLayout = read("src/components/CourierDashboardLayout.tsx");
  const courierHome = read("src/pages/courier/CourierHome.tsx");
  const commercialChrome = read("src/components/commercial/CommercialWorkspaceChrome.tsx");
  const frame = read("src/lib/commercialDemoFrame.ts");
  const provider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const workspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const restaurantOrders = read("src/pages/dashboard/DashboardCommandes.tsx");
  const notifications = read("src/hooks/useNotificationCenter.ts");
  const service = read("src/lib/commercialDemoJourney.ts");

  it("mounts the commercial frame plus real actor SPA instances with isolated browser histories", () => {
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
  });

  it("keeps the actor remote-control console responsive, observable and safe to reset", () => {
    expect(actorBrowsers).toContain('type ViewportMode = "auto" | ViewportPreset');
    expect(actorBrowsers).toContain("useResponsiveViewportPreset()");
    expect(actorBrowsers).toContain("VIEWPORT_MODE_ORDER.map");
    expect(actorBrowsers).toContain('referrerPolicy="no-referrer"');
    expect(actorBrowsers).toContain('key={`${definition.surface}:${sessionId}`}');
    expect(actorBrowsers).toContain('layout === "control"');
    expect(actorBrowsers).toContain('layout === "mosaic"');
    expect(actorBrowsers).toContain("isCommercialDemoFrameEscapeMessage");
    expect(actorBrowsers).toContain("event.source !== frameRef.current?.contentWindow");
  });

  it("confines every frame to its demo-safe routes while exposing active restaurant tools", () => {
    expect(app).toContain("COMMERCIAL_DEMO_FRAME_ROUTE_POLICY");
    expect(app).toContain("isPathAllowed: isCommercialDemoClientPathAllowed");
    expect(clientRoutes).toContain('"/restaurant/"');
    expect(clientRoutes).toContain('"/commande/",');
    expect(app).toContain('allowedPaths: ["/dashboard"]');
    expect(app).toContain('allowedPrefixes: ["/dashboard/"]');
    expect(app).toContain('allowedPaths: ["/courier", "/courier/jobs", "/courier/notifications", "/courier/earnings", "/courier/profile"]');
    expect(app).toContain('allowedPaths: ["/commercial", "/commercial/comptabilite"]');
    expect(app).toContain("policy.isPathAllowed?.(pathname)");
    expect(app).toContain("policy.allowedPrefixes?.some((prefix) => pathname.startsWith(prefix))");
    expect(app).toContain("if (!pathAllowed)");
    expect(app).toContain("<Navigate to={policy.home} replace />");
    expect(app).toContain("<CommercialDemoFrameRouteBoundary config={commercialDemoFrame}>");
    expect(app).toContain(
      "const publicNavbar = showGlobalClientChrome && shouldShowPublicNavbar(pathname)",
    );
    expect(app).toContain("commercialDemoContext.snapshot.active_features.includes(flagName)");
  });

  it("runs the real commercial workspace inside the same validated session boundary", () => {
    expect(frame).toContain('CommercialDemoActorSurface | "commercial"');
    expect(frame).toContain('(client|restaurant|courier|commercial)');
    expect(frame).toContain('commercial: "commercial"');
    expect(provider).toContain('type: "commercial-demo:escape"');
    expect(commercialChrome).toContain('commercialDemoFrame?.surface === "commercial"');
    expect(commercialChrome).toContain('item.to !== "/commercial/demo-live"');
    expect(commercialChrome).toContain('!isEmbeddedCommercial ? <SignOutButton iconOnly /> : null');
    expect(notifications).toContain('commercialDemoFrame.surface !== "commercial"');
  });

  it("keeps the courier role virtual and validates every frame through the isolated snapshot RPC", () => {
    expect(frame).toContain("/commercial/demo-live/frame/");
    expect(provider).toContain("[...auth.roles, forcedRole]");
    expect(provider).toContain("roles: presentationRoles");
    expect(provider).not.toContain("roles: [forcedRole]");
    expect(provider).toContain("canSwitchRole: false");
    expect(provider).toContain("signOut: async () => undefined");
    expect(provider).toContain("getCommercialDemoSnapshot(config.sessionId)");
    expect(provider).toContain('type: "commercial-demo:frame-state"');
    expect(provider).toContain("location.pathname");
    expect(provider).toContain("window.parent.postMessage(message, window.location.origin)");
    expect(provider).not.toContain("user_roles");
    expect(provider).not.toContain("courier_profiles");
    expect(workspace).not.toContain("dispatch-order");
    expect(workspace).not.toContain("restaurant-order-status");
  });

  it("uses actual dashboard pages and the isolated demo adapter for operational actions", () => {
    expect(restaurantOrders).toContain("<DashboardLayout");
    expect(restaurantOrders).toContain("buildCommercialDemoDashboardOrders");
    expect(restaurantOrders).toContain("transitionCommercialDemoOrder");
    expect(restaurantOrders).not.toContain("CommercialDemoActorWorkspace");
    for (const action of [
      "restaurant_accept",
      "restaurant_start_preparing",
      "restaurant_mark_ready",
      "courier_accept",
      "courier_arrived_pickup",
      "courier_confirm_pickup",
      "courier_start_delivery",
      "courier_confirm_delivery",
    ]) {
      expect(workspace).toContain(action);
      expect(service).toContain(action);
    }
    expect(workspace).toContain("allowedActions.includes(action)");
  });

  it("delivers surface-specific realtime notifications to the real bell and history components", () => {
    expect(provider).toContain("EVENT_RECIPIENTS");
    expect(provider).toContain('preparation_started: ["client", "courier"]');
    expect(provider).toContain('courier_accepted: ["client", "restaurant"]');
    expect(provider).toContain('order_delivered: ["client", "restaurant", "courier"]');
    expect(provider).toContain("subscribeToCommercialDemoSession");
    expect(notifications).toContain("commercialDemoEventToNotification");
    expect(notifications).toContain("commercialDemoFrame.markNotificationRead");
    expect(notifications).toContain("commercialDemoFrame.markAllNotificationsRead");
    expect(notifications).toContain("!isCommercialDemoFrame");
  });

  it("isolates the courier frame from production dispatch and exposes every adapted tab", () => {
    expect(courierLayout).toContain("const isCommercialDemoFrame = Boolean(commercialDemoFrame)");
    expect(courierLayout).toContain("useActiveFeatures({ enabled: !isCommercialDemoFrame })");
    expect(courierLayout).toContain("(item) => isCommercialDemoFrame || !item.feature");
    expect(courierLayout).toContain("enabled: !isCommercialDemoFrame");
    expect(courierLayout).toContain("if (isCommercialDemoFrame)");
    expect(courierLayout).toContain('navigate("/courier/jobs")');
    expect(courierLayout).toContain("navigate(normalizeInternalNavigationTarget");
    expect(courierLayout).not.toContain('window.location.href = "/courier/jobs"');
  });

  it("renders the production courier home presentation from the isolated demo snapshot", () => {
    const demoHomeSource = courierHome.slice(
      courierHome.indexOf("function buildCommercialDemoCourierHomeViewModel"),
      courierHome.indexOf("function LiveCourierHome"),
    );

    expect(courierHome).toContain("function CourierHomePresentation");
    expect(courierHome).toContain("<CourierHomePresentation");
    expect(courierHome).toContain("pushStatusCard={<CourierPushStatusCard />}");
    expect(courierHome).toContain("commercial-demo-courier-home");
    expect(courierHome).toContain("buildCommercialDemoCourierHomeViewModel(snapshot, isOnline)");
    expect(courierHome).toContain("commercialDemoFrame.snapshot");
    expect(demoHomeSource).toContain('allowedActions.includes("courier_accept")');
    expect(demoHomeSource).toContain('order?.status === "delivered"');
    expect(demoHomeSource).not.toContain("fetchCourierOffers");
    expect(demoHomeSource).not.toContain("fetchCourierActiveJobs");
    expect(demoHomeSource).not.toContain("fetchCourierEarnings");
    expect(demoHomeSource).not.toContain("syncCourierPresence");
    expect(demoHomeSource).not.toContain("useCourierProfile");
    expect(demoHomeSource).not.toContain("useQuery(");
    expect(demoHomeSource).not.toContain("useMutation(");
  });

  it("keeps the embedded courier actor inside its own dashboard chrome", () => {
    expect(courierLayout).toContain("isCommercialDemoFrame={isCommercialDemoFrame}");
    expect(courierLayout).toContain("!isCommercialDemoFrame ? (");
    expect(courierLayout).toContain("<RoleSpaceMenuSection");
    expect(courierLayout).toContain("<ChefHelpButton");
    expect(courierLayout).toContain("!isCommercialDemoFrame ? <SignOutButton iconOnly /> : null");
    expect(courierLayout).not.toContain("isCommercialDemoFrameWindow()");
  });

  it("opens Stripe Test and confirms the paid snapshot across every real dashboard", () => {
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
  });

  it("keeps the demo source of truth outside production orders, dispatch and accounting", () => {
    for (const rpc of [
      "commercial_demo_create_session",
      "commercial_demo_create_order",
      "commercial_demo_get_snapshot",
      "commercial_demo_transition",
      "commercial_demo_reset_session",
    ]) {
      expect(service).toContain(rpc);
    }
    expect(service).toContain("commercial_demo_orders");
    expect(service).toContain("commercial_demo_delivery_missions");
    expect(service).toContain("commercial_demo_order_events");
    expect(experience).not.toContain("setOrder(");
    expect(experience).not.toContain("setMission(");
    expect(experience).toContain("tok:commercial-demo:active-session");
    expect(experience).toContain("window.sessionStorage.setItem");
    expect(experience).toContain('url.searchParams.delete("demo_session_id")');
    expect(experience).not.toContain('url.searchParams.set("demo_session_id"');
    expect(experience).toContain("window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY)");
    expect(experience).toContain("Nouvelle session");
  });
});
