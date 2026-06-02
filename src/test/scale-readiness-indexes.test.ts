import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260602120000_scale_readiness_indexes.sql"),
  "utf8",
);

describe("scale readiness database indexes", () => {
  it("indexes order lookup paths for dashboards and payment reconciliation", () => {
    expect(migration).toContain("idx_orders_restaurant_status_created_at");
    expect(migration).toContain("idx_orders_user_created_at");
    expect(migration).toContain("idx_orders_checkout_id");
    expect(migration).toContain("idx_orders_pending_payment_created_at");
    expect(migration).toContain("idx_orders_metadata_stripe_session_id");
    expect(migration).toContain("idx_orders_metadata_checkout_group_id");
  });

  it("indexes payment reconciliation and prevents duplicate succeeded charges", () => {
    expect(migration).toContain("idx_payment_transactions_order_status_type");
    expect(migration).toContain("idx_payment_transactions_stripe_session_status_type");
    expect(migration).toContain("idx_payment_transactions_stripe_payment_intent");
    expect(migration).toContain("idx_payment_transactions_succeeded_charge_session_kind");
    expect(migration).not.toContain("ux_payment_transactions_succeeded_charge_session_kind");
    expect(migration).toContain("ux_payment_transactions_succeeded_order_charge_session");
    expect(migration).toContain("ON public.payment_transactions (order_id, stripe_checkout_session_id)");
    expect(migration).toContain("ux_payment_transactions_succeeded_reservation_charge_session");
    expect(migration).toContain("(metadata->>'reservation_id')");
    expect(migration).toContain("order_id IS NULL");
    expect(migration).toContain("status = 'succeeded'");
    expect(migration).toContain("type = 'charge'");
  });

  it("indexes reservations, restaurants and webhook diagnostics", () => {
    expect(migration).toContain("idx_reservations_restaurant_status_created_at");
    expect(migration).toContain("idx_reservations_user_created_at");
    expect(migration).toContain("idx_restaurants_owner_id");
    expect(migration).toContain("idx_restaurants_active_created_at");
    expect(migration).toContain("idx_stripe_webhook_events_type_processed_at");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
