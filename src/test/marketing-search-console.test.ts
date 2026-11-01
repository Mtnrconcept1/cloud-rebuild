import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSearchSnapshot } from "../marketing/growth/searchConsole";
import { readSearchConsole } from "../../server/marketingSearchConsole";

const period = { property: "sc-domain:thetok.ch", from: "2026-10-23", to: "2026-10-29" };
const day = { site: "thetok.ch", date: period.from, clicks: 2, impressions: 70 };
const query = { site: "thetok.ch", query: "restaurant", clicks: 1, impressions: 12, position: 7.5 };
const sample = { ...period, daily: [day], queries: [query] };
afterEach(() => vi.unstubAllGlobals());
describe("TOK Search Console", () => {
  it("keeps daily totals independent of query coverage and identifies opportunities", () => {
    const report = parseSearchSnapshot(sample);
    expect(report.totals).toEqual({ clicks: 2, impressions: 70 });
    expect(report.observedDays).toBe(1);
    expect(report.opportunities[0]).toMatchObject({ query: "restaurant", position: 7.5 });
    expect(parseSearchSnapshot({ ...sample, daily: [] }).totals).toBeNull();
    expect(parseSearchSnapshot({ ...sample, queries: [{ ...query, position: 1 }] }).opportunities).toEqual([]);
  });
  it.each([
    { daily: [{ ...day, site: "stoppin.ch" }] }, { daily: [{ ...day, date: "2026-11-01" }] },
    { daily: [day,day] }, { daily: [{ ...day, clicks: null }] }, { to: "2026-02-30" },
    { queries: [{ ...query, query: "Uh-oh! These are not your real numbers" }] },
    { queries: [query, query] }, { queries: [{ ...query, position: 0 }] },
  ])("rejects invalid or synthetic rows", delta => {
    expect(() => parseSearchSnapshot({ ...sample, ...delta })).toThrow();
  });
  it("reads the fixed account and the same delayed period for both breakdowns", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const input = new URL(url);
      expect(input.origin).toBe("https://connectors.windsor.ai");
      expect(input.searchParams.get("select_accounts")).toBe(period.property);
      expect(input.searchParams.get("date_from")).toBe(period.from);
      expect(input.searchParams.get("date_to")).toBe(period.to);
      return { ok: true, value: { data: input.searchParams.get("fields")?.includes("query") ? [query] : [day] } };
    });
    expect(await readSearchConsole("fixture", fetcher, new Date("2026-11-01T23:59:00Z"))).toEqual(parseSearchSnapshot(sample));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
