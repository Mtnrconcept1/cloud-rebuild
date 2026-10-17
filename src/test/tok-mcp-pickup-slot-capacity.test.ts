import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVerifiedPickupScheduledAt } from "../../supabase/functions/_shared/order-pickup-scheduling.ts";

describe("TOK scheduled takeaway vs order capacity", () => {
  it("persists the real Zurich dinner slot instead of the creation time", () => {
    const scheduledAt = resolveVerifiedPickupScheduledAt(
      { pickup_date: "2026-10-18", pickup_time: "19:00" },
      "2026-10-18T17:00:00.000Z",
    );
    expect(scheduledAt).toBe("2026-10-18T17:00:00.000Z");
    expect(scheduledAt).not.toBe("2026-10-17T04:51:14.177Z");
  });

  it("handles Swiss winter time rather than assuming an unconditional UTC offset", () => {
    expect(resolveVerifiedPickupScheduledAt(
      { pickup_date: "2026-11-01", pickup_time: "19:00" },
      "2026-11-01T18:00:00Z",
    )).toBe("2026-11-01T18:00:00.000Z");
  });

  it("does not change immediate takeaway without an explicit pickup slot", () => {
    expect(resolveVerifiedPickupScheduledAt({}, "2026-10-17T04:51:14Z")).toBeNull();
  });

  it("rejects a missing date or missing time instead of using the current time", () => {
    expect(() => resolveVerifiedPickupScheduledAt(
      { pickup_date: "2026-10-18" }, "2026-10-18T17:00:00Z",
    )).toThrow("TOK_PICKUP_SLOT_INVALID");
    expect(() => resolveVerifiedPickupScheduledAt(
      { pickup_time: "19:00" }, "2026-10-18T17:00:00Z",
    )).toThrow("TOK_PICKUP_SLOT_INVALID");
  });

  it("rejects forged metadata that differs from the server-checked slot", () => {
    for (const data of [
      { pickup_date: "2026-10-17", pickup_time: "19:00" },
      { pickup_date: "2026-10-18", pickup_time: "20:00" },
    ]) {
      expect(() => resolveVerifiedPickupScheduledAt(data, "2026-10-18T17:00:00Z"))
        .toThrow("TOK_PICKUP_CAPACITY_SLOT_MISMATCH");
    }
  });

  it("rejects invalid pickup dates and clock values", () => {
    for (const data of [
      { pickup_date: "tomorrow", pickup_time: "19:00" },
      { pickup_date: "2026-10-18", pickup_time: "25:00" },
      { pickup_date: "2026-10-18", pickup_time: "19:61" },
    ]) {
      expect(() => resolveVerifiedPickupScheduledAt(data, "2026-10-18T17:00:00Z"))
        .toThrow("TOK_PICKUP_SLOT_INVALID");
    }
  });

  it("rejects unusable server timestamps rather than deriving a new slot", () => {
    expect(() => resolveVerifiedPickupScheduledAt(
      { pickup_date: "2026-10-18", pickup_time: "19:00" }, "not-a-date",
    )).toThrow("TOK_PICKUP_CAPACITY_TIMESTAMP_INVALID");
  });

  it("rejects a nonexistent spring-forward Zurich hour", () => {
    expect(() => resolveVerifiedPickupScheduledAt(
      { pickup_date: "2027-03-28", pickup_time: "02:30" },
      "2027-03-28T01:30:00Z",
    )).toThrow("TOK_PICKUP_CAPACITY_SLOT_MISMATCH");
  });

  it("keeps the database trigger and initial order capacity check on one verified instant", () => {
    const source = readFileSync(resolve(
      process.cwd(), "supabase/functions/validate-order/index.ts",
    ), "utf8");
    expect(source).toContain("const capacityRequestedAt = resolveCapacityRequestedAt(");
    expect(source).toContain("resolveVerifiedPickupScheduledAt(");
    expect(source).toContain("requestedAt: capacityRequestedAt");
    expect(source).toContain("scheduled_at: scheduledOrderAt");
    expect(source).toContain('new HttpError(409, "tok_pickup_slot_conflict_requote")');
    expect(source).not.toContain("scheduled_at: scheduledDelivery?.scheduledAt || null,");
  });

  it("reports a non-empty public error and server-only diagnostic when order updates fail", () => {
    const source = readFileSync(resolve(
      process.cwd(), "supabase/functions/validate-order/index.ts",
    ), "utf8");
    expect(source).toContain("validate_order_pending_payment_update_failed");
    expect(source).toContain('new HttpError(503, "tok_order_pending_payment_update_failed")');
    expect(source).not.toContain("throw new HttpError(500, updateError.message)");
  });
});
