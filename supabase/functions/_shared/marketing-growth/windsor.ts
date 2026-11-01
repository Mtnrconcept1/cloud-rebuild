import { parseSearchSnapshot, TOK_SEARCH_PROPERTY } from "./search-console.ts";

type ReadJson = (url: string, options: RequestInit, timeout: number, maxBytes: number) => Promise<{ ok: boolean; value: unknown }>;
const readProviderJson: ReadJson = async (url, options, timeout, limit) => {
  const response = await fetch(url,{ ...options, redirect:"error", signal:AbortSignal.timeout(timeout) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("windsor_unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text="", size=0;
  try {
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>limit) { await reader.cancel(); throw new Error("windsor_response_too_large"); }
      text+=decoder.decode(value,{stream:true});
    }
  } finally { reader.releaseLock(); }
  return {ok:true,value:JSON.parse(text+decoder.decode())};
};
export async function readSearchConsole(key: string, readJson: ReadJson = readProviderJson, now = new Date()) {
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
