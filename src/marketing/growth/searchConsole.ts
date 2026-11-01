export const TOK_SEARCH_PROPERTY = "sc-domain:thetok.ch";

type SearchRow = { query: string; clicks: number; impressions: number; position: number };
export type SearchReport = {
  source?: "stored" | "windsor"; property: string; from: string; to: string; observedDays: number;
  totals: { clicks: number; impressions: number } | null;
  opportunities: SearchRow[];
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

/** Daily totals are independent of the limited, privacy-filtered query breakdown. */
export function parseSearchSnapshot(value: unknown): SearchReport {
  const snapshot = record(value);
  const from = date(snapshot.from), to = date(snapshot.to);
  if (snapshot.property !== TOK_SEARCH_PROPERTY || to < from || Date.parse(to) - Date.parse(from) > 30 * 86400000) return invalid();
  const daily = rows(snapshot.daily, 31);
  const seen = new Set<string>();
  let clicks = 0, impressions = 0;
  for (const row of daily) {
    const day = date(row.date);
    if (day < from || day > to || seen.has(day)) return invalid();
    seen.add(day); clicks += row.clicks; impressions += row.impressions;
  }
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
  return { property: TOK_SEARCH_PROPERTY, from, to, observedDays: seen.size, totals: daily.length ? { clicks, impressions } : null, opportunities };
}
