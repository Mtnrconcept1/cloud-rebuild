import { describe, expect, it } from "vitest";
import {
  buildFloorPlanViewportModel,
  normalizeFloorPlanLayout,
  areFloorPlanLayoutsEquivalent,
  getLogicalFloorPlanPositionFromRenderedFrame,
  getRenderedFloorPlanFrame,
  resizeFloorPlanLayoutToFootprint,
  type FloorPlanRenderedFrame,
  type FloorPlanResizeHandle,
  type FloorPlanTableLayout,
} from "@/lib/floorPlan";
import {
  configureFloorPlanTable,
  restoreFloorPlanConfiguration,
  getFloorPlanSpaceStats,
  groupFloorPlanAssignments,
  reconcileFloorPlanProposal,
  resizeRotatedFloorPlanFrame,
  snapFloorPlanPosition,
  type FloorPlanStudioItem,
} from "@/lib/floorPlanStudio";

function item(
  id: string,
  layout: Partial<FloorPlanTableLayout> = {},
  fields: Partial<Omit<FloorPlanStudioItem, "layout">> = {},
): FloorPlanStudioItem {
  return {
    id,
    table_number: id,
    capacity: 4,
    is_active: true,
    sector: "Salle",
    ...fields,
    layout: {
      x: 120,
      y: 180,
      w: 140,
      h: 100,
      rotation: 0,
      shape: "rect",
      kind: "table",
      seatLabels: [1, 1, 1, 1],
      ...layout,
    },
  };
}

describe("floor-plan studio operations", () => {
  it("moves an existing table from an AI proposal while preserving its identity and operational settings", () => {
    const original = item(
      "persisted-table",
      { tableWidth: 90, tableHeight: 90, seatType: "chair", locked: false },
      { table_number: "Table 01", capacity: 4, is_active: false },
    );
    const proposal = item(
      "temporary-ai-id",
      {
        x: 320,
        y: 260,
        rotation: 90,
        w: 300,
        h: 200,
        shape: "round",
        seatType: "stool",
        tableWidth: 200,
      },
      { table_number: " table 01 ", capacity: 12, is_active: true },
    );
    const originalSnapshot = structuredClone(original);

    const result = reconcileFloorPlanProposal([original], [proposal], "Salle");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ...original,
      layout: { ...original.layout, x: 320, y: 260, rotation: 90 },
    });
    expect(result[0].id).toBe("persisted-table");
    expect(result[0].capacity).toBe(4);
    expect(result[0].is_active).toBe(false);
    expect(original).toEqual(originalSnapshot);
  });

  it("retains locked objects, omitted items, structure and every other sector", () => {
    const locked = item(
      "locked",
      { locked: true, visualVariant: "high-table" },
      { table_number: "T1" },
    );
    const omitted = item("omitted", {}, { table_number: "T2" });
    const structure = item(
      "wall",
      { kind: "divider", visualVariant: "wall" },
      { table_number: "Mur", capacity: 0 },
    );
    const otherRoom = item(
      "terrace-table",
      { x: 460 },
      { table_number: "T1", sector: "Terrasse" },
    );
    const proposal = item(
      "ai-t1",
      { x: 700, y: 500, rotation: 180 },
      { table_number: "T1", capacity: 8 },
    );

    const result = reconcileFloorPlanProposal(
      [locked, omitted, structure, otherRoom],
      [proposal],
      "Salle",
    );

    expect(new Set(result.map((entry) => entry.id))).toEqual(
      new Set(["locked", "omitted", "wall", "terrace-table"]),
    );
    expect(result.find((entry) => entry.id === "locked")).toBe(locked);
    expect(result.find((entry) => entry.id === "omitted")).toBe(omitted);
    expect(result.find((entry) => entry.id === "wall")).toBe(structure);
    expect(result.find((entry) => entry.id === "terrace-table")).toBe(
      otherRoom,
    );
  });

  it("matches duplicated labels once each and keeps furniture separate from reservable tables", () => {
    const first = item("first", {}, { table_number: "T1" });
    const second = item("second", {}, { table_number: "T1" });
    const decoration = item(
      "decoration",
      { kind: "plant" },
      { table_number: "T1", capacity: 0 },
    );
    const proposals = [
      item("ai-first", { x: 220 }, { table_number: "T1" }),
      item("ai-second", { x: 420 }, { table_number: "T1" }),
    ];

    const result = reconcileFloorPlanProposal(
      [first, second, decoration],
      proposals,
      "Salle",
    );

    expect(result).toHaveLength(3);
    expect(result.find((entry) => entry.id === "first")?.layout.x).toBe(220);
    expect(result.find((entry) => entry.id === "second")?.layout.x).toBe(420);
    expect(result.find((entry) => entry.id === "decoration")).toBe(decoration);
  });

  it("adds new proposal items only to the selected sector and leaves omitted tables available", () => {
    const original = item("existing");
    const added = item(
      "ai-new",
      { kind: "plant", visualVariant: "parasol" },
      { capacity: 0, sector: "Autre espace" },
    );

    const result = reconcileFloorPlanProposal([original], [added], "Salle");

    expect(result).toContain(original);
    expect(result.find((entry) => entry.id === "ai-new")).toEqual({
      ...added,
      sector: "Salle",
    });
    expect(added.sector).toBe("Autre espace");
  });

  it("snaps stored coordinates without changing dimensions, rotation or seating", () => {
    const layout = item("table", {
      x: 123.4,
      y: 216.8,
      rotation: 45,
      visualVariant: "high-table",
    }).layout;

    expect(snapFloorPlanPosition(layout, true)).toEqual({
      ...layout,
      x: 120,
      y: 220,
    });
    expect(snapFloorPlanPosition(layout, true, 25)).toEqual({
      ...layout,
      x: 125,
      y: 225,
    });
    expect(layout.x).toBe(123.4);
    expect(layout.y).toBe(216.8);
  });

  it("clamps snapped positions to the logical room bounds, including a boundary between grid steps", () => {
    const layout = item("table", { x: -800, y: 9999, w: 140, h: 100 }).layout;
    const snapped = snapFloorPlanPosition(layout, true);

    expect(snapped.x).toBe(46);
    expect(snapped.y).toBe(614);
    expect(snapped.x + snapped.w).toBeLessThanOrEqual(994);
    expect(snapped.y + snapped.h).toBeLessThanOrEqual(714);
    expect(snapped.w).toBe(140);
    expect(snapped.h).toBe(100);
  });

  it("leaves coordinates untouched when magnetism is disabled or an item is locked", () => {
    const layout = item("table", { x: 123.4, y: 216.8 }).layout;
    const locked = { ...layout, locked: true };

    expect(snapFloorPlanPosition(layout, false)).toBe(layout);
    expect(snapFloorPlanPosition(locked, true)).toBe(locked);
  });

  it("counts available covers from active reservable tables, independently of furniture and hidden items", () => {
    const items = [
      item("active-four"),
      item("active-two", {}, { capacity: 2 }),
      item("hidden-six", {}, { capacity: 6, is_active: false }),
      item("chair", { kind: "chair" }, { capacity: 0 }),
      item(
        "hidden-plant",
        { kind: "plant" },
        { capacity: 0, is_active: false },
      ),
    ];
    expect(getFloorPlanSpaceStats(items)).toEqual({
      tables: 3,
      activeTables: 2,
      covers: 6,
      furniture: 2,
      hidden: 2,
    });
    expect(getFloorPlanSpaceStats([])).toEqual({
      tables: 0,
      activeTables: 0,
      covers: 0,
      furniture: 0,
      hidden: 0,
    });
  });

  it("excludes released reservations and assignments to tables outside the current space", () => {
    const released = [
      "cancelled",
      "canceled",
      "no_show",
      "completed",
      "archived",
    ];
    const reservations = [
      { id: "confirmed", status: "confirmed" },
      { id: "seated", status: "seated" },
      { id: "pending", status: "pending" },
      { id: "outside", status: "confirmed" },
      { id: "unassigned", status: "confirmed" },
      ...released.map((status) => ({
        id: status,
        status: status.toUpperCase(),
      })),
    ];
    const assignments = {
      confirmed: "t1",
      seated: "t1",
      pending: "t2",
      outside: "terrace",
      unassigned: null,
      ...Object.fromEntries(released.map((id) => [id, "t1"])),
    };
    const grouped = groupFloorPlanAssignments(
      reservations,
      assignments,
      new Set(["t1", "t2"]),
    );

    expect([...grouped.keys()]).toEqual(["t1", "t2"]);
    expect(grouped.get("t1")?.map((entry) => entry.id)).toEqual([
      "confirmed",
      "seated",
    ]);
    expect(grouped.get("t2")?.map((entry) => entry.id)).toEqual(["pending"]);
  });

  it("keeps every assignment on a table when the displayed reservation search has fewer results", () => {
    const reservations = [
      { id: "alice", customerName: "Alice", status: "confirmed" },
      { id: "bruno", customerName: "Bruno", status: "seated" },
    ];
    const searchResults = reservations.filter((entry) =>
      entry.customerName.includes("Alice"),
    );
    // Occupancy receives the complete service list; the queue search only
    // determines the rows displayed to the operator.
    const grouped = groupFloorPlanAssignments(
      reservations,
      { alice: "t1", bruno: "t1" },
      new Set(["t1"]),
    );

    expect(searchResults).toHaveLength(1);
    expect(grouped.get("t1")).toEqual(reservations);
  });
});

const HANDLE_POSITIONS: Record<FloorPlanResizeHandle, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};
const OPPOSITE_HANDLES: Record<FloorPlanResizeHandle, FloorPlanResizeHandle> = {
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
  nw: "se",
};

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function handlePoint(
  frame: FloorPlanRenderedFrame,
  handle: FloorPlanResizeHandle,
  rotation: number,
) {
  const [horizontal, vertical] = HANDLE_POSITIONS[handle];
  const offset = rotatePoint(
    (horizontal * frame.w) / 2,
    (vertical * frame.h) / 2,
    rotation,
  );
  return {
    x: frame.x + frame.w / 2 + offset.x,
    y: frame.y + frame.h / 2 + offset.y,
  };
}

describe("rotated floor-plan pointer resizing", () => {
  it.each([0, 45, 90, 270])(
    "follows each handle at %s° and keeps the opposite handle fixed",
    (rotation) => {
      const frame = { x: 200, y: 150, w: 160, h: 100 };
      for (const handle of Object.keys(
        HANDLE_POSITIONS,
      ) as FloorPlanResizeHandle[]) {
        const [horizontal, vertical] = HANDLE_POSITIONS[handle];
        const delta = rotatePoint(horizontal * 40, vertical * 20, rotation);
        const oldDragged = handlePoint(frame, handle, rotation);
        const oldOpposite = handlePoint(
          frame,
          OPPOSITE_HANDLES[handle],
          rotation,
        );
        const resized = resizeRotatedFloorPlanFrame(
          frame,
          handle,
          delta.x,
          delta.y,
          20,
          20,
          rotation,
        );
        const newDragged = handlePoint(resized, handle, rotation);
        const newOpposite = handlePoint(
          resized,
          OPPOSITE_HANDLES[handle],
          rotation,
        );

        expect(resized.w, handle).toBeCloseTo(frame.w + (horizontal ? 40 : 0));
        expect(resized.h, handle).toBeCloseTo(frame.h + (vertical ? 20 : 0));
        expect(newDragged.x, handle).toBeCloseTo(oldDragged.x + delta.x);
        expect(newDragged.y, handle).toBeCloseTo(oldDragged.y + delta.y);
        expect(newOpposite.x, handle).toBeCloseTo(oldOpposite.x);
        expect(newOpposite.y, handle).toBeCloseTo(oldOpposite.y);
      }
      expect(frame).toEqual({ x: 200, y: 150, w: 160, h: 100 });
    },
  );

  it("clamps both local dimensions without flipping the item or moving the fixed corner", () => {
    const frame = { x: 200, y: 150, w: 160, h: 100 };
    const delta = rotatePoint(500, 500, 45);
    const before = handlePoint(frame, "se", 45);
    const resized = resizeRotatedFloorPlanFrame(
      frame,
      "nw",
      delta.x,
      delta.y,
      60,
      40,
      45,
    );
    const after = handlePoint(resized, "se", 45);

    expect(resized.w).toBe(60);
    expect(resized.h).toBe(40);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it.each([0, 45, 90, 270])(
    "keeps round and ratio-locked corners uniform at %s°",
    (rotation) => {
      for (const frame of [
        { x: 200, y: 150, w: 100, h: 100 },
        { x: 200, y: 150, w: 160, h: 100 },
      ]) {
        const delta = rotatePoint(40, 10, rotation);
        const before = handlePoint(frame, "nw", rotation);
        const resized = resizeRotatedFloorPlanFrame(
          frame,
          "se",
          delta.x,
          delta.y,
          20,
          20,
          rotation,
          true,
        );
        const after = handlePoint(resized, "nw", rotation);
        expect(resized.w / resized.h).toBeCloseTo(frame.w / frame.h);
        expect(resized.w).toBeGreaterThan(frame.w);
        expect(after.x).toBeCloseTo(before.x);
        expect(after.y).toBeCloseTo(before.y);
      }

      const frame = { x: 200, y: 150, w: 160, h: 100 };
      const delta = rotatePoint(-500, -500, rotation);
      const resized = resizeRotatedFloorPlanFrame(
        frame,
        "se",
        delta.x,
        delta.y,
        80,
        80,
        rotation,
        true,
      );
      expect(resized.w).toBeCloseTo(128);
      expect(resized.h).toBeCloseTo(80);
    },
  );

  it.each([
    [1040, 760, 0.5],
    [1040, 760, 1],
    [1040, 760, 2],
    [520, 380, 0.5],
    [520, 380, 1],
    [520, 380, 2],
  ])(
    "produces the same logical resize on a %s×%s canvas at zoom %s",
    (canvasWidth, canvasHeight, zoom) => {
      const layout = item("table", {
        x: 200,
        y: 150,
        w: 160,
        h: 100,
        rotation: 90,
      }).layout;
      const frame = getRenderedFloorPlanFrame(
        layout,
        1,
        canvasWidth,
        canvasHeight,
      );
      const fitScale = frame.w / layout.w;
      const start = handlePoint(frame, "e", 90);
      const canvasBounds = { left: -80, top: 120 };
      const clientStart = {
        x: canvasBounds.left + start.x * zoom,
        y: canvasBounds.top + start.y * zoom,
      };
      const clientEnd = {
        x: clientStart.x,
        y: clientStart.y + 30 * fitScale * zoom,
      };
      const canvasStart = {
        x: (clientStart.x - canvasBounds.left) / zoom,
        y: (clientStart.y - canvasBounds.top) / zoom,
      };
      const canvasEnd = {
        x: (clientEnd.x - canvasBounds.left) / zoom,
        y: (clientEnd.y - canvasBounds.top) / zoom,
      };
      const resizedFrame = resizeRotatedFloorPlanFrame(
        frame,
        "e",
        canvasEnd.x - canvasStart.x,
        canvasEnd.y - canvasStart.y,
        fitScale,
        fitScale,
        90,
      );
      const resizedLayout = resizeFloorPlanLayoutToFootprint(
        layout,
        4,
        resizedFrame.w / fitScale,
        resizedFrame.h / fitScale,
      );
      const position = getLogicalFloorPlanPositionFromRenderedFrame(
        resizedLayout,
        resizedFrame.x,
        resizedFrame.y,
        1,
        canvasWidth,
        canvasHeight,
      );

      expect(resizedLayout.w).toBe(190);
      expect(resizedLayout.h).toBe(100);
      expect(position.x).toBeCloseTo(185);
      expect(position.y).toBeCloseTo(165);
      const finalFrame = getRenderedFloorPlanFrame(
        { ...resizedLayout, ...position },
        1,
        canvasWidth,
        canvasHeight,
      );
      expect(handlePoint(finalFrame, "w", 90).x).toBeCloseTo(
        handlePoint(frame, "w", 90).x,
      );
      expect(handlePoint(finalFrame, "w", 90).y).toBeCloseTo(
        handlePoint(frame, "w", 90).y,
      );
    },
  );
});

describe("rotated floor-plan reservation hit targets", () => {
  it.each([0, 45, 90])(
    "accepts points inside a table's visible rectangle at %s°",
    (rotation) => {
      const table = item("rotated", {
        x: 200,
        y: 150,
        w: 160,
        h: 100,
        rotation,
      });
      const viewport = buildFloorPlanViewportModel([table], {
        sector: "Salle",
        zoom: 1,
      });
      const frame = viewport.getRenderedFrame(table);
      const offset = rotatePoint(70, 30, rotation);

      expect(
        viewport.getReservableItemAtPoint(
          frame.x + frame.w / 2 + offset.x,
          frame.y + frame.h / 2 + offset.y,
        )?.id,
      ).toBe(table.id);
      const edge = handlePoint(frame, "se", rotation);
      expect(viewport.getReservableItemAtPoint(edge.x, edge.y)?.id).toBe(
        table.id,
      );
    },
  );

  it.each([
    [0, -90, 0],
    [45, -75, 45],
    [90, -70, 0],
  ])(
    "rejects points outside the rotated table at %s°, even inside its old unrotated bounds",
    (rotation, offsetX, offsetY) => {
      const table = item("rotated", {
        x: 200,
        y: 150,
        w: 160,
        h: 100,
        rotation,
      });
      const viewport = buildFloorPlanViewportModel([table], {
        sector: "Salle",
        zoom: 1,
      });
      const frame = viewport.getRenderedFrame(table);

      expect(
        viewport.getReservableItemAtPoint(
          frame.x + frame.w / 2 + offsetX,
          frame.y + frame.h / 2 + offsetY,
        ),
      ).toBeNull();
    },
  );

  it.each([
    [0, 32, 0],
    [45, 28, -16],
    [90, 25, 0],
  ])(
    "rotates the expanded touch target consistently with the visual at %s°",
    (rotation, outsideX, outsideY) => {
      const table = item("small", { x: 200, y: 150, w: 60, h: 10, rotation });
      const viewport = buildFloorPlanViewportModel([table], {
        sector: "Salle",
        zoom: 1,
      });
      const visual = viewport.reservableHitTargets.visual[0].frame;
      const interactive = viewport.reservableHitTargets.interactive[0].frame;
      const center = { x: visual.x + visual.w / 2, y: visual.y + visual.h / 2 };
      const touchOffset = rotatePoint(25, 15, rotation);

      expect(visual.h).toBe(10);
      expect(interactive.h).toBe(36);
      // Local y=15 is outside the visible half-height of 5, but inside the
      // expanded half-height of 18: this exercises the second hit-test phase.
      expect(
        viewport.getReservableItemAtPoint(
          center.x + touchOffset.x,
          center.y + touchOffset.y,
        )?.id,
      ).toBe(table.id);
      expect(
        viewport.getReservableItemAtPoint(
          center.x + outsideX,
          center.y + outsideY,
        ),
      ).toBeNull();
    },
  );
});

describe("studio configuration persistence", () => {
  it("restores a saved configuration with original IDs and keeps other rooms and locks", () => {
    const original = item(
      "database-id",
      { finish: "oak" },
      { table_number: "T01" },
    );
    const locked = item("locked-id", { locked: true }, { table_number: "T02" });
    const terrace = item("terrace", {}, { sector: "Terrasse" });
    const saved = item(
      "temporary-id",
      { x: 300, finish: "walnut", tableWidth: 120 },
      { table_number: "T01", capacity: 6 },
    );
    const result = restoreFloorPlanConfiguration(
      [original, locked, terrace],
      [saved, item("new-lock", { x: 500 }, { table_number: "T02" })],
    );
    expect(result.find((entry) => entry.id === "database-id")).toMatchObject({
      capacity: 6,
      layout: { x: 300, finish: "walnut", tableWidth: 120 },
    });
    expect(result.find((entry) => entry.id === "locked-id")).toBe(locked);
    expect(result).toContain(terrace);
    expect(result.some((entry) => entry.id === "temporary-id")).toBe(false);
    expect(original.layout.finish).toBe("oak");
  });

  it("normalizes persisted visual variants, finishes and locks without accepting arbitrary values", () => {
    const source = {
      ...item("table").layout,
      visual_variant: "high-table",
      finish: "walnut",
      locked: true,
    };
    const restored = normalizeFloorPlanLayout(source, 0, 4);
    expect(restored).toMatchObject({
      visualVariant: "high-table",
      finish: "walnut",
      locked: true,
    });
    const invalid = normalizeFloorPlanLayout(
      {
        ...source,
        visual_variant: "https://untrusted.invalid/image",
        finish: "url(x)",
        locked: "true",
      },
      0,
      4,
    );
    expect(invalid.visualVariant).toBeUndefined();
    expect(invalid.finish).toBeUndefined();
    expect(invalid.locked).toBeUndefined();
    expect(
      areFloorPlanLayoutsEquivalent(restored, {
        ...restored,
        finish: "natural",
      }),
    ).toBe(false);
    expect(
      areFloorPlanLayoutsEquivalent(restored, { ...restored, locked: false }),
    ).toBe(false);
  });

  it("rebuilds exactly the requested seat count through the table configurator model", () => {
    const result = configureFloorPlanTable(item("table").layout, 5, "square");
    expect(result.capacity).toBe(5);
    expect(result.layout.shape).toBe("rect");
    expect(result.layout.tableWidth).toBe(result.layout.tableHeight);
    expect(
      result.layout.seatPlacements?.reduce(
        (sum, placement) => sum + placement.count,
        0,
      ),
    ).toBe(5);
    expect(configureFloorPlanTable(result.layout, 40).capacity).toBe(32);
    expect(configureFloorPlanTable(result.layout, 0).capacity).toBe(1);
  });
});

describe("configuration identity", () => {
  it("restores a renamed table or room by ID without creating duplicate furniture", () => {
    const current = item(
      "persisted-id",
      { x: 400 },
      { table_number: "Table jardin", sector: "Véranda" },
    );
    const saved = item(
      "persisted-id",
      { x: 120, finish: "walnut" },
      { table_number: "T01", sector: "Salle" },
    );
    const result = restoreFloorPlanConfiguration([current], [saved]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "persisted-id",
      table_number: "T01",
      sector: "Salle",
      layout: { x: 120, finish: "walnut" },
    });
  });
});
