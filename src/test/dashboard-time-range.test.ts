import { describe, expect, it } from "vitest";

import {
  getDashboardTimeRangeBounds,
  isDateInDashboardTimeRange,
} from "@/lib/dashboardTimeRange";

describe("dashboard time range helpers", () => {
  it("computes a monday-based week range", () => {
    const bounds = getDashboardTimeRangeBounds("2026-03-30", "week");

    expect(bounds?.start.getFullYear()).toBe(2026);
    expect(bounds?.start.getMonth()).toBe(2);
    expect(bounds?.start.getDate()).toBe(30);
    expect(bounds?.end.getFullYear()).toBe(2026);
    expect(bounds?.end.getMonth()).toBe(3);
    expect(bounds?.end.getDate()).toBe(6);
  });

  it("matches date-only values against month and year ranges", () => {
    expect(isDateInDashboardTimeRange("2026-03-12", "month", "2026-03-30", { dateOnly: true })).toBe(true);
    expect(isDateInDashboardTimeRange("2026-04-01", "month", "2026-03-30", { dateOnly: true })).toBe(false);
    expect(isDateInDashboardTimeRange("2026-12-31", "year", "2026-03-30", { dateOnly: true })).toBe(true);
    expect(isDateInDashboardTimeRange("2027-01-01", "year", "2026-03-30", { dateOnly: true })).toBe(false);
  });

  it("keeps all values when the range is all", () => {
    expect(isDateInDashboardTimeRange("2024-01-01", "all", "2026-03-30", { dateOnly: true })).toBe(true);
    expect(isDateInDashboardTimeRange("2028-01-01T10:00:00.000Z", "all", "2026-03-30")).toBe(true);
  });
});
