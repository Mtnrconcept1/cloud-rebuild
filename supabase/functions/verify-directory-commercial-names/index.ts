import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;
const MAX_ERROR_LENGTH = 500;
const MAX_HTML_CHARACTERS = 1_000_000;
const MAX_ROBOTS_CHARACTERS = 200_000;
const MAX_PAGES_PER_SITE = 4;
const FETCH_TIMEOUT_MS = 6_000;
const DEFAULT_CRAWL_DELAY_MS = 300;
const USER_AGENT = "TOK-Directory-Name-Verifier/1.0 (+https://www.thetok.ch)";
const MIN_SITE_IDENTITY_SCORE = 3;
const MIN_EMAIL_SITE_IDENTITY_SCORE = 5;
const MIN_NAME_SCORE = 15;

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
  "hispeed.ch",
  "gmx.ch",
  "gmx.com",
]);

const REJECTED_SITE_HOSTS = [
  "thefork.ch",
  "thefork.com",
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
];

const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "café",
  "bar",
  "brasserie",
  "auberge",
  "geneve",
  "genève",
  "sarl",
  "sàrl",
  "sagl",
  "gmbh",
  "ltd",
  "llc",
  "inc",
  "snc",
]);

const GENERIC_DISPLAY_NAMES = new Set([
  "accueil",
  "home",
  "restaurant",
  "restaurants",
  "menu",
  "carte",
  "contact",
  "bienvenue",
  "geneve",
  "genève",
  "switzerland",
  "suisse",
]);

const LEGAL_SUFFIX_RE = /(^|[\s,-])((s\.?\s*a\.?)|s[àa]rl|sagl|gmbh|ag|ltd|llc|inc|snc|association|fondation|holding|investissements?|services?)[\s.]*$/i;
const RESTAURANT_SCHEMA_TYPES = new Set([
  "restaurant",
  "foodestablishment",
  "cafeorcoffeeshop",
  "barorpub",
  "bakery",
  "fastfoodrestaurant",
  "icecreamshop",
]);
const PAGE_LINK_KEYWORDS = ["contact", "about", "a-propos", "restaurant", "menu", "carte", "concept", "adresse"];
const COMMON_PAGE_PATHS = ["/contact", "/a-propos", "/restaurant"];

type RestaurantRow = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  city: string | null;
  directory_source_reference: string | null;
  is_directory_listing: boolean;
  directory_public_name_verified: boolean;
  directory_public_name_source: string | null;
};

type LeadHints = {
  website: string | null;
  email: string | null;
};

type WebsiteCandidate = {
  url: string;
  method: "catalog_website" | "business_email_domain";
};

type CrawledPage = {
  url: string;
  html: string;
  identityScore: number;
  discoveryMethod: WebsiteCandidate["method"];
};

type CommercialNameCandidate = {
  name: string;
  pageUrl: string;
  source: "jsonld_restaurant" | "og_site_name" | "application_name" | "h1" | "title";
  score: number;
};

type RobotsRule = { allow: boolean; path: string };
type RobotsPolicy = { rules: RobotsRule[]; crawlDelayMs: number; denyAll: boolean };

const dnsSafetyCache = new Map<string, Promise<boolean>>();
const robotsCache = new Map<string, Promise<RobotsPolicy>>();
const lastRequestAt = new Map<string, number>();

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

function meaningfulNameTokens(value: string) {
  return normalizeText(value)
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

function isRejectedSiteHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return REJECTED_SITE_HOSTS.some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function normalizeHttpUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function attributesOf(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function resolvePageUrl(value: string, pageUrl: string) {
  try {
    const resolved = new URL(value, pageUrl);
    if (!/^https?:$/.test(resolved.protocol)) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
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

  if (!dnsSafetyCache.has(host)) {
    dnsSafetyCache.set(host, (async () => {
      const records: string[] = [];
      const [ipv4, ipv6] = await Promise.allSettled([
        Deno.resolveDns(host, "A"),
        Deno.resolveDns(host, "AAAA"),
      ]);
      if (ipv4.status === "fulfilled") records.push(...ipv4.value);
      if (ipv6.status === "fulfilled") records.push(...ipv6.value);
      return records.length > 0
        && records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }
  return await dnsSafetyCache.get(host)!;
}

async function fetchPublic(input: string | URL, timeoutMs = FETCH_TIMEOUT_MS) {
  let current = input instanceof URL ? new URL(input) : new URL(input);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!/^https?:$/.test(current.protocol) || !await hostIsPublic(current.hostname)) {
      throw new Error("unsafe_or_private_host");
    }
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === 3) throw new Error("redirect_limit");
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("redirect_limit");
}

async function responseTextLimited(response: Response, maxCharacters: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < maxCharacters) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= maxCharacters) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, maxCharacters);
}

function parseRobotsPolicy(text: string): RobotsPolicy {
  type Group = { agents: string[]; rules: RobotsRule[]; crawlDelayMs: number };
  const groups: Group[] = [];
  let current: Group = { agents: [], rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };
  let sawDirective = false;
  const flush = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };
    sawDirective = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (sawDirective) flush();
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (current.agents.length === 0) continue;
    if (key === "allow" || key === "disallow") {
      sawDirective = true;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") {
      sawDirective = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.min(2_000, Math.max(DEFAULT_CRAWL_DELAY_MS, Math.round(seconds * 1_000)));
      }
    }
  }
  flush();
  const agent = "tok-directory-name-verifier";
  const exact = groups.filter((group) => group.agents.some((value) => value !== "*" && agent.includes(value)));
  const selected = exact.length > 0 ? exact : groups.filter((group) => group.agents.includes("*"));
  return {
    rules: selected.flatMap((group) => group.rules),
    crawlDelayMs: Math.max(DEFAULT_CRAWL_DELAY_MS, ...selected.map((group) => group.crawlDelayMs)),
    denyAll: false,
  };
}

function robotsAllows(policy: RobotsPolicy, url: URL) {
  if (policy.denyAll) return false;
  const target = `${url.pathname}${url.search}` || "/";
  const matching = policy.rules
    .filter((rule) => target.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return matching.length === 0 || matching[0].allow;
}

async function getRobotsPolicy(url: URL) {
  const origin = url.origin;
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const { response } = await fetchPublic(new URL("/robots.txt", origin), 4_000);
        if (response.status === 404) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: false };
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
        }
        return parseRobotsPolicy(await responseTextLimited(response, MAX_ROBOTS_CHARACTERS));
      } catch {
        return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
      }
    })());
  }
  return await robotsCache.get(origin)!;
}

async function respectCrawlDelay(url: URL, delayMs: number) {
  const previous = lastRequestAt.get(url.origin) || 0;
  const waitMs = Math.max(0, delayMs - (Date.now() - previous));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt.set(url.origin, Date.now());
}

async function fetchHtmlPage(input: string | URL) {
  const initialUrl = input instanceof URL ? new URL(input) : new URL(input);
  const policy = await getRobotsPolicy(initialUrl);
  if (!robotsAllows(policy, initialUrl)) return null;
  await respectCrawlDelay(initialUrl, policy.crawlDelayMs);
  try {
    const { response, finalUrl } = await fetchPublic(initialUrl);
    const finalPolicy = finalUrl.origin === initialUrl.origin ? policy : await getRobotsPolicy(finalUrl);
    if (!robotsAllows(finalPolicy, finalUrl)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return { url: finalUrl.toString(), html: await responseTextLimited(response, MAX_HTML_CHARACTERS) };
  } catch {
    return null;
  }
}

function scoreSiteIdentity(restaurant: RestaurantRow, html: string, pageUrl: string) {
  const blob = normalizeText(`${stripHtml(html).slice(0, 140_000)} ${pageUrl}`);
  const oldName = restaurant.legal_name || restaurant.name;
  const normalizedOldName = normalizeText(oldName);
  const tokens = meaningfulNameTokens(oldName);
  const city = normalizeText(restaurant.city);
  const addressTokens = normalizeText(restaurant.address).split(" ").filter((token) => token.length >= 4).slice(0, 6);
  let score = 0;
  if (normalizedOldName && blob.includes(normalizedOldName)) score += 6;
  if (tokens.length > 0) {
    const matching = tokens.filter((token) => blob.includes(token)).length;
    const ratio = matching / tokens.length;
    if (ratio >= 0.75) score += 4;
    else if (ratio >= 0.5) score += 2;
  }
  if (city && blob.includes(city)) score += 2;
  if (addressTokens.some((token) => blob.includes(token))) score += 3;
  return score;
}

async function getLeadHints(supabase: any, sourceReference: string | null): Promise<LeadHints> {
  if (!sourceReference) return { website: null, email: null };
  const lookup = async (column: "source_reference" | "source_objectid", value: string | number) => {
    const result = await supabase
      .from("marketing_contacts")
      .select("website, email")
      .eq("source_system", "commercial_prospect_catalog")
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    return !result.error && result.data ? result.data : null;
  };
  const byReference = await lookup("source_reference", sourceReference);
  if (byReference) {
    return {
      website: String(byReference.website || "").trim() || null,
      email: String(byReference.email || "").trim() || null,
    };
  }
  if (/^\d+$/.test(sourceReference)) {
    const byObjectId = await lookup("source_objectid", Number(sourceReference));
    if (byObjectId) {
      return {
        website: String(byObjectId.website || "").trim() || null,
        email: String(byObjectId.email || "").trim() || null,
      };
    }
  }
  return { website: null, email: null };
}

function businessEmailDomain(email: string | null) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain || FREE_EMAIL_DOMAINS.has(domain) || isRejectedSiteHost(domain)) return null;
  return domain;
}

function websiteCandidates(hints: LeadHints) {
  const candidates: WebsiteCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | null | undefined, method: WebsiteCandidate["method"]) => {
    const url = normalizeHttpUrl(value);
    if (!url) return;
    const host = hostOf(url.toString());
    if (!host || isRejectedSiteHost(host) || seen.has(host)) return;
    seen.add(host);
    candidates.push({ url: url.toString(), method });
  };
  add(hints.website, "catalog_website");
  const emailDomain = businessEmailDomain(hints.email);
  if (emailDomain) add(emailDomain, "business_email_domain");
  return candidates;
}

async function discoverHomepage(restaurant: RestaurantRow, hints: LeadHints): Promise<CrawledPage | null> {
  for (const candidate of websiteCandidates(hints)) {
    let page = await fetchHtmlPage(candidate.url);
    if (!page && candidate.url.startsWith("https://")) {
      page = await fetchHtmlPage(candidate.url.replace(/^https:\/\//i, "http://"));
    }
    if (!page) continue;
    const identityScore = scoreSiteIdentity(restaurant, page.html, page.url);
    if (candidate.method === "business_email_domain" && identityScore < MIN_EMAIL_SITE_IDENTITY_SCORE) continue;
    return { ...page, identityScore, discoveryMethod: candidate.method };
  }
  return null;
}

function extractInternalLinks(pageUrl: string, html: string) {
  const pageHost = hostOf(pageUrl);
  const ranked: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = attributesOf(`<a ${match[1]}>`);
    if (!attrs.href) continue;
    const resolved = resolvePageUrl(attrs.href, pageUrl);
    if (!resolved || hostOf(resolved) !== pageHost) continue;
    const url = new URL(resolved);
    if (url.search) continue;
    const blob = normalizeText(`${url.pathname} ${stripHtml(match[2])}`);
    const score = PAGE_LINK_KEYWORDS.reduce((total, keyword) => total + (blob.includes(keyword) ? 1 : 0), 0);
    if (score === 0) continue;
    const canonical = `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    ranked.push({ url: canonical, score });
  }
  ranked.sort((left, right) => right.score - left.score || left.url.length - right.url.length);
  const output = ranked.map((entry) => entry.url);
  for (const path of COMMON_PAGE_PATHS) {
    if (output.length >= MAX_PAGES_PER_SITE - 1) break;
    const guessed = new URL(path, pageUrl).toString();
    if (!seen.has(guessed)) output.push(guessed);
  }
  return output.slice(0, MAX_PAGES_PER_SITE - 1);
}

function cleanCommercialName(value: unknown) {
  let candidate = stripHtml(String(value || "")).replace(/\s+/g, " ").trim();
  candidate = candidate.replace(LEGAL_SUFFIX_RE, "").replace(/[|•·–—:-]+$/g, "").trim();
  if (!candidate || candidate.length < 2 || candidate.length > 100) return null;
  const normalized = normalizeText(candidate);
  if (!normalized || GENERIC_DISPLAY_NAMES.has(normalized)) return null;
  if (!/[a-zA-ZÀ-ÿ]{2}/.test(candidate)) return null;
  if (/^https?:\/\//i.test(candidate) || /@/.test(candidate)) return null;
  return candidate;
}

function schemaTypes(node: Record<string, unknown>) {
  const value = node["@type"];
  return (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry || "").toLowerCase())
    .filter(Boolean);
}

function collectJsonLdRestaurantNames(node: unknown, output: string[], depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectJsonLdRestaurantNames(entry, output, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (schemaTypes(record).some((type) => RESTAURANT_SCHEMA_TYPES.has(type)) && typeof record.name === "string") {
    output.push(record.name);
  }
  for (const value of Object.values(record)) collectJsonLdRestaurantNames(value, output, depth + 1);
}

function addNameCandidate(
  candidates: Map<string, CommercialNameCandidate>,
  restaurant: RestaurantRow,
  rawName: unknown,
  source: CommercialNameCandidate["source"],
  page: CrawledPage,
  siteIdentityScore: number,
  baseScore: number,
) {
  const name = cleanCommercialName(rawName);
  if (!name) return;
  const normalized = normalizeText(name);
  const oldBase = normalizeText(String(restaurant.legal_name || restaurant.name).replace(LEGAL_SUFFIX_RE, ""));
  let score = baseScore + Math.min(6, siteIdentityScore);
  if (oldBase && (normalized.includes(oldBase) || oldBase.includes(normalized))) score += 4;
  const oldTokens = meaningfulNameTokens(restaurant.legal_name || restaurant.name);
  const candidateTokens = meaningfulNameTokens(name);
  if (candidateTokens.length > 0 && oldTokens.some((token) => candidateTokens.includes(token))) score += 2;
  const existing = candidates.get(normalized);
  if (!existing || score > existing.score) candidates.set(normalized, { name, pageUrl: page.url, source, score });
}

function extractCommercialNameCandidates(
  restaurant: RestaurantRow,
  page: CrawledPage,
  siteIdentityScore: number,
) {
  const candidates = new Map<string, CommercialNameCandidate>();

  for (const match of page.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const names: string[] = [];
      collectJsonLdRestaurantNames(JSON.parse(match[1]), names);
      for (const name of names.slice(0, 8)) {
        addNameCandidate(candidates, restaurant, name, "jsonld_restaurant", page, siteIdentityScore, 20);
      }
    } catch {
      // Invalid publisher JSON-LD is ignored.
    }
  }

  for (const match of page.html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key === "og:site_name") {
      addNameCandidate(candidates, restaurant, attrs.content, "og_site_name", page, siteIdentityScore, 14);
    } else if (key === "application-name") {
      addNameCandidate(candidates, restaurant, attrs.content, "application_name", page, siteIdentityScore, 12);
    }
  }

  const h1 = page.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) addNameCandidate(candidates, restaurant, h1, "h1", page, siteIdentityScore, 10);

  const title = stripHtml(page.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  if (title) {
    addNameCandidate(candidates, restaurant, title, "title", page, siteIdentityScore, 7);
    for (const segment of title.split(/\s+(?:\||•|·|–|—)\s+|\s+-\s+/).slice(0, 4)) {
      addNameCandidate(candidates, restaurant, segment, "title", page, siteIdentityScore, 8);
    }
  }

  return [...candidates.values()];
}

async function resolveCommercialName(supabase: any, restaurant: RestaurantRow): Promise<CommercialNameCandidate | null> {
  const hints = await getLeadHints(supabase, restaurant.directory_source_reference);
  const homepage = await discoverHomepage(restaurant, hints);
  if (!homepage) return null;

  const pages: CrawledPage[] = [homepage];
  for (const link of extractInternalLinks(homepage.url, homepage.html)) {
    const crawled = await fetchHtmlPage(link);
    if (!crawled) continue;
    pages.push({
      ...crawled,
      identityScore: scoreSiteIdentity(restaurant, crawled.html, crawled.url),
      discoveryMethod: homepage.discoveryMethod,
    });
    if (pages.length >= MAX_PAGES_PER_SITE) break;
  }

  const siteIdentityScore = Math.max(...pages.map((page) => page.identityScore));
  if (siteIdentityScore < MIN_SITE_IDENTITY_SCORE) return null;

  const candidates = pages
    .flatMap((page) => extractCommercialNameCandidates(restaurant, page, siteIdentityScore))
    .sort((left, right) => right.score - left.score || left.name.length - right.name.length);

  return candidates.find((candidate) => candidate.score >= MIN_NAME_SCORE) || null;
}

function retryDelayIso(kind: "not_found" | "error") {
  const delayMs = kind === "not_found" ? 24 * 60 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_name_jobs")
    .update({ ...values, locked_at: null, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`name_job_update_failed:${error.message}`);
}

async function getStatus(supabase: any) {
  const statuses = ["pending", "processing", "success", "not_found", "error", "duplicate_hidden"] as const;
  const entries = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase
      .from("restaurant_directory_name_jobs")
      .select("restaurant_id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    return [status, count || 0] as const;
  }));
  return Object.fromEntries(entries);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const log = makeLogger("verify-directory-commercial-names");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");

    if (mode === "status") {
      return jsonResponse({ success: true, jobs: await getStatus(supabase) }, 200, corsHeaders);
    }
    if (mode !== "process_batch") throw new HttpError(400, "Invalid mode");

    const { data: claimed, error: claimError } = await supabase.rpc("service_claim_directory_name_jobs", {
      p_limit: boundedBatchSize(body?.limit),
    });
    if (claimError) throw new Error(`name_claim_failed:${claimError.message}`);

    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    let resolved = 0;
    let notFound = 0;
    let errors = 0;

    for (const restaurantId of restaurantIds) {
      try {
        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id,name,legal_name,address,city,directory_source_reference,is_directory_listing,directory_public_name_verified,directory_public_name_source")
          .eq("id", restaurantId)
          .maybeSingle();
        if (restaurantError) throw new Error(restaurantError.message);
        if (!restaurant || restaurant.is_directory_listing !== true) {
          await updateJob(supabase, restaurantId, { status: "success", next_attempt_at: null, last_error: null });
          continue;
        }
        const row = restaurant as RestaurantRow;
        if (row.directory_public_name_verified === true) {
          await updateJob(supabase, restaurantId, { status: "success", next_attempt_at: null, last_error: null });
          resolved++;
          continue;
        }
        if (row.directory_public_name_source === "duplicate_legal_entity_hidden") {
          await updateJob(supabase, restaurantId, { status: "duplicate_hidden", next_attempt_at: null, last_error: null });
          continue;
        }

        const candidate = await resolveCommercialName(supabase, row);
        if (!candidate) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryDelayIso("not_found"),
            last_error: "commercial_name_not_verified",
          });
          notFound++;
          continue;
        }

        const oldLegalName = String(row.legal_name || row.name).trim();
        const { data: updated, error: updateError } = await supabase
          .from("restaurants")
          .update({
            legal_name: oldLegalName || null,
            name: candidate.name,
            directory_public_name_verified: true,
            directory_public_name_source: candidate.source,
            directory_public_name_source_url: candidate.pageUrl,
            directory_public_name_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", restaurantId)
          .eq("is_directory_listing", true)
          .eq("directory_public_name_verified", false)
          .select("id")
          .maybeSingle();
        if (updateError) throw new Error(`commercial_name_update_failed:${updateError.message}`);
        if (!updated) throw new Error("commercial_name_update_lost_race");

        await updateJob(supabase, restaurantId, {
          status: "success",
          next_attempt_at: null,
          last_error: null,
          source_page_url: candidate.pageUrl,
          resolved_name: candidate.name,
          resolution_source: candidate.source,
        });
        resolved++;
      } catch (error) {
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        errors++;
        try {
          await updateJob(supabase, restaurantId, {
            status: "error",
            next_attempt_at: retryDelayIso("error"),
            last_error: message,
          });
        } catch (jobError) {
          log.error("name_job_failure_persist_failed", {
            restaurant_id: restaurantId,
            message: jobError instanceof Error ? jobError.message : "unknown",
          });
        }
        log.warn("directory_commercial_name_verification_failed", { restaurant_id: restaurantId, message });
      }
    }

    const result = {
      success: true,
      engine: "native_commercial_name_verifier",
      claimed: restaurantIds.length,
      resolved,
      not_found: notFound,
      errors,
      jobs: await getStatus(supabase),
    };

    await writeAuditLog({
      adminClient: supabase,
      actor,
      request: req,
      functionName: "verify-directory-commercial-names",
      action: "directory_commercial_name_verification_batch",
      status: "success",
      targetEntityType: "restaurants",
      metadata: {
        source: String(body?.source || "manual"),
        claimed: restaurantIds.length,
        resolved,
        not_found: notFound,
        errors,
      },
    });

    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof HttpError ? error.status : 500,
      corsHeaders,
    );
  }
});
