import { describe, expect, it } from "vitest";

import {
  getDefaultOpenDayKey,
  groupItemsByDay,
  resolveOpenDayKey,
} from "@/lib/dashboardGrouping";

describe("groupItemsByDay", () => {
  it("groups records by yyyy-mm-dd key in ascending order", () => {
    const grouped = groupItemsByDay(
      [
        { id: "b", dateKey: "2026-04-22" },
        { id: "a", dateKey: "2026-04-21" },
        { id: "c", dateKey: "2026-04-21" },
      ],
      (item) => item.dateKey,
    );

    expect(
      grouped.map((group) => ({
        dateKey: group.dateKey,
        ids: group.items.map((item) => item.id),
      })),
    ).toEqual([
      { dateKey: "2026-04-21", ids: ["a", "c"] },
      { dateKey: "2026-04-22", ids: ["b"] },
    ]);
  });

  it("supports grouping timestamp-based records by a derived day key", () => {
    const grouped = groupItemsByDay(
      [
        { id: "o1", created_at: "2026-04-21T09:00:00.000Z" },
        { id: "o2", created_at: "2026-04-21T18:30:00.000Z" },
        { id: "o3", created_at: "2026-04-22T08:00:00.000Z" },
      ],
      (item) => item.created_at.slice(0, 10),
    );

    expect(grouped.map((group) => [group.dateKey, group.items.length])).toEqual([
      ["2026-04-21", 2],
      ["2026-04-22", 1],
    ]);
  });
});

describe("getDefaultOpenDayKey", () => {
  it("opens the current day when present", () => {
    expect(getDefaultOpenDayKey(["2026-04-20", "2026-04-21", "2026-04-22"], "2026-04-21")).toBe("2026-04-21");
  });

  it("falls back to the first visible day when the current day is absent", () => {
    expect(getDefaultOpenDayKey(["2026-04-22", "2026-04-23"], "2026-04-21")).toBe("2026-04-22");
  });

  it("returns null for an empty list", () => {
    expect(getDefaultOpenDayKey([], "2026-04-21")).toBeNull();
  });
});

describe("resolveOpenDayKey", () => {
  it("keeps the current open key when it is still visible after filtering", () => {
    expect(
      resolveOpenDayKey({
        visibleDateKeys: ["2026-04-21", "2026-04-22"],
        currentDateKey: "2026-04-21",
        previousOpenDayKey: "2026-04-22",
      }),
    ).toBe("2026-04-22");
  });

  it("falls back to current day when the previous open key disappears", () => {
    expect(
      resolveOpenDayKey({
        visibleDateKeys: ["2026-04-21", "2026-04-22"],
        currentDateKey: "2026-04-21",
        previousOpenDayKey: "2026-04-23",
      }),
    ).toBe("2026-04-21");
  });
});
