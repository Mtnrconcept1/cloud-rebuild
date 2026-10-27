import { describe, expect, it } from "vitest";
import { parseMarketingSocialSeriesCsv } from "@/components/marketing/MarketingSocialSeriesImport";

const header = "\uFEFFnuméro,date,heure Europe/Zurich,canal,visuel,titre,légende,statut\r\n";

describe("social series CSV", () => {
  it("parses the 20-image TOK planning with quoted commas and Zurich dates", () => {
    const rows = parseMarketingSocialSeriesCsv(header
      + '1,2026-10-27,11:30,Instagram,TOK_01.png,"5 CHF, par table","Un tarif, des tables. #TOK",Brouillon\r\n'
      + '2,2026-10-27,18:30,Instagram,TOK_02.png,Le chef,"Bonjour ""TOK"", et bienvenue",Brouillon\r\n');
    expect(rows).toEqual([
      { filename: "TOK_01.png", title: "5 CHF, par table", caption: "Un tarif, des tables. #TOK",
        channel: "instagram", scheduledAt: "2026-10-27T10:30:00.000Z" },
      { filename: "TOK_02.png", title: "Le chef", caption: 'Bonjour "TOK", et bienvenue',
        channel: "instagram", scheduledAt: "2026-10-27T17:30:00.000Z" },
    ]);
  });
  it.each([
    ["duplicate image", header + "1,2026-10-27,11:30,Instagram,A.png,A,A,draft\n2,2026-10-27,18:30,Instagram,a.png,B,B,draft"],
    ["unsupported channel", header + "1,2026-10-27,11:30,Email,A.png,A,A,draft"],
    ["missing Zurich hour", header + "1,2026-03-29,02:30,Instagram,A.png,A,A,draft"],
    ["malformed quotation", header + '1,2026-10-27,11:30,Instagram,A.png,"A,A,draft'],
    ["unsafe filename", header + "1,2026-10-27,11:30,Instagram,../A.png,A,A,draft"],
  ])("rejects %s before creating any drafts", (_label, csv) => {
    expect(() => parseMarketingSocialSeriesCsv(csv)).toThrow();
  });
});
