import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOK_LOGO_SRC,
  getTokLogoForDate,
  getZurichDateKey,
} from "@/lib/tokLogo";

describe("TOK canonical logo", () => {
  it("always uses public/logotok.png as the only brand source", () => {
    for (const date of [
      new Date("2026-01-01T12:00:00+01:00"),
      new Date("2026-06-11T12:00:00+02:00"),
      new Date("2026-12-25T12:00:00+01:00"),
    ]) {
      expect(getTokLogoForDate(date)).toMatchObject({
        eventName: null,
        src: DEFAULT_TOK_LOGO_SRC,
      });
    }

    expect(DEFAULT_TOK_LOGO_SRC).toBe("/logotok.png");
  });

  it("keeps the Europe/Zurich date key for consumers that display it", () => {
    const beforeZurichMidnight = new Date("2026-06-10T21:59:00.000Z");
    const afterZurichMidnight = new Date("2026-06-10T22:01:00.000Z");

    expect(getZurichDateKey(beforeZurichMidnight)).toBe("2026-06-10");
    expect(getZurichDateKey(afterZurichMidnight)).toBe("2026-06-11");
  });
});
