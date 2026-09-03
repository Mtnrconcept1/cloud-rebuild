import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOK_LOGO_SRC,
  GOLDEN_TOK_LOGO_SRC,
  getTokLogoForDate,
  getTokLogoSrcForPath,
  getZurichDateKey,
} from "@/lib/tokLogo";

describe("TOK canonical logo", () => {
  it("always uses public/logotok.png as the default brand source", () => {
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

  it("uses Golden TOK only inside the La Table du Chef route family", () => {
    expect(GOLDEN_TOK_LOGO_SRC).toBe("/Image%20Codex%203%20sept.%202026,%2002_31_12.png");
    expect(getTokLogoSrcForPath("/chefs-table")).toBe(GOLDEN_TOK_LOGO_SRC);
    expect(getTokLogoSrcForPath("/chefs-table/selection")).toBe(GOLDEN_TOK_LOGO_SRC);
    expect(getTokLogoSrcForPath("/")).toBe(DEFAULT_TOK_LOGO_SRC);
    expect(getTokLogoSrcForPath("/recherche")).toBe(DEFAULT_TOK_LOGO_SRC);
    expect(getTokLogoSrcForPath("/zero-attente")).toBe(DEFAULT_TOK_LOGO_SRC);
  });

  it("keeps the Europe/Zurich date key for consumers that display it", () => {
    const beforeZurichMidnight = new Date("2026-06-10T21:59:00.000Z");
    const afterZurichMidnight = new Date("2026-06-10T22:01:00.000Z");

    expect(getZurichDateKey(beforeZurichMidnight)).toBe("2026-06-10");
    expect(getZurichDateKey(afterZurichMidnight)).toBe("2026-06-11");
  });
});
