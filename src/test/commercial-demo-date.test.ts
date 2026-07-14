import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDateKey, getRelativeLocalDateKey } from "../lib/commercialDemoDate";

const previousTimezone = process.env.TZ;

describe("commercial demo local dates", () => {
  beforeAll(() => {
    process.env.TZ = "Europe/Zurich";
  });

  afterAll(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });

  it("keeps the local calendar day around Zurich midnight", () => {
    const localMidnight = new Date(2026, 6, 14, 0, 5);

    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-07-13");
    expect(getLocalDateKey(localMidnight)).toBe("2026-07-14");
    expect(getRelativeLocalDateKey(1, localMidnight)).toBe("2026-07-15");
  });
});
