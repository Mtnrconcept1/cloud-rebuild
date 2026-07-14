import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial real multi-dashboard demonstration", () => {
  const app = read("src/App.tsx");
  const page = read("src/pages/CommercialDemoLive.tsx");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const browsers = read("src/components/commercial/CommercialDemoBrowserGrid.tsx");
  const courierLayout = read("src/components/CourierDashboardLayout.tsx");
  const courierHome = read("src/pages/courier/CourierHome.tsx");
  const frame = read("src/lib/commercialDemoFrame.ts");
  const provider = read("src/components/commercial/CommercialDemoFrameProvider.tsx");
  const workspace = read("src/components/commercial/CommercialDemoActorWorkspace.tsx");
  const restaurantOrders = read("src/pages/dashboard/DashboardCommandes.tsx");
  const notifications = read("src/hooks/useNotificationCenter.ts");
  const service = read("src/lib/commercialDemoJourney.ts");

  it("mounts real same-origin SPA instances with isolated browser histories", () => {
    expect(app).toContain("getCommercialDemoFrameConfig()");
    expect(app).toContain("<BrowserRouter basename={commercialDemoFrame?.basename}>");
    expect(app).toContain("<CommercialDemoFrameAuthBoundary");
    expect(app).toContain("<CommercialDemoFrameProvider");
    expect(browsers).toContain("<iframe");
    expect(browsers).toContain('surface: "client"');
    expect(browsers).toContain('surface: "restaurant"');
    expect(browsers).toContain('surface: "commercial"');
    expect(browsers).toContain('surface: "courier"');
    expect(browsers).toContain('initialPath: "/mon-espace"');
    expect(browsers).toContain('initialPath: "/dashboard"');
    expect(browsers).toContain('initialPath: "/commercial"');
    expect(browsers).toContain('initialPath: "/courier"');
    expect(browsers).toContain("ResizeObserver");
    expect(browsers).toContain("frameWindow.history.back()");
    expect(browsers).toContain("frameWindow.history.forward()");
    expect(browsers).toContain("frameWindow.location.reload()");
    expect(browsers).toContain('layout === "control"');
    expect(browsers).toContain('layout === "mosaic"');
    expect(browsers).toContain('thirdSurface === "commercial"');
    expect(browsers).toContain('selectThirdSurface("courier")');
    expect(browsers).toContain('pathname.startsWith("/commercial/demo-live")');
    expect(browsers).toContain("event.source !== frameRef.current?.contentWindow");
    expect(page).toContain("overflow-x-hidden");
  });

  it("strictly confines every frame to its demo-safe route allowlist", () => {
    expect(app).toContain("COMMERCIAL_DEMO_FRAME_ROUTE_POLICY");
    expect(app).toContain('allowedPaths: ["/mon-espace", "/commandes", "/notifications"]');
    expect(app).toContain('allowedPaths: ["/dashboard", "/dashboard/commandes", "/dashboard/notifications"]');
    expect(app).toContain('allowedPaths: ["/courier", "/courier/jobs", "/courier/notifications", "/courier/earnings", "/courier/profile"]');
    expect(app).toContain("if (!policy.allowedPaths.includes(pathname))");
    expect(app).toContain("<Navigate to={policy.home} replace />");
    expect(app).toContain("<CommercialDemoFrameRouteBoundary config={commercialDemoFrame}>");
    expect(app).toContain("const publicNavbar = !commercialDemoFrame && shouldShowPublicNavbar(pathname)");
  });

  it("keeps the courier role virtual and validates every frame through the isolated snapshot RPC", () => {
    expect(frame).toContain("/commercial/demo-live/frame/");
    expect(provider).toContain("roles: auth.roles");
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
    expect(restaurantOrders).toContain('<CommercialDemoActorWorkspace surface="restaurant"');
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

  it("opens Stripe Test in the parent only after strict origin and hostname validation", () => {
    expect(workspace).toContain('type: "commercial-demo:open-checkout"');
    expect(workspace).toContain('url.hostname !== "checkout.stripe.com"');
    expect(experience).toContain("event.origin !== window.location.origin");
    expect(experience).toContain('checkoutUrl.hostname !== "checkout.stripe.com"');
    expect(experience).toContain("confirmCommercialDemoCheckout");
    expect(workspace).toContain("4242 4242 4242 4242");
    expect(experience).toContain("Stripe Test uniquement");
    expect(service).toContain('"commercial-demo-checkout"');
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
  });
});
