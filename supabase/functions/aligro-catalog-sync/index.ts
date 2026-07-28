import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  HttpError,
  jsonResponse,
  type EdgeSupabaseClient,
} from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "aligro-catalog-sync";
const SUPPLIER = "aligro";
const ORIGIN = "https://www.aligro.ch";

// Politeness: a descriptive agent, a small pool and a pause between requests so a
// weekly refresh never looks like a burst. robots.txt Crawl-delay overrides this.
const USER_AGENT = "TOKRestaurantBot/1.0 (+https://tok.ch; catalogue de prix fournisseur)";
const CONCURRENCY = 4;
const REQUEST_DELAY_MS = 250;
const PAGE_TIMEOUT_MS = 15_000;

// The run stops on whichever bound is hit first. Each run prioritises URLs never
// seen and then the stalest ones, so successive runs widen coverage instead of
// re-crawling the same head of the catalogue.
const DEFAULT_MAX_PAGES = 1200;
const DEFAULT_DEADLINE_MS = 230_000;
const UPSERT_BATCH_SIZE = 100;
const MAX_SITEMAP_DOCUMENTS = 60;

type ExtractedProduct = {
  external_id: string | null;
  name: string;
  normalized_name: string;
  category: string | null;
  package_size: string | null;
  unit: string | null;
  price_chf: string | null;
  availability: string | null;
  url: string;
  image_url: string | null;
  raw: Record<string, unknown>;
};

type Diagnostics = {
  robots_fetched: boolean;
  robots_disallow_rules: number;
  crawl_delay_ms: number;
  sitemaps_discovered: number;
  sitemap_urls: number;
  candidate_product_urls: number;
  extracted_json_ld: number;
  extracted_open_graph: number;
  extracted_microdata: number;
  pages_without_product: number;
  pages_failed: number;
  stopped_reason: string;
  sample_urls: string[];
  sample_product_names: string[];
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function text(value: unknown, max = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function sameOrigin(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return host === "aligro.ch" || host.endsWith(".aligro.ch");
  } catch {
    return false;
  }
}

async function fetchText(url: string, timeoutMs = PAGE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return { ok: false as const, status: response.status, body: "" };
    return { ok: true as const, status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal robots.txt reader: the Disallow rules that apply to us and any declared
 * sitemaps. Rules for other user agents are ignored, as the standard intends.
 */
function parseRobots(body: string) {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelayMs = REQUEST_DELAY_MS;
  let appliesToUs = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      if (sameOrigin(value)) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      appliesToUs = value === "*" || value.toLowerCase().includes("tokrestaurantbot");
      continue;
    }
    if (!appliesToUs) continue;
    if (field === "disallow" && value) disallow.push(value);
    if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) crawlDelayMs = Math.min(seconds * 1000, 5000);
    }
  }

  return { disallow, sitemaps, crawlDelayMs };
}

function isAllowed(url: string, disallow: string[]) {
  if (!disallow.length) return true;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return !disallow.some((rule) => {
    if (rule === "/") return true;
    const prefix = rule.replace(/\*+$/, "");
    return path.startsWith(prefix);
  });
}

function extractTagValues(xml: string, tag: string) {
  const values: string[] = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    const value = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    if (value) values.push(value);
  }
  return values;
}

/**
 * Walks sitemap indexes down to the URL sets. Bounded by MAX_SITEMAP_DOCUMENTS so
 * a misconfigured or cyclic index cannot spin the run.
 */
async function collectSitemapUrls(seeds: string[], diagnostics: Diagnostics) {
  const queue = [...seeds];
  const visited = new Set<string>();
  const urls = new Set<string>();

  while (queue.length && visited.size < MAX_SITEMAP_DOCUMENTS) {
    const current = queue.shift()!;
    if (visited.has(current) || !sameOrigin(current)) continue;
    visited.add(current);

    let body = "";
    try {
      const result = await fetchText(current);
      if (!result.ok) continue;
      body = result.body;
    } catch {
      continue;
    }

    const isIndex = /<sitemapindex/i.test(body);
    for (const location of extractTagValues(body, "loc")) {
      if (!sameOrigin(location)) continue;
      if (isIndex) queue.push(location);
      else urls.add(location);
    }
  }

  diagnostics.sitemaps_discovered = visited.size;
  diagnostics.sitemap_urls = urls.size;
  return [...urls];
}

function parseJsonLdBlocks(html: string) {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // A single malformed block must not discard the others on the page.
    }
  }
  return blocks;
}

function findProductNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProductNode(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((entry) => typeof entry === "string" && entry.toLowerCase() === "product")) return node;
  for (const nested of Object.values(node)) {
    const found = findProductNode(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function readOffer(node: Record<string, unknown>) {
  const offers = node.offers;
  const candidates = Array.isArray(offers) ? offers : [offers];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const offer = candidate as Record<string, unknown>;
    const rawPrice = offer.price ?? offer.lowPrice
      ?? (typeof offer.priceSpecification === "object" && offer.priceSpecification
        ? (offer.priceSpecification as Record<string, unknown>).price
        : undefined);
    const price = Number(typeof rawPrice === "string" ? rawPrice.replace(/[^\d.,]/g, "").replace(",", ".") : rawPrice);
    const currency = text(offer.priceCurrency, 10);
    if (Number.isFinite(price) && price >= 0 && (!currency || currency.toUpperCase() === "CHF")) {
      return { price, availability: text(offer.availability, 100) };
    }
  }
  return { price: null as number | null, availability: null as string | null };
}

function metaContent(html: string, property: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  return text(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null, 300);
}

/**
 * Extraction runs from the most structured format to the least: JSON-LD Product,
 * then OpenGraph product meta, then bare microdata. Aligro's markup is unknown to
 * us, so each strategy is counted separately and the sync row reports which one
 * carried the run.
 */
function extractProduct(url: string, html: string, diagnostics: Diagnostics): ExtractedProduct | null {
  for (const block of parseJsonLdBlocks(html)) {
    const node = findProductNode(block);
    if (!node) continue;
    const name = text(node.name, 300);
    if (!name) continue;
    const { price, availability } = readOffer(node);
    diagnostics.extracted_json_ld += 1;
    return {
      external_id: text(node.sku ?? node.gtin13 ?? node.mpn, 120),
      name,
      normalized_name: normalizeName(name),
      category: text(node.category, 200),
      package_size: text(node.size ?? node.weight, 100),
      unit: null,
      price_chf: price === null ? null : price.toFixed(2),
      availability,
      url,
      image_url: text(Array.isArray(node.image) ? node.image[0] : node.image, 2000),
      // Only what helps diagnose a bad parse: a whole JSON-LD node would bloat the
      // row for no operational gain.
      raw: {
        strategy: "json_ld",
        sku: text(node.sku, 120),
        brand: text(typeof node.brand === "object" && node.brand
          ? (node.brand as Record<string, unknown>).name
          : node.brand, 120),
        raw_price: price,
      },
    };
  }

  const ogTitle = metaContent(html, "og:title");
  const ogPrice = metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount");
  if (ogTitle) {
    const price = Number(String(ogPrice ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
    diagnostics.extracted_open_graph += 1;
    return {
      external_id: null,
      name: ogTitle,
      normalized_name: normalizeName(ogTitle),
      category: null,
      package_size: null,
      unit: null,
      price_chf: Number.isFinite(price) && price > 0 ? price.toFixed(2) : null,
      availability: metaContent(html, "product:availability") ?? metaContent(html, "og:availability"),
      url,
      image_url: metaContent(html, "og:image"),
      raw: { strategy: "open_graph", og_title: ogTitle, og_price: ogPrice },
    };
  }

  const microName = html.match(/itemprop=["']name["'][^>]*>([^<]{2,200})</i)?.[1];
  const microPrice = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (microName) {
    const name = text(microName, 300)!;
    const price = Number(String(microPrice ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
    diagnostics.extracted_microdata += 1;
    return {
      external_id: null,
      name,
      normalized_name: normalizeName(name),
      category: null,
      package_size: null,
      unit: null,
      price_chf: Number.isFinite(price) && price > 0 ? price.toFixed(2) : null,
      availability: null,
      url,
      image_url: null,
      raw: { strategy: "microdata" },
    };
  }

  diagnostics.pages_without_product += 1;
  return null;
}

async function flush(client: EdgeSupabaseClient, products: ExtractedProduct[]) {
  if (!products.length) return 0;
  const { data, error } = await client.rpc("upsert_supplier_catalog_products", {
    p_supplier: SUPPLIER,
    p_products: products,
  });
  if (error) throw new HttpError(503, "supplier_catalog_upsert_failed");
  return Number(data) || 0;
}

/**
 * Orders the crawl so coverage grows: URLs never fetched come first, then the
 * ones checked longest ago. A weekly run therefore reaches new products before
 * refreshing ones it already knows.
 */
async function prioritiseUrls(client: EdgeSupabaseClient, urls: string[]) {
  const known = new Map<string, string>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("supplier_catalog_products")
      .select("url, checked_at")
      .eq("supplier", SUPPLIER)
      .order("checked_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data?.length) break;
    for (const row of data) known.set(String(row.url), String(row.checked_at));
    if (data.length < pageSize) break;
  }

  return [...urls].sort((left, right) => {
    const leftSeen = known.get(left);
    const rightSeen = known.get(right);
    if (!leftSeen && !rightSeen) return 0;
    if (!leftSeen) return -1;
    if (!rightSeen) return 1;
    return leftSeen.localeCompare(rightSeen);
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (!actor.isServiceRole) throw new HttpError(403, "forbidden");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const maxPages = Math.min(Math.max(Number(body.max_pages) || DEFAULT_MAX_PAGES, 1), 5000);
    const deadline = Date.now() + Math.min(Math.max(Number(body.deadline_ms) || DEFAULT_DEADLINE_MS, 10_000), 350_000);

    const diagnostics: Diagnostics = {
      robots_fetched: false,
      robots_disallow_rules: 0,
      crawl_delay_ms: REQUEST_DELAY_MS,
      sitemaps_discovered: 0,
      sitemap_urls: 0,
      candidate_product_urls: 0,
      extracted_json_ld: 0,
      extracted_open_graph: 0,
      extracted_microdata: 0,
      pages_without_product: 0,
      pages_failed: 0,
      stopped_reason: "completed",
      sample_urls: [],
      sample_product_names: [],
    };

    const { data: syncRow, error: syncError } = await actor.adminClient
      .from("supplier_catalog_syncs")
      .insert({ supplier: SUPPLIER, status: "running" })
      .select("id")
      .single();
    if (syncError || !syncRow) throw new HttpError(503, "supplier_catalog_sync_unavailable");
    const syncId = String(syncRow.id);

    let pagesFetched = 0;
    let productsUpserted = 0;
    let productsSkipped = 0;

    try {
      let robots = { disallow: [] as string[], sitemaps: [] as string[], crawlDelayMs: REQUEST_DELAY_MS };
      try {
        const robotsResult = await fetchText(`${ORIGIN}/robots.txt`, 10_000);
        if (robotsResult.ok) {
          robots = parseRobots(robotsResult.body);
          diagnostics.robots_fetched = true;
          diagnostics.robots_disallow_rules = robots.disallow.length;
          diagnostics.crawl_delay_ms = robots.crawlDelayMs;
        }
      } catch {
        // An unreachable robots.txt is not consent to crawl everything: the run
        // continues with the default delay and the declared sitemap only.
      }

      const seeds = robots.sitemaps.length ? robots.sitemaps : [`${ORIGIN}/sitemap.xml`];
      const discovered = await collectSitemapUrls(seeds, diagnostics);
      const candidates = discovered.filter((url) => isAllowed(url, robots.disallow));
      diagnostics.candidate_product_urls = candidates.length;
      diagnostics.sample_urls = candidates.slice(0, 10);

      if (!candidates.length) {
        diagnostics.stopped_reason = "no_crawlable_urls";
        await actor.adminClient.from("supplier_catalog_syncs").update({
          status: "blocked",
          finished_at: new Date().toISOString(),
          pages_fetched: 0,
          products_upserted: 0,
          products_skipped: 0,
          error_message: "Aucune URL exploitable n'a été découverte via robots.txt ou sitemap.xml.",
          diagnostics,
        }).eq("id", syncId);
        return jsonResponse({ ok: false, sync_id: syncId, reason: "no_crawlable_urls", diagnostics }, 200, cors);
      }

      const ordered = await prioritiseUrls(actor.adminClient, candidates);
      const queue = ordered.slice(0, maxPages);
      let cursor = 0;
      let pending: ExtractedProduct[] = [];

      const worker = async () => {
        for (;;) {
          const index = cursor++;
          if (index >= queue.length) return;
          if (Date.now() > deadline) {
            diagnostics.stopped_reason = "deadline_reached";
            return;
          }

          const url = queue[index];
          try {
            const result = await fetchText(url);
            pagesFetched += 1;
            if (!result.ok) {
              diagnostics.pages_failed += 1;
              continue;
            }
            const product = extractProduct(url, result.body, diagnostics);
            if (!product) {
              productsSkipped += 1;
              continue;
            }
            pending.push(product);
            if (diagnostics.sample_product_names.length < 10) {
              diagnostics.sample_product_names.push(product.name);
            }
            if (pending.length >= UPSERT_BATCH_SIZE) {
              const batch = pending;
              pending = [];
              productsUpserted += await flush(actor.adminClient, batch);
            }
          } catch {
            diagnostics.pages_failed += 1;
          }
          await new Promise((resolve) => setTimeout(resolve, robots.crawlDelayMs));
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      productsUpserted += await flush(actor.adminClient, pending);

      if (diagnostics.stopped_reason === "completed" && queue.length < candidates.length) {
        diagnostics.stopped_reason = "page_budget_reached";
      }

      await actor.adminClient.from("supplier_catalog_syncs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        products_upserted: productsUpserted,
        products_skipped: productsSkipped,
        diagnostics,
      }).eq("id", syncId);

      log.info("catalogue synchronised", {
        pages_fetched: pagesFetched,
        products_upserted: productsUpserted,
        stopped_reason: diagnostics.stopped_reason,
      });

      return jsonResponse({
        ok: true,
        sync_id: syncId,
        pages_fetched: pagesFetched,
        products_upserted: productsUpserted,
        products_skipped: productsSkipped,
        diagnostics,
      }, 200, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "unknown_error";
      await actor.adminClient.from("supplier_catalog_syncs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        products_upserted: productsUpserted,
        products_skipped: productsSkipped,
        error_message: message,
        diagnostics,
      }).eq("id", syncId);
      throw error;
    }
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ ok: false, error: error.message }, error.status, cors);
    }
    log.error("catalogue sync failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonResponse({ ok: false, error: "internal_error" }, 500, cors);
  }
});
