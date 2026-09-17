import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "discover-thefork-official-sites";
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 15;
const FETCH_TIMEOUT_MS = 7_000;
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_HTML_CHARACTERS = 900_000;
const MAX_ROBOTS_CHARACTERS = 140_000;
const USER_AGENT = "TOK-TheFork-Site-Discovery/1.0 (+https://www.thetok.ch)";

const BLOCKED_HOSTS = [
  "tripadvisor.ch",
  "tripadvisor.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "local.ch",
  "search.ch",
  "google.com",
  "google.ch",
  "bing.com",
  "yelp.com",
  "ubereats.com",
  "just-eat.ch",
  "smood.ch",
  "restaurantguru.com",
  "falstaff.com",
  "mapstr.com",
  "viamichelin.com",
  "viamichelin.ie",
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "bluewin.ch",
  "sunrise.ch",
  "gmx.ch",
  "gmx.com",
]);

const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "bar",
  "brasserie",
  "auberge",
  "geneve",
  "sarl",
  "sa",
  "gmbh",
  "ag",
  "sagl",
  "ltd",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-internal-cron-secret, x-cron-secret",
  Vary: "Origin",
};

type ClaimRow = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_address: string | null;
  restaurant_city: string | null;
  directory_source_reference: string | null;
  attempt_number: number;
};

type SearchResult = {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  markdown?: unknown;
};

type IdentityScore = {
  score: number;
  nameMatched: boolean;
  cityMatched: boolean;
  addressMatched: boolean;
};

type RobotsRule = { allow: boolean; path: string };
type RobotsPolicy = { rules: RobotsRule[]; denyAll: boolean };

const dnsCache = new Map<string, Promise<boolean>>();
const robotsCache = new Map<string, Promise<RobotsPolicy>>();

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function boundedBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulNameTokens(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function hostOf(value: string | null | undefined) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isTheForkHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "").split(".").includes("thefork");
}

function isBlockedHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  if (!normalized || isTheForkHost(normalized) || FREE_EMAIL_DOMAINS.has(normalized)) return true;
  return BLOCKED_HOSTS.some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function normalizeCandidateUrl(value: string) {
  const cleaned = value
    .trim()
    .replace(/^[([{<]+/, "")
    .replace(/[\])}>.,;:!?¡¿]+$/g, "");
  if (!cleaned) return null;
  try {
    const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || isBlockedHost(url.hostname)) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractCandidateUrlsFromSearchResult(result: SearchResult) {
  const output = new Set<string>();
  const direct = normalizeCandidateUrl(String(result.url || ""));
  if (direct) output.add(direct);

  const blob = [result.title, result.description, result.markdown]
    .map((value) => String(value || ""))
    .join(" ");

  const patterns = [
    /https?:\/\/[^\s<>"'`]+/gi,
    /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,24}(?:\/[^\s<>"'`]*)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of blob.matchAll(pattern)) {
      const candidate = normalizeCandidateUrl(match[0]);
      if (candidate) output.add(candidate);
    }
  }

  return [...output].slice(0, 12);
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice("::ffff:".length));
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("2001:db8:");
}

function isIpLiteral(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}

async function hostIsPublic(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIpLiteral(host)) return host.includes(":") ? !isPrivateIpv6(host) : !isPrivateIpv4(host);
  if (!dnsCache.has(host)) {
    dnsCache.set(host, (async () => {
      const records: string[] = [];
      const [ipv4, ipv6] = await Promise.allSettled([
        Deno.resolveDns(host, "A"),
        Deno.resolveDns(host, "AAAA"),
      ]);
      if (ipv4.status === "fulfilled") records.push(...ipv4.value);
      if (ipv6.status === "fulfilled") records.push(...ipv6.value);
      if (records.length === 0) return false;
      return records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }
  return await dnsCache.get(host)!;
}

async function fetchPublic(input: string, options: { timeoutMs?: number; maxRedirects?: number } = {}) {
  let current = new URL(input);
  const maxRedirects = options.maxRedirects ?? 3;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!await hostIsPublic(current.hostname)) throw new Error("unsafe_or_private_host");
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === maxRedirects) throw new Error("redirect_limit");
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("redirect_limit");
}

async function readTextLimited(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= limit) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, limit);
}

function parseRobots(text: string): RobotsPolicy {
  const rules: RobotsRule[] = [];
  let relevant = false;
  let denyAll = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      const agent = value.toLowerCase();
      relevant = agent === "*" || agent.includes("tok");
      continue;
    }
    if (!relevant) continue;
    if (key === "allow" && value) rules.push({ allow: true, path: value });
    if (key === "disallow" && value) {
      rules.push({ allow: false, path: value });
      if (value === "/") denyAll = true;
    }
  }
  return { rules, denyAll };
}

async function getRobots(url: URL) {
  if (!robotsCache.has(url.origin)) {
    robotsCache.set(url.origin, (async () => {
      try {
        const { response } = await fetchPublic(new URL("/robots.txt", url.origin).toString(), { timeoutMs: 4_000 });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], denyAll: false };
        }
        return parseRobots(await readTextLimited(response, MAX_ROBOTS_CHARACTERS));
      } catch {
        return { rules: [], denyAll: false };
      }
    })());
  }
  return await robotsCache.get(url.origin)!;
}

function robotsAllows(policy: RobotsPolicy, url: URL) {
  if (policy.denyAll && policy.rules.every((rule) => !rule.allow)) return false;
  const target = `${url.pathname}${url.search}`;
  const matches = policy.rules
    .filter((rule) => rule.path && target.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matches.length === 0 ? true : matches[0].allow;
}

async function fetchOfficialPage(input: string) {
  let url = new URL(input);
  if (isBlockedHost(url.hostname)) return null;
  const robots = await getRobots(url);
  if (!robotsAllows(robots, url)) return null;
  try {
    const { response, finalUrl } = await fetchPublic(url.toString());
    if (isBlockedHost(finalUrl.hostname)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const finalRobots = finalUrl.origin === url.origin ? robots : await getRobots(finalUrl);
    if (!robotsAllows(finalRobots, finalUrl)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return { url: finalUrl.toString(), html: await readTextLimited(response, MAX_HTML_CHARACTERS) };
  } catch {
    if (url.protocol === "https:") {
      try {
        url = new URL(input);
        url.protocol = "http:";
        const { response, finalUrl } = await fetchPublic(url.toString());
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (!response.ok || isBlockedHost(finalUrl.hostname) || !contentType.includes("text/html")) {
          await response.body?.cancel().catch(() => undefined);
          return null;
        }
        return { url: finalUrl.toString(), html: await readTextLimited(response, MAX_HTML_CHARACTERS) };
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function identityScore(job: ClaimRow, html: string, pageUrl: string): IdentityScore {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const blob = normalizeText(`${title} ${stripHtml(html).slice(0, 180_000)} ${pageUrl}`);
  const normalizedName = normalizeText(job.restaurant_name);
  const nameTokens = meaningfulNameTokens(job.restaurant_name);
  const normalizedCity = normalizeText(job.restaurant_city);
  const addressTokens = normalizeText(job.restaurant_address)
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 7);
  const streetNumber = String(job.restaurant_address || "").match(/\b\d{1,4}[a-z]?\b/i)?.[0]?.toLowerCase() || "";
  const exactName = Boolean(normalizedName && blob.includes(normalizedName));
  const matchingNameTokens = nameTokens.filter((token) => blob.includes(token)).length;
  const nameRatio = nameTokens.length ? matchingNameTokens / nameTokens.length : 0;
  const nameMatched = exactName || nameRatio >= 0.6;
  const cityMatched = Boolean(normalizedCity && blob.includes(normalizedCity));
  const addressTokenMatches = addressTokens.filter((token) => blob.includes(token)).length;
  const addressMatched = addressTokenMatches >= Math.min(2, Math.max(1, addressTokens.length))
    || Boolean(streetNumber && blob.includes(streetNumber) && addressTokenMatches >= 1);
  let score = 0;
  if (exactName) score += 7;
  else if (nameRatio >= 0.75) score += 5;
  else if (nameRatio >= 0.6) score += 3;
  if (cityMatched) score += 2;
  if (addressMatched) score += 5;
  return { score, nameMatched, cityMatched, addressMatched };
}

async function verifyOfficialSiteIdentity(job: ClaimRow, candidateUrl: string) {
  const initial = normalizeCandidateUrl(candidateUrl);
  if (!initial) return null;
  const pagesToTry = [
    initial,
    new URL("/contact", initial).toString(),
    new URL("/restaurant", initial).toString(),
    new URL("/a-propos", initial).toString(),
  ];
  const seen = new Set<string>();
  let best: { url: string; score: IdentityScore } | null = null;
  for (const pageUrl of pagesToTry) {
    if (seen.has(pageUrl)) continue;
    seen.add(pageUrl);
    const page = await fetchOfficialPage(pageUrl);
    if (!page) continue;
    const score = identityScore(job, page.html, page.url);
    if (!best || score.score > best.score.score) best = { url: page.url, score };
    if (score.nameMatched && score.score >= 8 && (score.addressMatched || score.cityMatched)) {
      const canonical = new URL(page.url);
      canonical.pathname = "/";
      canonical.search = "";
      canonical.hash = "";
      return canonical.toString();
    }
  }
  return best && best.score.nameMatched && best.score.score >= 10 ? best.url : null;
}

async function firecrawlSearch(job: ClaimRow) {
  const apiKey = env("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("firecrawl_api_key_missing");
  const query = `"${job.restaurant_name}" "${job.restaurant_address || ""}" ${job.restaurant_city || "Genève"} restaurant`;
  const response = await fetch(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, sources: ["web"], limit: 8, location: "Geneva,Switzerland", country: "CH", safe: true }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`firecrawl_search_${response.status}:${text.slice(0, 120)}`);
    (error as any).transient = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  const payload = await response.json();
  return Array.isArray(payload?.data?.web) ? payload.data.web as SearchResult[] : [];
}

async function discoverOfficialSite(job: ClaimRow) {
  const results = await firecrawlSearch(job);
  const candidates = new Set<string>();
  for (const result of results) {
    for (const candidate of extractCandidateUrlsFromSearchResult(result)) candidates.add(candidate);
  }
  for (const candidate of candidates) {
    const verified = await verifyOfficialSiteIdentity(job, candidate);
    if (verified) return verified;
  }
  return null;
}

async function settleJob(
  supabase: any,
  job: ClaimRow,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("restaurant_directory_image_jobs")
    .update({ locked_at: null, updated_at: new Date().toISOString(), ...values })
    .eq("restaurant_id", job.restaurant_id);
  if (error) throw new Error(`job_update_failed:${error.message}`);
}

async function processOne(supabase: any, job: ClaimRow) {
  try {
    const siteUrl = await discoverOfficialSite(job);
    if (!siteUrl) {
      await settleJob(supabase, job, {
        status: "not_found",
        next_attempt_at: null,
        last_error: "thefork_recovery:permanent:site_discovery_exhausted",
      });
      return { restaurant_id: job.restaurant_id, status: "not_found" };
    }

    const { error: contactError } = await supabase
      .from("marketing_contacts")
      .update({ website: siteUrl, updated_at: new Date().toISOString() })
      .eq("source_objectid", Number(job.directory_source_reference))
      .eq("branch", "Restaurant référencé sur TheFork");
    if (contactError) throw new Error(`contact_update_failed:${contactError.message}`);

    await settleJob(supabase, job, {
      status: "not_found",
      attempts: 3,
      next_attempt_at: new Date().toISOString(),
      source_page_url: siteUrl,
      last_error: `thefork_site_discovery:verified:${siteUrl}`.slice(0, 500),
    });
    return { restaurant_id: job.restaurant_id, status: "verified_site", site_url: siteUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "site_discovery_failed";
    const transient = Boolean((error as any)?.transient) || message.includes("timeout") || message.includes("network");
    await settleJob(supabase, job, {
      status: "not_found",
      next_attempt_at: transient ? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() : null,
      last_error: transient
        ? "thefork_recovery:permanent:no_verified_official_image"
        : "thefork_recovery:permanent:site_discovery_exhausted",
    }).catch(() => undefined);
    return { restaurant_id: job.restaurant_id, status: "error", error: message };
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function authorize(req: Request, supabase: any) {
  const provided = req.headers.get("x-internal-cron-secret") || req.headers.get("x-cron-secret") || "";
  const configured = env("INTERNAL_CRON_SECRET") || env("CRON_SECRET");
  if (configured && provided && safeEqual(provided, configured)) return true;
  if (provided) {
    try {
      const { data, error } = await supabase.rpc("verify_internal_cron_secret", { p_secret: provided });
      if (!error && data === true) return true;
    } catch {
      // Continue to service-role bearer fallback.
    }
  }
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean(token && env("SUPABASE_SERVICE_ROLE_KEY") && safeEqual(token, env("SUPABASE_SERVICE_ROLE_KEY")));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ success: false, error: "supabase_configuration_missing" }, 503);
  const supabase = createClient(supabaseUrl, serviceRole);
  if (!await authorize(req, supabase)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String((body as any)?.mode || "process_batch");
    if (mode !== "process_batch") return json({ success: false, error: "Invalid mode" }, 400);
    const limit = boundedBatchSize((body as any)?.limit);
    const { data: claimed, error: claimError } = await supabase.rpc(
      "service_claim_thefork_official_site_discovery_jobs",
      { p_limit: limit },
    );
    if (claimError) return json({ success: false, error: `claim_failed:${claimError.message}` }, 500);
    const jobs = (claimed || []) as ClaimRow[];
    const results = await mapWithConcurrency(jobs, 3, (job) => processOne(supabase, job));
    const verifiedSites = results.filter((result: any) => result?.status === "verified_site").length;
    const notFound = results.filter((result: any) => result?.status === "not_found").length;
    const errors = results.filter((result: any) => result?.status === "error").length;
    console.log(JSON.stringify({ fn: FUNCTION_NAME, claimed: jobs.length, verified_sites: verifiedSites, not_found: notFound, errors }));
    return json({ success: true, claimed: jobs.length, verified_sites: verifiedSites, not_found: notFound, errors, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({ fn: FUNCTION_NAME, msg: "request_failed", message }));
    return json({ success: false, error: message }, 500);
  }
});
