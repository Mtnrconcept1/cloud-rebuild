import { describe, expect, it } from "vitest";

import { summarizeDispatchHealth } from "@/lib/dispatchHealth";

describe("dispatch health", () => {
  it("flags stale searching jobs", () => {
    expect(summarizeDispatchHealth([
      { id: "job-1", status: "searching", created_at: "2026-05-25T10:00:00.000Z" },
    ], new Date("2026-05-25T10:12:00.000Z"))).toEqual({
      searchingOverTenMinutes: 1,
      activeWithoutCourier: 0,
      healthy: false,
      affectedIds: ["job-1"],
    });
  });

  it("flags active jobs without a courier", () => {
    expect(summarizeDispatchHealth([
      { id: "job-1", status: "assigned", created_at: "2026-05-25T10:00:00.000Z", courier_id: null },
      { id: "job-2", status: "delivered", created_at: "2026-05-25T10:00:00.000Z", courier_id: null },
    ], new Date("2026-05-25T10:05:00.000Z"))).toMatchObject({
      searchingOverTenMinutes: 0,
      activeWithoutCourier: 1,
      affectedIds: ["job-1"],
      healthy: false,
    });
  });
});
