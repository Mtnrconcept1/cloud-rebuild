import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const scaleMigration = readProjectFile("supabase/migrations/20260607053000_scale_readiness_indexes_and_guards.sql");
const scaleScript = readProjectFile("scripts/scale-readiness-check.mjs");
const packageJson = JSON.parse(readProjectFile("package.json"));

describe("production scale readiness guards", () => {
  it("adds a repeatable scale readiness command", () => {
    expect(packageJson.scripts["scale:readiness"]).toBe("node ./scripts/scale-readiness-check.mjs");
    expect(scaleScript).toContain("TOK scale readiness checks");
    expect(scaleScript).toContain("Stripe Checkout sessions carry reconciliation metadata");
    expect(scaleScript).toContain("Scale readiness indexes and guards migration exists");
  });

  it("indexes the hot order paths used by restaurant dashboards and support", () => {
    expect(scaleMigration).toContain("idx_orders_restaurant_status_created_at");
    expect(scaleMigration).toContain("idx_orders_user_created_at");
    expect(scaleMigration).toContain("idx_orders_checkout_id");
    expect(scaleMigration).toContain("idx_orders_pending_payment_watchdog");
    expect(scaleMigration).toContain("idx_orders_metadata_stripe_session_id");
    expect(scaleMigration).toContain("idx_orders_metadata_checkout_group_id");
  });

  it("indexes and constrains payment reconciliation to avoid duplicate succeeded charges", () => {
    expect(scaleMigration).toContain("idx_payment_transactions_order_status_type");
    expect(scaleMigration).toContain("idx_payment_transactions_stripe_session_charge_succeeded");
    expect(scaleMigration).toContain("idx_payment_transactions_stripe_payment_intent");
    expect(scaleMigration).toContain("ux_payment_transactions_succeeded_charge_session_kind");
    expect(scaleMigration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_succeeded_charge_session_kind");
    expect(scaleMigration).toContain("HAVING COUNT(*) > 1");
    expect(scaleMigration).toContain("Skipping ux_payment_transactions_succeeded_charge_session_kind");
    expect(scaleMigration).toContain("status = 'succeeded'");
    expect(scaleMigration).toContain("type = 'charge'");
  });

  it("keeps reservation, restaurant and webhook diagnostics responsive during spikes", () => {
    expect(scaleMigration).toContain("idx_reservations_restaurant_status_created_at");
    expect(scaleMigration).toContain("idx_reservations_user_created_at");
    expect(scaleMigration).toContain("idx_restaurants_owner_id");
    expect(scaleMigration).toContain("idx_restaurants_active_created_at");
    expect(scaleMigration).toContain("idx_stripe_webhook_events_type_processed_at");
    expect(scaleMigration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
