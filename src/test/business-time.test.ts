import { describe, expect, it } from "vitest";

import { getBusinessDateKey, parseBusinessDateTime } from "@/lib/businessTime";

describe("Europe/Zurich business time", () => {
  it("utilise UTC+1 en hiver et UTC+2 en été", () => {
    expect(parseBusinessDateTime("2026-01-15", "19:30")?.toISOString()).toBe("2026-01-15T18:30:00.000Z");
    expect(parseBusinessDateTime("2026-07-15", "19:30")?.toISOString()).toBe("2026-07-15T17:30:00.000Z");
  });

  it("calcule la date commerciale même quand UTC est encore la veille", () => {
    expect(getBusinessDateKey(new Date("2026-07-14T22:30:00.000Z"))).toBe("2026-07-15");
  });

  it("rejette les heures inexistantes pendant le passage à l’heure d’été", () => {
    expect(parseBusinessDateTime("2026-03-29", "02:30")).toBeNull();
  });
});
