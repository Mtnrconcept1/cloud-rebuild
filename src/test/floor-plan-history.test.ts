import { describe, expect, it } from "vitest";

import {
  createFloorPlanHistory,
  pushFloorPlanHistory,
  redoFloorPlanHistory,
  resetFloorPlanHistory,
  undoFloorPlanHistory,
} from "@/lib/floorPlanHistory";

describe("floor plan history", () => {
  it("undoes and redoes immutable floor plan snapshots", () => {
    const first = { tables: ["A"], assignments: { r1: "A" } };
    const second = { tables: ["A", "B"], assignments: { r1: "B" } };
    const third = { tables: ["A", "B", "C"], assignments: { r1: "C" } };

    const history = pushFloorPlanHistory(
      pushFloorPlanHistory(createFloorPlanHistory(first), second),
      third,
    );

    const afterUndo = undoFloorPlanHistory(history);
    expect(afterUndo.present).toEqual(second);
    expect(afterUndo.future).toEqual([third]);

    const afterRedo = redoFloorPlanHistory(afterUndo);
    expect(afterRedo.present).toEqual(third);
    expect(afterRedo.future).toEqual([]);
  });

  it("clears redo history when a new snapshot is pushed after undo", () => {
    const history = pushFloorPlanHistory(
      pushFloorPlanHistory(createFloorPlanHistory("initial"), "second"),
      "third",
    );
    const afterUndo = undoFloorPlanHistory(history);
    const branched = pushFloorPlanHistory(afterUndo, "replacement");

    expect(branched.past).toEqual(["initial", "second"]);
    expect(branched.present).toBe("replacement");
    expect(branched.future).toEqual([]);
  });

  it("skips duplicate snapshots when an equality matcher reports no change", () => {
    const initial = { tables: ["A"], assignments: { r1: "A" } };
    const duplicate = { tables: ["A"], assignments: { r1: "A" } };
    const history = createFloorPlanHistory(initial);
    const next = pushFloorPlanHistory(history, duplicate, {
      isEqual: (current, candidate) => JSON.stringify(current) === JSON.stringify(candidate),
    });

    expect(next).toBe(history);
    expect(next.past).toEqual([]);
    expect(next.present).toBe(initial);
  });

  it("keeps only the configured number of past snapshots", () => {
    const history = [1, 2, 3, 4].reduce(
      (current, value) => pushFloorPlanHistory(current, value, { maxPast: 2 }),
      createFloorPlanHistory(0),
    );

    expect(history.past).toEqual([2, 3]);
    expect(history.present).toBe(4);
  });

  it("resets history around the latest loaded snapshot", () => {
    const dirty = pushFloorPlanHistory(createFloorPlanHistory("loaded"), "changed");
    const reset = resetFloorPlanHistory(dirty, "reloaded");

    expect(reset).toEqual({
      past: [],
      present: "reloaded",
      future: [],
    });
  });
});
