import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dialog = readFileSync(resolve(process.cwd(), "src/components/ReservationDialog.tsx"), "utf8");
const server = readFileSync(resolve(process.cwd(), "supabase/functions/create-reservation/index.ts"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardReservations.tsx"), "utf8");

describe("table-only service reservations", () => {
  it("skips meal offers and preorders when drinks-only is configured", () => {
    expect(dialog).toContain('tableOnlyBooking ? ["datetime", "confirm"]');
    expect(dialog).toContain('!tableOnlyBooking && selectedPromo?.kind === "formula"');
    expect(dialog).toContain('!tableOnlyBooking && selectedPromo?.kind === "progressive"');
    expect(dialog).toContain('setStep(tableOnlyBooking ? "datetime" : "promo")');
  });
  it("enforces server-owned settings instead of trusting client metadata", () => {
    expect(server).toContain('.select("opening_hours")');
    expect(server).toContain('settings.table_only_booking === true');
    expect(server).toContain('requestedFeature !== "classique"');
    expect(server).toContain('progressiveOfferId !== null');
    expect(server).toContain('metadata.reservation_purpose = tableOnlyBooking ? "drinks" : "dining"');
  });
  it("labels bar bookings visibly in the restaurant dashboard", () => {
    expect(dashboard).toContain('metadata.reservation_purpose === "drinks"');
    expect(dashboard).toContain("Table sans restauration");
  });
});
