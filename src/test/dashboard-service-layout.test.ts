import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardService.tsx"), "utf8");

describe("restaurant service dashboard layout", () => {
  it("uses content-width grids instead of viewport-only columns", () => {
    expect(service).toContain("[grid-template-columns:repeat(auto-fit,minmax(min(26rem,100%),1fr))]");
    expect(service).toContain("[grid-template-columns:repeat(auto-fit,minmax(min(20rem,100%),1fr))]");
    expect(service).toContain("grid items-start gap-4");
    expect(service).toContain("min-[420px]:grid-cols-2");
    expect(service).not.toContain('className="grid gap-4 lg:grid-cols-2"');
  });

  it("keeps daily controls visible and folds secondary settings", () => {
    expect(service).toContain("<Collapsible");
    expect(service).toContain("Réglages avancés");

    for (const field of [
      "start_time",
      "end_time",
      "last_reservation_time",
      "max_covers",
      "order_start_time",
      "order_end_time",
      "online_booking_enabled",
      "online_ordering_enabled",
      "orders_closed",
      "service_closed",
    ]) {
      expect(service, field + " should remain in the condensed form").toContain('"' + field + '"');
    }

    for (const advancedField of [
      "min_party_size",
      "max_party_size",
      "slot_interval_minutes",
      "max_tables_per_slot",
      "slot_capacity_windows",
      "restaurant_confirmation_required",
      "confirmation_deadline_minutes",
      "deposit_amount_chf",
      "service_note",
    ]) {
      expect(service, advancedField + " should remain editable").toContain(advancedField);
    }
  });

  it("uses the compact illustrated hero and a non-sticky save action", () => {
    expect(service).toContain("compact");
    expect(service).toContain("DASHBOARD_ILLUSTRATIONS.restaurantService");
    expect(service).toContain('className="flex justify-end"');
    expect(service).not.toContain("sticky");
  });

  it("associates compact form labels with deterministic input ids", () => {
    expect(service).toContain('const fieldId = (field: string) => "service-" + period.key + "-" + field');
    expect(service).toContain('htmlFor={fieldId("start-time")}');
    expect(service).toContain('id={fieldId("start-time")}');
    expect(service).toContain('htmlFor="service-delivery-fee"');
    expect(service).toContain('id="service-minimum-order"');
  });

  it("keeps error, loading and globally-disabled delivery states honest", () => {
    expect(service).toContain('role="alert"');
    expect(service).toContain('role="status"');
    expect(service).toContain("deliveryEnabled && deliveryAvailable");
    expect(service).toContain("refetchRestaurant");
  });
});
