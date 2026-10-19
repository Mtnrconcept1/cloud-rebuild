import { describe, expect, it } from "vitest";
import { mergeFloorPlanAiLayout, restoreFloorPlanVariant } from "@/lib/floorPlanAiMerge";

const table = (id: string, name: string, sector = "Salle", kind = "table", persisted = true) => ({
  id, table_number: name, sector, layout: { kind }, persisted,
});

describe("AI proposals applied to a floor-plan zone", () => {
  it("preserves the other zones and reservations on a table whose identity survives a replacement", () => {
    const result = mergeFloorPlanAiLayout({
      current: [table("t1", "T1"), table("t2", "T2"), table("terrace", "T3", "Terrasse")],
      proposed: [table("new", "T1", "Salle", "table", false)],
      sector: "Salle", mode: "replace", assignments: { alice: "t1", bob: "t2", clara: "terrace" },
    });
    expect(result.tables.map((item) => item.id)).toEqual(["terrace", "t1"]);
    expect(result.tables[1].persisted).toBe(true);
    expect(result.assignments).toEqual({ alice: "t1", bob: null, clara: "terrace" });
  });

  it("keeps elements omitted by an optimization and makes additional names unique", () => {
    const result = mergeFloorPlanAiLayout({
      current: [table("t1", "T1"), table("plant", "Plante", "Salle", "plant"), table("terrace", "T2", "Terrasse")],
      proposed: [table("new1", "T1"), table("new2", "T2")],
      sector: "Salle", mode: "update", assignments: { alice: "t1", bob: "terrace" },
    });
    expect(result.tables.map((item) => item.id)).toEqual(["plant", "terrace", "t1", "new2"]);
    expect(result.tables.at(-1)?.table_number).toBe("T2 (2)");
    expect(result.assignments).toEqual({ alice: "t1", bob: "terrace" });
  });

  it("adds only furniture for a furniture suggestion without replacing existing items", () => {
    const result = mergeFloorPlanAiLayout({
      current: [table("t1", "T1"), table("plant", "Plante", "Salle", "plant")],
      proposed: [table("new-table", "T1"), table("new-plant", "Plante", "Salle", "plant", false)],
      sector: "Salle", mode: "append", assignments: { alice: "t1" },
    });
    expect(result.tables.map((item) => item.id)).toEqual(["t1", "plant", "new-plant"]);
    expect(result.tables.at(-1)?.table_number).toBe("Plante (2)");
    expect(result.assignments.alice).toBe("t1");
  });
});

describe("saved room arrangements", () => {
  it("keeps table IDs and bookings when the same tables move between zones", () => {
    const result = restoreFloorPlanVariant({
      current: [table("t1", "T1"), table("t2", "T2"), table("plant", "Plante", "Salle", "plant")],
      proposed: [table("draft-t1", " t1 ", "Terrasse", "table", false), table("draft-t2", "T2", "Salle", "table", false)],
      assignments: { alice: "t1", bob: "t2", outsideRoom: "other-table" },
    });
    expect(result.tables.map((item) => [item.id, item.persisted, item.sector])).toEqual([
      ["t1", true, "Terrasse"], ["t2", true, "Salle"],
    ]);
    expect(result.assignments).toEqual({ alice: "t1", bob: "t2", outsideRoom: "other-table" });
  });

  it("does not transfer bookings to furniture that happens to reuse a table name", () => {
    const result = restoreFloorPlanVariant({
      current: [table("t1", "T1")],
      proposed: [table("new-plant", "T1", "Salle", "plant", false)],
      assignments: { alice: "t1" },
    });
    expect(result.tables[0].id).toBe("new-plant");
    expect(result.assignments.alice).toBeNull();
  });
});
