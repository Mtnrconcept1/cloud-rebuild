import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial multi-space delivery demonstration", () => {
  const app = read("src/App.tsx");
  const page = read("src/pages/CommercialDemoLive.tsx");
  const chrome = read("src/components/commercial/CommercialWorkspaceChrome.tsx");
  const experience = read("src/components/commercial/CommercialMultiSpaceDemo.tsx");
  const service = read("src/lib/commercialDemoJourney.ts");

  it("exposes the feature from the protected commercial workspace", () => {
    expect(app).toContain('const CommercialDemoLive = lazy(() => import("./pages/CommercialDemoLive"))');
    expect(app).toContain('path="/commercial/demo-live"');
    expect(app).toContain('requiredRoles={["admin", "commercial"]}');
    expect(chrome).toContain('to: "/commercial/demo-live"');
    expect(chrome).toContain("Démo multi-espace");
  });

  it("shows three responsive facsimiles without granting courier access or embedding live dashboards", () => {
    expect(experience).toContain('data-demo-surface={surface}');
    expect(experience).toContain('surface="client"');
    expect(experience).toContain('surface="restaurant"');
    expect(experience).toContain('surface="courier"');
    expect(experience).toContain("xl:grid-cols-3");
    expect(page).toContain("overflow-x-hidden");
    expect(experience).not.toContain("<iframe");
    expect(experience).not.toContain('requiredRole="courier"');
    expect(experience).not.toContain("user_roles");
  });

  it("uses the isolated server session as the only journey source of truth", () => {
    for (const rpc of [
      "commercial_demo_create_session",
      "commercial_demo_create_order",
      "commercial_demo_get_snapshot",
      "commercial_demo_transition",
      "commercial_demo_reset_session",
    ]) {
      expect(service).toContain(rpc);
    }
    expect(service).toContain("invokeSupabaseRpc<T | T[]>");
    expect(service).toContain("commercial_demo_orders");
    expect(service).toContain("commercial_demo_delivery_missions");
    expect(service).toContain("commercial_demo_order_events");
    expect(service).not.toContain("localStorage");
    expect(service).not.toContain("sessionStorage");
    expect(experience).not.toContain("setOrder(");
    expect(experience).not.toContain("setMission(");
    expect(experience).toContain('action === "reset" && nextSessionId !== effectiveSessionId');
    expect(experience).toContain("updateDemoSessionUrl(nextSessionId)");
  });

  it("connects only to the dedicated Stripe Test edge and confirms payment server-side", () => {
    expect(service).toContain('invokeSupabaseFunction<CommercialDemoCheckoutCreateResult>("commercial-demo-checkout"');
    expect(service).toContain('invokeSupabaseFunction<CommercialDemoCheckoutConfirmResult>("commercial-demo-checkout"');
    expect(service).not.toContain(".functions.invoke");
    expect(service).toContain('action: "create"');
    expect(service).toContain('action: "confirm"');
    expect(service).toContain('record.mode !== "test"');
    expect(service).not.toContain('invokeSupabaseFunction("create-checkout"');
    expect(service).not.toContain("confirm_test_payment");
    expect(experience).toContain("Stripe Test uniquement");
    expect(experience).toContain("STRIPE_SECRET_KEY_TEST");
    expect(experience).toContain("DEMO_STRIPE_NOT_CONFIGURED");
    expect(experience).toContain('params.get("demo_checkout") === "success"');
    expect(experience).toContain('params.get("stripe_session_id")');
  });

  it("covers the restaurant and delivery transitions in the presentation flow", () => {
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
      expect(experience).toContain(action);
      expect(service).toContain(action);
    }
    expect(experience).toContain("allowed_actions.includes(action)");
    expect(experience).toContain("Interactions en temps réel");
  });
});
