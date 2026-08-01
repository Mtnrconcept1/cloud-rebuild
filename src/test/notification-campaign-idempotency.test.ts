import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801190000_marketing_operations_center.sql"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);

describe("marketing delivery idempotency", () => {
  it("claims work with bounded leases and skip-locked concurrency", () => {
    expect(migration.match(/FOR UPDATE(?: OF [a-z]+)? SKIP LOCKED/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain("lease_expires_at");
    expect(migration).toContain("attempt_count < i.max_attempts");
  });

  it("deduplicates recipient deliveries and notification rows", () => {
    expect(migration).toContain("marketing_deliveries_item_contact_channel_unique");
    expect(migration).toContain("notification_deliveries_notification_channel_unique");
    expect(migration).toContain("v_delivery.id, v_delivery.user_id, v_item.title");
    expect(migration).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("supports wizard-created in-app items without an injected notification campaign", () => {
    expect(migration).toContain("Provider mappings can only be attached by a dedicated service adapter");
    expect(orchestrator).toContain('"service_materialize_marketing_deliveries"');
    expect(orchestrator).toContain('"service_send_marketing_in_app_delivery"');
    expect(orchestrator).not.toContain("admin_dispatch_notification_campaign");
  });

  it("never regresses provider engagement status", () => {
    expect(migration).toContain("marketing_delivery_status_rank(v_status) > public.marketing_delivery_status_rank(status)");
    expect(migration).toContain("status IN ('bounced','complained','unsubscribed','cancelled') THEN status");
  });
});
