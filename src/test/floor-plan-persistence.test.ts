import { describe, expect, it } from "vitest";

import {
  buildFloorPlanAssignmentSignature,
  hasFloorPlanAssignmentChanges,
} from "@/lib/floorPlanPersistence";

describe("floor plan persistence", () => {
  const persistedSlots = [
    { reservation_id: "r1", table_id: "t1" },
    { reservation_id: "r2", table_id: "t2" },
  ];

  it("detects assigned, moved, and released reservation changes against persisted slots", () => {
    expect(hasFloorPlanAssignmentChanges({ r1: "t1", r2: "t2" }, persistedSlots)).toBe(false);
    expect(hasFloorPlanAssignmentChanges({ r1: "t3", r2: "t2" }, persistedSlots)).toBe(true);
    expect(hasFloorPlanAssignmentChanges({ r1: "t1", r2: null }, persistedSlots)).toBe(true);
    expect(hasFloorPlanAssignmentChanges({ r1: "t1", r2: "t2", r3: "t4" }, persistedSlots)).toBe(true);
  });

  it("builds a stable assignment signature including releases", () => {
    const left = buildFloorPlanAssignmentSignature({ r2: null, r1: "t1" }, persistedSlots);
    const right = buildFloorPlanAssignmentSignature({ r1: "t1", r2: null }, [...persistedSlots].reverse());

    expect(left).toBe(right);
    expect(left).toContain('"reservationId":"r2"');
    expect(left).toContain('"tableId":null');
  });
});
