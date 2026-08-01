import { describe, expect, it } from "vitest";

import {
  marketingZurichDateBoundaryToIso,
  marketingZurichDateTimeInput,
  marketingZurichLocalDateTimeToIso,
} from "../marketing/zurichTime";

describe("marketing Europe/Zurich time contracts", () => {
  it("converts winter and summer wall clock values without using browser timezone", () => {
    expect(marketingZurichLocalDateTimeToIso("2026-01-15T10:00")).toBe("2026-01-15T09:00:00.000Z");
    expect(marketingZurichLocalDateTimeToIso("2026-08-01T10:00")).toBe("2026-08-01T08:00:00.000Z");
    expect(marketingZurichDateTimeInput("2026-08-01T08:00:00.000Z")).toBe("2026-08-01T10:00");
  });

  it("rejects a nonexistent spring-forward time", () => {
    expect(marketingZurichLocalDateTimeToIso("2026-03-29T02:30")).toBeNull();
  });

  it("builds exact Swiss monthly query boundaries", () => {
    expect(marketingZurichDateBoundaryToIso("2026-08-01", "start")).toBe("2026-07-31T22:00:00.000Z");
    expect(marketingZurichDateBoundaryToIso("2026-08-31", "end")).toBe("2026-08-31T21:59:59.999Z");
  });
});
