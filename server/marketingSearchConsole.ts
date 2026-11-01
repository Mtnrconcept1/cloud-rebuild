import { parseSearchSnapshot, TOK_SEARCH_PROPERTY } from "../src/marketing/growth/searchConsole.js";

type ReadJson = (url: string, options: RequestInit, timeout: number, maxBytes: number) => Promise<{ ok: boolean; value: unknown }>;
export async function readSearchConsole(key: string, readJson: ReadJson, now = new Date()) {
  const dateAt = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const from = dateAt(9), to = dateAt(3);
  const read = async (fields: string, limit: number, start=from, end=to) => {
    const url = new URL("https://connectors.windsor.ai/searchconsole");
    url.search = new URLSearchParams({ api_key: key, select_accounts: TOK_SEARCH_PROPERTY, fields,
      date_from: start, date_to: end, _renderer: "json", _max_rows: String(limit) }).toString();
    const response = await readJson(url.href, { cache: "no-store" }, 10000, 3_000_000);
    if (!response.ok) throw new Error("windsor_unavailable");
    const result = response.value;
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object" && "data" in result && Array.isArray(result.data)) return result.data;
    throw new Error("windsor_invalid_response");
  };
  const [daily, queries, previousDaily, pages] = await Promise.all([
    read("site,date,clicks,impressions", 7), read("site,query,clicks,impressions,position", 5000),
    read("site,date,clicks,impressions",7,dateAt(16),dateAt(10)).catch(() => undefined),
    read("site,page,clicks,impressions",5000).catch(() => undefined),
  ]);
  return parseSearchSnapshot({ property: TOK_SEARCH_PROPERTY, from, to, daily, queries, previousDaily, pages });
}
