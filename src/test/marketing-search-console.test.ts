import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSearchSnapshot } from "../marketing/growth/searchConsole";
import { editorialPlan } from "../marketing/growth/editorialPlan";
import { readSearchConsole, WindsorAccountLimit } from "../../supabase/functions/_shared/marketing-growth/windsor";

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
  it("preserves old exports and removes sensitive and non-public URLs from the page breakdown", () => {
    expect(parseSearchSnapshot(sample)).toMatchObject({pages:null,comparison:null});
    const pages=["https://www.thetok.ch/blog","https://www.thetok.ch/admin","https://www.thetok.ch/blog?secret=test","https://different.example/blog"].map(page=>({...day,page}));
    const report=parseSearchSnapshot({...sample,previousDaily:[{...day,date:"2026-10-16"}],pages});
    expect(report.pages?.map(row=>row.page)).toEqual(["https://www.thetok.ch/blog"]);
    expect(report.comparison).toMatchObject({from:"2026-10-16",to:"2026-10-22",observedDays:1});
    expect(()=>parseSearchSnapshot({...sample,previousDaily:[day]})).toThrow();
  });
  it("spaces observed topics on distinct working days and collapses accent variants",()=>{
    const terms=["Genève","geneve","Réservation restaurant"];
    const report=parseSearchSnapshot({...sample,queries:terms.map((term,i)=>({...query,query:term,impressions:30-i}))});
    const plan=editorialPlan(report,"2026-11-01");
    expect(plan.map(row=>row.query)).toEqual(["Genève","Réservation restaurant"]);
    expect(plan[0].date).toBe("2026-11-02");
    expect(new Set(plan.map(row=>row.date)).size).toBe(2);
    expect(editorialPlan(report,"2026-02-30")).toEqual([]);
  });
  it.each([
    { daily: [{ ...day, site: "stoppin.ch" }] }, { daily: [{ ...day, date: "2026-11-01" }] },
    { daily: [day,day] }, { daily: [{ ...day, clicks: null }] }, { to: "2026-02-30" },
    { queries: [{ ...query, query: "Uh-oh! These are not your real numbers" }] },
    { queries: [query, query] }, { queries: [{ ...query, position: 0 }] },
  ])("rejects invalid or synthetic rows", delta => {
    expect(() => parseSearchSnapshot({ ...sample, ...delta })).toThrow();
  });
  it("recognizes a Windsor account quota without turning synthetic zeroes into metrics",async()=>{
    const read=vi.fn(async()=>({ok:true,value:{data:[{site:"Uh-oh! These are not your real numbers: reads are paused because you have 2 accounts connected",date:period.to,clicks:0,impressions:0}]}}));
    await expect(readSearchConsole("fixture",read)).rejects.toBeInstanceOf(WindsorAccountLimit);
  });
  it("reads the fixed account and the same delayed period for both breakdowns", async () => {
    const prior = {...day,date:"2026-10-16"};
    const page = {site:"thetok.ch",page:"https://www.thetok.ch/blog",clicks:1,impressions:8};
    const fetcher = vi.fn(async (url: string) => {
      const input = new URL(url);
      expect(input.origin).toBe("https://connectors.windsor.ai");
      expect(input.searchParams.get("select_accounts")).toBe(period.property);
      const previous = input.searchParams.get("date_from") === "2026-10-16";
      expect(input.searchParams.get("date_from")).toBe(previous ? "2026-10-16" : period.from);
      expect(input.searchParams.get("date_to")).toBe(previous ? "2026-10-22" : period.to);
      const fields = input.searchParams.get("fields")!;
      const data = previous ? [prior] : fields.includes("query") ? [query] : fields.includes("page") ? [page] : [day];
      return { ok: true, value: { data } };
    });
    expect(await readSearchConsole("fixture", fetcher, new Date("2026-11-01T23:59:00Z"))).toEqual(parseSearchSnapshot({...sample,previousDaily:[prior],pages:[page]}));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
