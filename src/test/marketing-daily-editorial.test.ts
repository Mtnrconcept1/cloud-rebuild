import { describe, expect, it } from "vitest";
import {
  TOK_MARKETING_BRAND_VERSION,
  TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT,
  TOK_MARKETING_REFERENCES,
  TOK_MARKETING_REVIEW_SAFE_MARGIN_PERCENT,
  buildTokMarketingVisualPrompt,
} from "../../supabase/functions/_shared/marketing-brand";
import {
  TOK_DAILY_EDITORIAL_SUBJECTS,
  TOK_DAILY_VISUAL_FAMILIES,
  buildDailyMarketingBrief,
  normalizeDailyMarketingTitle,
} from "../../supabase/functions/_shared/marketing-daily-editorial";

function dateAfter(days: number, start = "2026-10-19"): string {
  return new Date(Date.parse(`${start}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe("daily TOK editorial rotation", () => {
  it("keeps a stored day's subject and visual family deterministic", () => {
    const brief = buildDailyMarketingBrief("2026-10-19");
    expect(buildDailyMarketingBrief("2026-10-19")).toEqual(brief);
    expect(brief).toMatchObject({
      localDate: "2026-10-19", subjectId: "reservations", visualFamily: "orange-white",
      format: "4:5", requiresChef: false, titleReused: false,
      brandVersion: TOK_MARKETING_BRAND_VERSION,
    });
    expect(brief.expectedTitle).toBe(brief.title);
    expect(brief.referenceIds).toEqual(TOK_MARKETING_REFERENCES.map((reference) => reference.id));
    expect(brief.referenceIds[0]).toBe("instagram-profile");
    const withHistory = buildDailyMarketingBrief("2026-10-19", [brief.title]);
    expect(withHistory.subjectId).toBe(brief.subjectId);
    expect(withHistory.visualFamily).toBe(brief.visualFamily);
    expect(withHistory.title).not.toBe(brief.title);
  });

  it("covers every one of 14 subjects and 9 visual families before repeating a pair", () => {
    const briefs = Array.from({ length: 126 }, (_, index) => buildDailyMarketingBrief(dateAfter(index)));
    expect(new Set(briefs.map((brief) => brief.subjectId)).size).toBe(14);
    expect(new Set(briefs.map((brief) => brief.visualFamily)).size).toBe(9);
    expect(new Set(briefs.map((brief) => `${brief.subjectId}:${brief.visualFamily}`)).size).toBe(126);
    expect(briefs.slice(0, 9).filter((brief) => brief.requiresChef)).toHaveLength(2);
    expect(briefs.filter((brief) => brief.requiresChef)).toHaveLength(28);
  });

  it("continues after the combined rotation and years later without an end date", () => {
    const first = buildDailyMarketingBrief(dateAfter(0));
    const next = buildDailyMarketingBrief(dateAfter(126));
    expect(next.subjectId).toBe(first.subjectId);
    expect(next.visualFamily).toBe(first.visualFamily);
    expect(next.title).not.toBe(first.title);
    expect(next.variationId).not.toBe(first.variationId);
    expect(buildDailyMarketingBrief("2050-12-31").localDate).toBe("2050-12-31");
  });

  it.each(["2026-10-25", "2027-03-28", "2028-02-29", "2026-10-18"])("accepts calendar date %s across DST, leap days and dates before the epoch", (date) => {
    const brief = buildDailyMarketingBrief(date);
    const following = buildDailyMarketingBrief(dateAfter(1, date));
    expect(brief.localDate).toBe(date);
    const familyIndex = TOK_DAILY_VISUAL_FAMILIES.findIndex((family) => family.id === brief.visualFamily);
    expect(following.visualFamily).toBe(TOK_DAILY_VISUAL_FAMILIES[(familyIndex + 1) % 9].id);
    expect(brief.title).toBeTruthy();
  });

  it.each(["", "2026-2-01", "2026-02-30", "2027-02-29", "2026-13-01", "2026-00-01", "2026-10-19T10:00:00Z", "19/10/2026"])("rejects invalid or ambiguous local date %s", (date) => {
    expect(() => buildDailyMarketingBrief(date)).toThrow("marketing_daily_date_invalid");
  });

  it("ignores accents, casing and punctuation when avoiding recent titles", () => {
    expect(normalizeDailyMarketingTitle("  VOS RÉSERVATIONS — BIEN ORGANISÉES !  ")).toBe("vos reservations bien organisees");
    const first = buildDailyMarketingBrief("2026-10-19");
    const history = ["  VOS RESERVATIONS — BIEN ORGANISEES ! "];
    const next = buildDailyMarketingBrief("2026-10-19", history);
    expect(next.title).not.toBe(first.title);
    expect(next.titleReused).toBe(false);
    expect(buildDailyMarketingBrief("2026-10-19", history)).toEqual(next);
    expect(history).toEqual(["  VOS RESERVATIONS — BIEN ORGANISEES ! "]);
  });

  it("uses the least recently seen title transparently when every variant is in history", () => {
    const titles = [...TOK_DAILY_EDITORIAL_SUBJECTS[0].titles];
    const brief = buildDailyMarketingBrief("2026-10-19", titles);
    expect(brief.title).toBe(titles.at(-1));
    expect(brief.titleReused).toBe(true);
    const repeatedHistory = [...titles, titles[0]];
    expect(buildDailyMarketingBrief("2026-10-19", repeatedHistory).title).toBe(titles.at(-1));
  });

  it("avoids repeating a title in the preceding 90 daily posts over two years", () => {
    const history: string[] = [];
    for (let day = 0; day < 730; day++) {
      const recent = history.slice(0, 90);
      const brief = buildDailyMarketingBrief(dateAfter(day), recent);
      expect(brief.titleReused, brief.localDate).toBe(false);
      expect(recent.map(normalizeDailyMarketingTitle), brief.localDate).not.toContain(normalizeDailyMarketingTitle(brief.title));
      history.unshift(brief.title);
    }
  });

  it("uses concise French titles, modest hashtags and no invented prices or outcome claims", () => {
    const titles = TOK_DAILY_EDITORIAL_SUBJECTS.flatMap((subject) => [...subject.titles]);
    expect(new Set(titles.map(normalizeDailyMarketingTitle)).size).toBe(titles.length);
    for (const title of titles) {
      expect(title.trim().split(/\s+/).length, title).toBeGreaterThanOrEqual(4);
      expect(title.trim().split(/\s+/).length, title).toBeLessThanOrEqual(9);
      expect(title).not.toBe(title.toLocaleUpperCase("fr"));
    }
    for (let day = 0; day < 126; day++) {
      const brief = buildDailyMarketingBrief(dateAfter(day));
      expect(brief.caption).toContain("Découvrez TOK sur thetok.ch.");
      expect(brief.caption.match(/#[\p{Letter}]+/gu)).toHaveLength(3);
      expect(brief.caption.length).toBeLessThan(600);
      expect(`${brief.title} ${brief.caption}`).not.toMatch(/\d|CHF|%|gratuit|garanti|doublez|triplez/i);
    }
  });

  it("keeps the exact title and native single-image constraints in every family", () => {
    for (let day = 0; day < 9; day++) {
      const brief = buildDailyMarketingBrief(dateAfter(day));
      const prompt = buildTokMarketingVisualPrompt(brief.visualPrompt);
      expect(prompt).toContain(JSON.stringify(brief.expectedTitle));
      expect(prompt).toContain("Ne jamais reproduire la grille");
      expect(prompt).toContain("Une seule scène, une seule image indépendante");
      expect(prompt).toContain("texte et logo produits nativement");
      expect(prompt).toContain("La légende reste hors de l'image");
      expect(prompt).toContain(`à au moins ${TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT} % de chacun des quatre bords`);
      expect(TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT).toBeGreaterThan(TOK_MARKETING_REVIEW_SAFE_MARGIN_PERCENT);
      expect(brief.visualPrompt.length).toBeLessThan(4000);
      expect(prompt.length).toBeLessThan(8000);
      expect(brief.visualPrompt).toContain(brief.requiresChef ? "Mascotte chef TOK obligatoire" : "Aucune mascotte ni personnage cartoon");
    }
  });
});
