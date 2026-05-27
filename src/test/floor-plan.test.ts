import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildDraftFloorPlanLayout,
  buildSeatLabels,
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getMinimumTableSize,
  getLogicalFloorPlanPositionFromRenderedFrame,
  getRenderedFloorPlanFrame,
  getResolvedFloorPlanDimensions,
  isReservableFloorPlanItem,
  reservationsOverlap,
  resizeFloorPlanLayoutToFootprint,
  resizeRenderedFloorPlanFrame,
} from "@/lib/floorPlan";
import { getFloorPlanHealthSummary } from "@/lib/floorPlanHealth";
import DynamicTableSvg from "@/components/floor-plan/DynamicTableSvg";

function getRenderedImageAttributes(markup: string) {
  return Array.from(markup.matchAll(/<image\b([^>]*)>/g)).map((match) => {
    const attributes = match[1];
    const getNumber = (name: string) => {
      const value = attributes.match(new RegExp(`${name}="([^"]+)"`))?.[1];
      return value == null ? null : Number(value);
    };

    return {
      href: attributes.match(/href="([^"]+)"/)?.[1] || "",
      x: getNumber("x"),
      y: getNumber("y"),
      width: getNumber("width"),
      height: getNumber("height"),
    };
  });
}

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
      { x: 40, y: 40, w: 120, h: 120, rotation: 0, shape: "rect", seatLabels: [1, 1], kind: "table" },
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

  it("keeps furniture resize free on each axis like an image", () => {
    const plant = ensureFloorPlanLayoutFitsCapacity(
      { x: 40, y: 40, w: 144, h: 108, rotation: 0, shape: "round", seatLabels: [], kind: "plant" },
      0,
      "round",
      "plant",
    );
    const divider = ensureFloorPlanLayoutFitsCapacity(
      { x: 40, y: 40, w: 320, h: 120, rotation: 0, shape: "rect", seatLabels: [], kind: "divider" },
      0,
      "rect",
      "divider",
    );
    const serviceStation = getResolvedFloorPlanDimensions({
      capacity: 0,
      kind: "service-station",
      shape: "rect",
      footprintWidth: 260,
      footprintHeight: 120,
    });

    expect(plant.w).toBe(144);
    expect(plant.h).toBe(108);
    expect(divider.w).toBe(320);
    expect(divider.h).toBe(120);
    expect(serviceStation.footprintWidth).toBe(260);
    expect(serviceStation.footprintHeight).toBe(120);
  });

  it("resizes rendered frames by axis and keeps corner handles proportional", () => {
    const frame = { x: 100, y: 80, w: 200, h: 100 };

    expect(resizeRenderedFloorPlanFrame(frame, "e", 60, 75, 80, 60)).toEqual({
      x: 100,
      y: 80,
      w: 260,
      h: 100,
    });
    expect(resizeRenderedFloorPlanFrame(frame, "s", 60, 75, 80, 60)).toEqual({
      x: 100,
      y: 80,
      w: 200,
      h: 175,
    });
    expect(resizeRenderedFloorPlanFrame(frame, "nw", -40, 0, 80, 60)).toEqual({
      x: 60,
      y: 60,
      w: 240,
      h: 120,
    });
  });

  it("resizes table footprints without recalculating the inner drawing", () => {
    const layout = ensureFloorPlanLayoutFitsCapacity(
      { x: 40, y: 40, w: 176, h: 112, rotation: 0, shape: "rect", seatLabels: [1, 1, 1, 1], kind: "table" },
      4,
      "rect",
    );
    const before = getResolvedFloorPlanDimensions({
      capacity: 4,
      shape: layout.shape,
      kind: layout.kind,
      seatPlacements: layout.seatPlacements,
      tableWidth: layout.tableWidth,
      tableHeight: layout.tableHeight,
      footprintWidth: layout.w,
      footprintHeight: layout.h,
    });

    const resized = resizeFloorPlanLayoutToFootprint(layout, 4, layout.w * 2, layout.h, "rect", "table");

    expect(resized.w).toBe(layout.w * 2);
    expect(resized.h).toBe(layout.h);
    expect(resized.tableWidth).toBe(before.tableWidth);
    expect(resized.tableHeight).toBe(before.tableHeight);
  });

  it("round-trips rendered canvas frames back to logical positions at zoom", () => {
    const layout = {
      x: 320,
      y: 180,
      w: 176,
      h: 112,
      rotation: 0,
      shape: "rect" as const,
      kind: "table" as const,
      seatLabels: [1, 1, 1, 1],
    };
    const frame = getRenderedFloorPlanFrame(layout, 1.35, 1280, 680);
    const logical = getLogicalFloorPlanPositionFromRenderedFrame(
      layout,
      frame.x,
      frame.y,
      1.35,
      1280,
      680,
    );

    expect(logical.x).toBeCloseTo(layout.x, 5);
    expect(logical.y).toBeCloseTo(layout.y, 5);
    expect(frame.w).toBeCloseTo(layout.w * 1.35, 5);
    expect(frame.h).toBeCloseTo(layout.h * 1.35, 5);
  });

  it("clamps rendered canvas frames before converting them to logical positions", () => {
    const layout = {
      x: 40,
      y: 40,
      w: 176,
      h: 112,
      rotation: 0,
      shape: "rect" as const,
      kind: "table" as const,
      seatLabels: [1, 1, 1, 1],
    };

    expect(getLogicalFloorPlanPositionFromRenderedFrame(layout, -999, -999, 1.25, 1040, 680)).toEqual({
      x: 16,
      y: 16,
    });

    const bottomRight = getLogicalFloorPlanPositionFromRenderedFrame(layout, 99999, 99999, 1.25, 1040, 680);
    expect(bottomRight.x).toBeCloseTo(1040 - layout.w - 16, 5);
    expect(bottomRight.y).toBeCloseTo(680 - layout.h - 16, 5);
  });

  it("derives corner bench capacity from horizontal and vertical seat counts", () => {
    const twoSeatCorner = getResolvedFloorPlanDimensions({
      capacity: 2,
      shape: "rect",
      seatPlacements: [],
      cornerBenchConfigs: [{
        corner: "top-left",
        horizontalSeats: 1,
        verticalSeats: 1,
      } as never],
    });
    const fiveSeatCorner = getResolvedFloorPlanDimensions({
      capacity: 2,
      shape: "rect",
      seatPlacements: [],
      cornerBenchConfigs: [{
        corner: "top-left",
        horizontalSeats: 3,
        verticalSeats: 2,
      } as never],
    });

    expect(twoSeatCorner.capacity).toBe(2);
    expect(twoSeatCorner.cornerBenchConfigs[0]).toMatchObject({
      horizontalSeats: 1,
      verticalSeats: 1,
    });
    expect(fiveSeatCorner.capacity).toBe(5);
    expect(fiveSeatCorner.cornerBenchConfigs[0]).toMatchObject({
      horizontalSeats: 3,
      verticalSeats: 2,
    });
    expect(fiveSeatCorner.cornerBenchConfigs[0].horizontal).toBeGreaterThan(twoSeatCorner.cornerBenchConfigs[0].horizontal);
    expect(fiveSeatCorner.cornerBenchConfigs[0].vertical).toBeGreaterThan(twoSeatCorner.cornerBenchConfigs[0].vertical);
  });

  it("renders corner bench seats below the table image with the same height as the corner", () => {
    const markup = renderToStaticMarkup(createElement(DynamicTableSvg, {
      shape: "rect",
      capacity: 4,
      seatType: "corner-bench",
      seatPlacements: [],
      cornerBenchConfigs: [{
        corner: "top-left",
        horizontal: 144,
        vertical: 86,
        depth: 56,
        horizontalSeats: 2,
        verticalSeats: 2,
      }],
    }));
    const images = getRenderedImageAttributes(markup);
    const tableIndex = images.findIndex((image) => image.href.includes("plan-de-salle_0014_Calque-12.png"));
    const cornerIndex = images.findIndex((image) => image.href.includes("plan-de-salle_0009_Calque-10.png"));
    const straightSeatIndices = images
      .map((image, index) => image.href.includes("plan-de-salle_0010_Calque-11.png") ? index : -1)
      .filter((index) => index >= 0);
    const straightSeatImages = images.filter((image) => image.href.includes("plan-de-salle_0010_Calque-11.png"));
    const horizontalSeatImage = straightSeatImages[0];
    const cornerImage = images[cornerIndex];

    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(cornerIndex).toBeGreaterThanOrEqual(0);
    expect(cornerIndex).toBeLessThan(tableIndex);
    expect(cornerImage.href).toContain("plan-de-salle_0009_Calque-10.png");
    expect(straightSeatImages).toHaveLength(2);
    straightSeatIndices.forEach((straightSeatIndex) => {
      expect(straightSeatIndex).toBeLessThan(tableIndex);
    });
    straightSeatImages.forEach((straightSeatImage) => {
      expect(straightSeatImage.height).toBe(cornerImage.height);
    });
    expect(horizontalSeatImage.y).toBe(cornerImage.y);
    expect((horizontalSeatImage.x || 0) + (horizontalSeatImage.width || 0)).toBeCloseTo(cornerImage.x || 0, 5);
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

  it("summarizes floor plan service health for placement issues", () => {
    const summary = getFloorPlanHealthSummary({
      tables: [
        { id: "t1", tableNumber: "T1", capacity: 2, isActive: true, kind: "table" },
        { id: "t2", tableNumber: "T2", capacity: 4, isActive: false, kind: "table" },
        { id: "plant", tableNumber: "Plante", capacity: 0, isActive: true, kind: "plant" },
      ],
      reservations: [
        { id: "r1", partySize: 3, assignedTableId: "t1" },
        { id: "r2", partySize: 2, assignedTableId: "t2" },
        { id: "r3", partySize: 2, assignedTableId: null },
      ],
    });

    expect(summary.status).toBe("critical");
    expect(summary.activeReservableTables).toBe(1);
    expect(summary.totalReservableCapacity).toBe(2);
    expect(summary.overCapacityAssignments).toBe(1);
    expect(summary.invalidAssignments).toBe(1);
    expect(summary.unassignedReservations).toBe(1);
    expect(summary.assignedCovers).toBe(3);
  });

  it("marks the floor plan service ready when all reservations fit active tables", () => {
    const summary = getFloorPlanHealthSummary({
      tables: [
        { id: "t1", tableNumber: "T1", capacity: 2, isActive: true, kind: "table" },
        { id: "t2", tableNumber: "T2", capacity: 4, isActive: true, kind: "table" },
      ],
      reservations: [
        { id: "r1", partySize: 2, assignedTableId: "t1" },
        { id: "r2", partySize: 4, assignedTableId: "t2" },
      ],
    });

    expect(summary.status).toBe("ready");
    expect(summary.headline).toBe("Service pret");
    expect(summary.assignedCovers).toBe(6);
  });
});
