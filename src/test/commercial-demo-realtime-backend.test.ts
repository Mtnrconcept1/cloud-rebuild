import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("isolated commercial demo realtime backend", () => {
  const migration = read(
    "supabase/migrations/20260714232001_commercial_demo_realtime_order_journey.sql",
  );
  const client = read("src/lib/commercialDemoJourney.ts");

  it("keeps the full demo journey outside every production order and finance table", () => {
    for (const table of [
      "commercial_demo_order_sessions",
      "commercial_demo_orders",
      "commercial_demo_delivery_missions",
      "commercial_demo_order_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }

    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.orders\b/);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.payments\b/);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.financial_ledger\b/);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.commercial_commissions\b/);
  });

  it("enforces owner isolation, composite integrity, read-only browser tables and audit immutability", () => {
    expect(migration).toContain("commercial_demo_can_access_user");
    expect(migration).toContain("commercial_demo_orders_session_identity_fk");
    expect(migration).toContain("commercial_demo_missions_order_identity_fk");
    expect(migration).toContain("REVOKE ALL ON TABLE public.commercial_demo_orders");
    expect(migration).toContain("GRANT SELECT ON TABLE public.commercial_demo_orders TO authenticated, service_role");
    expect(migration).toContain("commercial_demo_events_append_only");
    expect(migration).toContain("Commercial demo events are append-only");
  });

  it("derives checkout totals from the server catalogue and only accepts Stripe Test confirmation from service role", () => {
    expect(migration).toContain("commercial_demo_catalog_items");
    expect(migration).toContain("v_catalog_item.unit_amount_cents * v_quantity");
    expect(migration).toContain("IF v_subtotal > 100000 THEN");
    expect(migration).toContain("commercial_demo_get_checkout_order(p_session_id uuid)");
    expect(migration).toContain("commercial_demo_confirm_test_payment");
    expect(migration).toContain("auth.jwt()->>'role'");
    expect(migration).toContain("'^cs_test_[A-Za-z0-9_]{8,240}$'");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.commercial_demo_get_checkout_order(uuid)\n  TO service_role;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)\n  TO service_role;",
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)\n  TO authenticated",
    );
  });

  it("serializes every restaurant and courier state transition with optimistic concurrency", () => {
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
      expect(migration).toContain(`'${action}'`);
      expect(client).toContain(action);
    }
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("p_expected_version IS DISTINCT FROM v_order.version");
    expect(migration).toContain("version = version + 1");
    expect(migration).toContain("allowed_actions");
  });

  it("publishes only the isolated journey tables and resets by archival instead of deletion", () => {
    expect(migration).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_orders",
    );
    expect(migration).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_delivery_missions",
    );
    expect(migration).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_order_events",
    );
    expect(migration).toContain("SET status = 'archived', archived_at = now()");
    expect(migration).not.toContain("DELETE FROM public.commercial_demo_order_sessions");
    expect(migration).not.toContain("DELETE FROM public.commercial_demo_orders");
  });

  it("matches the frontend RPC and Realtime contract", () => {
    for (const rpc of [
      "commercial_demo_create_session",
      "commercial_demo_create_order",
      "commercial_demo_get_snapshot",
      "commercial_demo_transition",
      "commercial_demo_reset_session",
    ]) {
      expect(migration).toContain(rpc);
      expect(client).toContain(rpc);
    }
    expect(client).toContain("commercial_demo_delivery_missions");
    expect(client).toContain("commercial_demo_order_events");
    expect(migration).toContain("'stripe_session_id', v_order.stripe_checkout_session_id");
    expect(migration).toContain("'payment_status', v_order.payment_status");
  });
});
