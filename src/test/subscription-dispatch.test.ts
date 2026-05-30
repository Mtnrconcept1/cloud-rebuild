import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("scheduled subscription dispatch notifications", () => {
  it("notifies the client when a scheduled order is dispatched on the day", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase", "functions", "dispatch-timeout", "index.ts"),
      "utf8",
    );

    expect(source).toContain("Votre livraison abonnement demarre");
    expect(source).toContain("dispatch-timeout-scheduled-order");
    expect(source).toContain("url: `/commande/${order.id}`");
  });

  it("starts tracking and dispatch only when the prepared scheduled order is due", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase", "functions", "dispatch-timeout", "index.ts"),
      "utf8",
    );

    expect(source).toContain(".not(\"scheduled_at\", \"is\", null)");
    expect(source).toContain(".in(\"status\", [\"preparing\"])");
    expect(source).toContain("shouldDispatchDeliveryNow(metadata, scheduledAt, now)");
    expect(source).toContain("status: \"preparing\"");
    expect(source).toContain("triggerDispatchOrder");
  });
});
