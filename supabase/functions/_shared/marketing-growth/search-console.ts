export const TOK_SEARCH_PROPERTY = "sc-domain:thetok.ch";

type SearchRow = { query: string; clicks: number; impressions: number; position: number };
export type SearchReport = {
  source?: "stored" | "windsor"; liveStatus?: "windsor_account_limit"; property: string; from: string; to: string; observedDays: number;
  totals: { clicks: number; impressions: number } | null;
  opportunities: SearchRow[];
  comparison: { from:string; to:string; observedDays:number; totals:{clicks:number;impressions:number}|null } | null;
  pages: { page:string; clicks:number; impressions:number }[] | null;
};

function invalid(): never { throw new Error("Export Search Console invalide ou propriété différente de thetok.ch."); }

function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid();
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

function rows(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value.map(item => {
    const row = record(item);
    if (row.site !== "thetok.ch" && row.site !== TOK_SEARCH_PROPERTY) return invalid();
    return { ...row, clicks: count(row.clicks), impressions: count(row.impressions) } as Record<string, unknown> & { clicks: number; impressions: number };
  });
}

function dayOffset(day: string, amount: number) {
  return new Date(Date.parse(day) + amount * 86400000).toISOString().slice(0,10);
}
function periodTotals(input:unknown, from:string, to:string) {
  const daily = rows(input, 31);
  const seen = new Set<string>();
  let clicks = 0, impressions = 0;
  for (const row of daily) {
    const day = date(row.date);
    if (day < from || day > to || seen.has(day)) return invalid();
    seen.add(day); clicks += row.clicks; impressions += row.impressions;
  }
  return { from, to, observedDays:seen.size, totals:daily.length ? {clicks,impressions} : null };
}

/** Daily totals are independent of the limited, privacy-filtered query breakdown. */
export function parseSearchSnapshot(value: unknown): SearchReport {
  const snapshot = record(value);
  const from = date(snapshot.from), to = date(snapshot.to);
  if (snapshot.property !== TOK_SEARCH_PROPERTY || to < from || Date.parse(to) - Date.parse(from) > 30 * 86400000) return invalid();
  const current = periodTotals(snapshot.daily, from, to);
  const days = 1 + (Date.parse(to) - Date.parse(from)) / 86400000;
  const comparison = snapshot.previousDaily === undefined ? null : periodTotals(snapshot.previousDaily,dayOffset(from,-days),dayOffset(from,-1));
  const pages = snapshot.pages === undefined ? null : rows(snapshot.pages, 5000).flatMap(row => {
    if (typeof row.page !== "string") return invalid();
    let url: URL;
    try { url = new URL(row.page); } catch { return invalid(); }
    if (url.origin !== "https://www.thetok.ch" && url.origin !== "https://thetok.ch") return [];
    if (url.username || url.password || url.search || url.hash ||
        !/^\/(?:blog|restaurants?|restaurateurs|recherche)(?:\/|$)/.test(url.pathname)) return [];
    return [{ page:url.href, clicks:row.clicks, impressions:row.impressions }];
  }).sort((a,b)=>b.impressions-a.impressions || a.page.localeCompare(b.page)).slice(0,20);
  const queries = rows(snapshot.queries, 5000);
  const terms = new Set<string>();
  const opportunities = queries.map(row => {
    if (typeof row.query !== "string" || !row.query.trim() || row.query.length > 512 || terms.has(row.query) ||
        /uh-oh!|reads are paused|these are not your real numbers/i.test(row.query) ||
        typeof row.position !== "number" || !Number.isFinite(row.position) || row.position < 1) return invalid();
    terms.add(row.query);
    return { query: row.query, clicks: row.clicks, impressions: row.impressions, position: row.position };
  }).filter(row => row.impressions > 0 && row.position >= 4 && row.position <= 30)
    .sort((a,b) => b.impressions - a.impressions || a.query.localeCompare(b.query, "fr")).slice(0,20);
  return { property:TOK_SEARCH_PROPERTY, ...current, opportunities, comparison, pages };
}
