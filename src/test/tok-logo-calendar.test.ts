import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOK_LOGO_SRC,
  TOK_EVENT_LOGOS,
  getNextZurichDayDelayMs,
  getTokLogoForDate,
  getZurichDateKey,
} from "@/lib/tokLogo";

describe("TOK event logo calendar", () => {
  it("uses the default brand logo outside configured event dates", () => {
    expect(getTokLogoForDate(new Date("2026-06-12T10:00:00+02:00"))).toMatchObject({
      eventName: null,
      src: DEFAULT_TOK_LOGO_SRC,
    });
  });

  it("switches to the event logo for a researched variable-date event", () => {
    expect(getTokLogoForDate(new Date("2026-06-11T08:00:00+02:00"))).toMatchObject({
      eventName: "Coupe du monde de football",
      src: "/event-logos/logotok3.webp",
    });
  });

  it("evaluates dates in the Europe/Zurich calendar day", () => {
    const beforeZurichMidnight = new Date("2026-06-10T21:59:00.000Z");
    const afterZurichMidnight = new Date("2026-06-10T22:01:00.000Z");

    expect(getZurichDateKey(beforeZurichMidnight)).toBe("2026-06-10");
    expect(getZurichDateKey(afterZurichMidnight)).toBe("2026-06-11");
    expect(getTokLogoForDate(afterZurichMidnight).src).toBe("/event-logos/logotok3.webp");
  });

  it("keeps every referenced event logo in the optimized public folder", () => {
    expect(TOK_EVENT_LOGOS).toHaveLength(50);
    for (const logo of TOK_EVENT_LOGOS) {
      expect(logo.src).toMatch(/^\/event-logos\/logotok\d+\.webp$/);
      expect(logo.dates.every((date) => /^202[6-8]-\d{2}-\d{2}$/.test(date))).toBe(true);
    }
  });

  it("schedules the next refresh around the next Zurich midnight", () => {
    const delay = getNextZurichDayDelayMs(new Date("2026-06-11T21:59:30.000Z"));

    expect(delay).toBeGreaterThanOrEqual(29_000);
    expect(delay).toBeLessThanOrEqual(31_000);
  });
});
