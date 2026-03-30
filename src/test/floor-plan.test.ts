import { describe, expect, it } from "vitest";

import {
  buildDraftFloorPlanLayout,
  buildSeatLabels,
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getMinimumTableSize,
  isReservableFloorPlanItem,
  reservationsOverlap,
} from "@/lib/floorPlan";

describe("floor plan helpers", () => {
  it("builds balanced seat labels for round and rectangular tables", () => {
    expect(buildSeatLabels(4, "round")).toEqual([1, 1, 1, 1]);
    expect(buildSeatLabels(5, "rect")).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("creates layouts inside the canvas and clamps moved tables", () => {
    const layout = buildDraftFloorPlanLayout(2, {
      id: "rect-4",
      label: "4 pers. rectangle",
      category: "table",
      kind: "table",
      capacity: 4,
      shape: "rect",
      w: 160,
      h: 96,
    });

    const clamped = clampFloorPlanLayout(
      { ...layout, x: 9999, y: -30 },
      800,
      600,
    );

    expect(layout.x).toBeGreaterThanOrEqual(24);
    expect(layout.y).toBeGreaterThanOrEqual(24);
    expect(clamped.x).toBeLessThanOrEqual(624);
    expect(clamped.y).toBe(16);
  });

  it("grows minimum table size with capacity and preserves inner seats", () => {
    const smallRound = getMinimumTableSize(2, "round");
    const largeRound = getMinimumTableSize(8, "round");
    const fitted = ensureFloorPlanLayoutFitsCapacity(
      { x: 40, y: 40, w: 120, h: 120, rotation: 0, shape: "rect", seatLabels: [1, 1] },
      10,
      "rect",
    );

    expect(largeRound.w).toBeGreaterThan(smallRound.w);
    expect(largeRound.h).toBeGreaterThan(smallRound.h);
    expect(fitted.w).toBeGreaterThanOrEqual(getMinimumTableSize(10, "rect").w);
    expect(fitted.h).toBeGreaterThanOrEqual(getMinimumTableSize(10, "rect").h);
    expect(fitted.seatLabels.length).toBeGreaterThan(2);
  });

  it("keeps furniture non reservable with zero inner seats", () => {
    const plantLayout = ensureFloorPlanLayoutFitsCapacity(
      { x: 40, y: 40, w: 20, h: 20, rotation: 0, shape: "round", seatLabels: [1], kind: "plant" },
      0,
      "round",
      "plant",
    );

    expect(isReservableFloorPlanItem(plantLayout.kind)).toBe(false);
    expect(plantLayout.seatLabels).toEqual([]);
    expect(plantLayout.w).toBeGreaterThanOrEqual(getMinimumTableSize(0, "round", "plant").w);
    expect(plantLayout.h).toBeGreaterThanOrEqual(getMinimumTableSize(0, "round", "plant").h);
  });

  it("detects overlapping reservations on the same service window", () => {
    expect(reservationsOverlap(
      { id: "a", date: "2026-03-30", time: "19:00", partySize: 2 },
      { id: "b", date: "2026-03-30", time: "20:30", partySize: 4 },
    )).toBe(true);

    expect(reservationsOverlap(
      { id: "a", date: "2026-03-30", time: "19:00", partySize: 2 },
      { id: "b", date: "2026-03-30", time: "21:30", partySize: 4 },
    )).toBe(false);
  });
});
