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
const MAX_HTML_CHARACTERS = 1_200_000;
const MAX_ROBOTS_CHARACTERS = 200_000;
const MAX_PAGES_PER_SITE = 4;
const MAX_DISCOVERY_CANDIDATES = 4;
const MAX_IMAGE_CANDIDATES = 10;
const MIN_DISCOVERED_SITE_SCORE = 7;
const MIN_EMAIL_SITE_SCORE = 4;
const MIN_IMAGE_SCORE = 10;
const FETCH_TIMEOUT_MS = 6_000;
const IMAGE_TIMEOUT_MS = 6_000;
const DEFAULT_CRAWL_DELAY_MS = 300;
const USER_AGENT = "TOK-Directory-Scraper/1.0 (+https://www.thetok.ch)";

const REJECTED_IMAGE_PARTS = [
  "logo",
  "favicon",
  "icon",
  "avatar",
  "sprite",
  "pixel",
  "tracking",
  "emoji",
  "badge",
  "placeholder",
  "default-image",
  "map-marker",
  "spinner",
  "loader",
  "payment",
  "social",
];

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
  "sa",
  "sàrl",
  "gmbh",
  "ag",
  "sagl",
  "ltd",
]);

const PAGE_LINK_KEYWORDS = [
  "menu",
  "carte",
  "gallery",
  "galerie",
  "photo",
  "photos",
  "restaurant",
  "cuisine",
  "food",
  "about",
  "a-propos",
  "concept",
];

const COMMON_PAGE_PATHS = ["/menu", "/carte", "/galerie", "/gallery", "/restaurant"];

type RestaurantRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  image_url: string | null;
  directory_source_reference: string | null;
  is_directory_listing: boolean;
};

type LeadHints = {
  website: string | null;
  email: string | null;
};

type WebsiteCandidate = {
  url: string;
  method: "catalog_website" | "business_email_domain" | "domain_guess";
};

type CrawledPage = {
  url: string;
  html: string;
  identityScore: number;
  discoveryMethod: WebsiteCandidate["method"];
};

type ImageCandidate = {
  imageUrl: string;
  pageUrl: string;
  score: number;
};

type RobotsRule = {
  allow: boolean;
  path: string;
};

type RobotsPolicy = {
  rules: RobotsRule[];
  crawlDelayMs: number;
  denyAll: boolean;
};

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

function normalizeHttpUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!/^(https?):$/.test(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isRejectedSiteHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return REJECTED_SITE_HOSTS.some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function looksLikeUsableImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (/\.(?:svg|gif)(?:$|[?#])/i.test(value)) return false;
  return !REJECTED_IMAGE_PARTS.some((part) => lower.includes(part));
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
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isPrivateIpv4(mapped);
  }
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
      if (records.length === 0) return false;
      return records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }

  return await dnsSafetyCache.get(host)!;
}

async function assertPublicUrl(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsafe_protocol");
  if (!await hostIsPublic(url.hostname)) throw new Error("unsafe_or_private_host");
}

async function fetchPublic(
  input: string | URL,
  options: { headers?: Record<string, string>; timeoutMs?: number; maxRedirects?: number } = {},
) {
  let current = input instanceof URL ? new URL(input) : new URL(input);
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        ...options.headers,
      },
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

  const agent = "tok-directory-scraper";
  const exact = groups.filter((group) => group.agents.some((value) => agent.includes(value) && value !== "*"));
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
        const robotsUrl = new URL("/robots.txt", origin);
        const { response } = await fetchPublic(robotsUrl, { timeoutMs: 4_000 });
        if (response.status === 404) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: false };
        }
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
        }
        const text = await responseTextLimited(response, MAX_ROBOTS_CHARACTERS);
        return parseRobotsPolicy(text);
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
    const { response, finalUrl } = await fetchPublic(initialUrl, { timeoutMs: FETCH_TIMEOUT_MS });
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
    return {
      url: finalUrl.toString(),
      html: await responseTextLimited(response, MAX_HTML_CHARACTERS),
    };
  } catch {
    return null;
  }
}

function scoreSiteIdentity(restaurant: RestaurantRow, html: string, pageUrl: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const blob = normalizeText(`${titleMatch?.[1] || ""} ${stripHtml(html).slice(0, 120_000)} ${pageUrl}`);
  const normalizedName = normalizeText(restaurant.name);
  const tokens = meaningfulNameTokens(restaurant.name);
  const normalizedCity = normalizeText(restaurant.city);
  const addressTokens = normalizeText(restaurant.address).split(" ").filter((token) => token.length >= 4).slice(0, 5);
  let score = 0;

  if (normalizedName && blob.includes(normalizedName)) score += 6;
  if (tokens.length > 0) {
    const matching = tokens.filter((token) => blob.includes(token)).length;
    const ratio = matching / tokens.length;
    if (ratio >= 0.75) score += 4;
    else if (ratio >= 0.5) score += 2;
  }
  if (normalizedCity && blob.includes(normalizedCity)) score += 2;
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

function guessedDomains(name: string, city: string | null) {
  const base = meaningfulNameTokens(name).join("-").slice(0, 55);
  if (!base) return [];
  const compact = base.replace(/-/g, "");
  const citySlug = normalizeText(city).replace(/\s+/g, "-");
  return [
    `${base}.ch`,
    compact && compact !== base ? `${compact}.ch` : "",
    citySlug ? `${base}-${citySlug}.ch` : "",
    `${base}.com`,
  ].filter(Boolean).slice(0, 3);
}

function websiteCandidates(restaurant: RestaurantRow, hints: LeadHints) {
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
  for (const domain of guessedDomains(restaurant.name, restaurant.city)) add(domain, "domain_guess");
  return candidates.slice(0, MAX_DISCOVERY_CANDIDATES);
}

async function discoverWebsite(restaurant: RestaurantRow, hints: LeadHints): Promise<CrawledPage | null> {
  for (const candidate of websiteCandidates(restaurant, hints)) {
    const page = await fetchHtmlPage(candidate.url);
    if (!page && candidate.url.startsWith("https://")) {
      const httpFallback = candidate.url.replace(/^https:\/\//i, "http://");
      const fallbackPage = await fetchHtmlPage(httpFallback);
      if (!fallbackPage) continue;
      const identityScore = scoreSiteIdentity(restaurant, fallbackPage.html, fallbackPage.url);
      const minimumScore = candidate.method === "catalog_website"
        ? 0
        : candidate.method === "business_email_domain" ? MIN_EMAIL_SITE_SCORE : MIN_DISCOVERED_SITE_SCORE;
      if (identityScore >= minimumScore) {
        return { ...fallbackPage, identityScore, discoveryMethod: candidate.method };
      }
      continue;
    }
    if (!page) continue;

    const identityScore = scoreSiteIdentity(restaurant, page.html, page.url);
    const minimumScore = candidate.method === "catalog_website"
      ? 0
      : candidate.method === "business_email_domain" ? MIN_EMAIL_SITE_SCORE : MIN_DISCOVERED_SITE_SCORE;
    if (identityScore >= minimumScore) {
      return { ...page, identityScore, discoveryMethod: candidate.method };
    }
  }
  return null;
}

function addJsonImageValues(node: unknown, output: string[], depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const value of node) addJsonImageValues(value, output, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (["image", "thumbnailurl", "contenturl"].includes(normalizedKey)) {
      if (typeof value === "string") output.push(value);
      else if (value && typeof value === "object") {
        const imageObject = value as Record<string, unknown>;
        for (const imageKey of ["url", "contentUrl", "thumbnailUrl"]) {
          if (typeof imageObject[imageKey] === "string") output.push(String(imageObject[imageKey]));
        }
      }
    }
    addJsonImageValues(value, output, depth + 1);
  }
}

function extractImageCandidates(
  restaurant: RestaurantRow,
  page: CrawledPage,
  officialHost: string,
): ImageCandidate[] {
  const candidates = new Map<string, ImageCandidate>();
  const add = (
    rawUrl: string | null | undefined,
    source: "og" | "twitter" | "jsonld" | "image_src" | "img",
    attrs: Record<string, string> = {},
  ) => {
    if (!rawUrl) return;
    const resolved = resolvePageUrl(rawUrl, page.url);
    if (!resolved || !looksLikeUsableImageUrl(resolved)) return;
    const imageHost = hostOf(resolved);
    const pageHost = hostOf(page.url);
    const altBlob = normalizeText(`${attrs.alt || ""} ${attrs.title || ""}`);
    if (REJECTED_IMAGE_PARTS.some((part) => altBlob.includes(part))) return;

    const sourceScore = source === "og" || source === "jsonld"
      ? 9
      : source === "twitter" ? 8 : source === "image_src" ? 7 : 2;
    let score = sourceScore + Math.min(4, page.identityScore);
    if (imageHost && imageHost === pageHost) score += 4;
    if (officialHost && imageHost === officialHost) score += 3;
    if (/food|dish|menu|plate|gallery|galerie|restaurant|cuisine|hero|banner/i.test(resolved)) score += 2;
    if (/restaurant|cuisine|plat|menu|food|dish/i.test(altBlob)) score += 2;
    const width = Number(attrs.width || 0);
    const height = Number(attrs.height || 0);
    if (width >= 800 && height >= 450) score += 3;
    else if (width >= 500 && height >= 300) score += 1;
    if (page.discoveryMethod === "catalog_website") score += 3;
    else if (page.discoveryMethod === "business_email_domain") score += 1;

    const existing = candidates.get(resolved);
    if (!existing || score > existing.score) candidates.set(resolved, { imageUrl: resolved, pageUrl: page.url, score });
  };

  for (const match of page.html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (["og:image", "og:image:url", "og:image:secure_url"].includes(key)) add(attrs.content, "og", attrs);
    if (["twitter:image", "twitter:image:src"].includes(key)) add(attrs.content, "twitter", attrs);
  }

  for (const match of page.html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    if ((attrs.rel || "").toLowerCase().split(/\s+/).includes("image_src")) add(attrs.href, "image_src", attrs);
  }

  for (const match of page.html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const source = attrs.src || attrs["data-src"] || attrs["data-lazy-src"] || attrs["data-original"];
    add(source, "img", attrs);
    if (attrs.srcset) {
      const choices = attrs.srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
      if (choices.length > 0) add(choices[choices.length - 1], "img", attrs);
    }
  }

  for (const match of page.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const jsonImages: string[] = [];
      addJsonImageValues(JSON.parse(match[1]), jsonImages);
      for (const image of jsonImages.slice(0, 12)) add(image, "jsonld");
    } catch {
      // Invalid publisher JSON-LD is ignored; other extraction paths remain available.
    }
  }

  return [...candidates.values()].filter((candidate) => candidate.score >= MIN_IMAGE_SCORE);
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
  const output = ranked.map((item) => item.url);
  for (const path of COMMON_PAGE_PATHS) {
    if (output.length >= MAX_PAGES_PER_SITE - 1) break;
    const guessed = new URL(path, pageUrl).toString();
    if (!seen.has(guessed)) output.push(guessed);
  }
  return output.slice(0, MAX_PAGES_PER_SITE - 1);
}

function responseTotalLength(response: Response) {
  const contentRange = response.headers.get("content-range");
  if (response.status === 206 && contentRange) {
    const totalMatch = contentRange.match(/\/(\d+)$/);
    const totalLength = Number(totalMatch?.[1] || 0);
    if (Number.isFinite(totalLength) && totalLength > 0) return totalLength;
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
}

async function validateImageUrl(imageUrl: string) {
  const url = normalizeHttpUrl(imageUrl);
  if (!url) return null;
  const policy = await getRobotsPolicy(url);
  if (!robotsAllows(policy, url)) return null;
  await respectCrawlDelay(url, policy.crawlDelayMs);

  try {
    const { response, finalUrl } = await fetchPublic(url, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      headers: {
        Range: "bytes=0-4095",
        Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
      },
    });
    const finalPolicy = finalUrl.origin === url.origin ? policy : await getRobotsPolicy(finalUrl);
    if (!robotsAllows(finalPolicy, finalUrl)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const totalLength = responseTotalLength(response);
    const validType = ["image/jpeg", "image/png", "image/webp", "image/avif"].some((type) => contentType.startsWith(type));
    const valid = response.ok && validType && (!totalLength || totalLength >= 8_000);
    await response.body?.cancel().catch(() => undefined);
    return valid ? finalUrl.toString() : null;
  } catch {
    return null;
  }
}

async function findBestImage(supabase: any, restaurant: RestaurantRow): Promise<ImageCandidate | null> {
  const hints = await getLeadHints(supabase, restaurant.directory_source_reference);
  const homepage = await discoverWebsite(restaurant, hints);
  if (!homepage) return null;

  const officialHost = hostOf(homepage.url);
  const pages: CrawledPage[] = [homepage];
  for (const link of extractInternalLinks(homepage.url, homepage.html)) {
    const crawled = await fetchHtmlPage(link);
    if (!crawled) continue;
    pages.push({
      ...crawled,
      identityScore: Math.max(homepage.identityScore, scoreSiteIdentity(restaurant, crawled.html, crawled.url)),
      discoveryMethod: homepage.discoveryMethod,
    });
    if (pages.length >= MAX_PAGES_PER_SITE) break;
  }

  const candidates = pages
    .flatMap((page) => extractImageCandidates(restaurant, page, officialHost))
    .sort((left, right) => right.score - left.score);

  const unique = [...new Map(candidates.map((candidate) => [candidate.imageUrl, candidate])).values()];
  for (const candidate of unique.slice(0, MAX_IMAGE_CANDIDATES)) {
    const validated = await validateImageUrl(candidate.imageUrl);
    if (validated) return { ...candidate, imageUrl: validated };
  }
  return null;
}

function retryDelayIso(kind: "not_found" | "error") {
  const delayMs = kind === "not_found" ? 24 * 60 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_image_jobs")
    .update({
      ...values,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`job_update_failed:${error.message}`);
}

async function getStatus(supabase: any) {
  const statuses = ["pending", "processing", "success", "not_found", "error"] as const;
  const entries = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase
      .from("restaurant_directory_image_jobs")
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

  const log = makeLogger("enrich-directory-images");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");

    if (mode === "status") {
      return jsonResponse({ success: true, jobs: await getStatus(supabase) }, 200, corsHeaders);
    }
    if (mode !== "process_batch") throw new HttpError(400, "Invalid mode");

    const limit = boundedBatchSize(body?.limit);
    const { data: claimed, error: claimError } = await supabase.rpc(
      "service_claim_directory_image_jobs",
      { p_limit: limit },
    );
    if (claimError) throw new Error(`claim_failed:${claimError.message}`);

    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    for (const restaurantId of restaurantIds) {
      try {
        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, address, city, image_url, directory_source_reference, is_directory_listing")
          .eq("id", restaurantId)
          .maybeSingle();
        if (restaurantError) throw new Error(restaurantError.message);
        if (!restaurant || restaurant.is_directory_listing !== true) {
          await updateJob(supabase, restaurantId, {
            status: "error",
            last_error: "directory_listing_missing",
            next_attempt_at: null,
          });
          errorCount++;
          continue;
        }

        const row = restaurant as RestaurantRow;
        if (String(row.image_url || "").trim()) {
          await updateJob(supabase, restaurantId, { status: "success", next_attempt_at: null, last_error: null });
          successCount++;
          continue;
        }

        const candidate = await findBestImage(supabase, row);
        if (!candidate) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryDelayIso("not_found"),
            last_error: null,
          });
          notFoundCount++;
          continue;
        }

        const { data: updatedRestaurant, error: updateError } = await supabase
          .from("restaurants")
          .update({ image_url: candidate.imageUrl, updated_at: new Date().toISOString() })
          .eq("id", restaurantId)
          .eq("is_directory_listing", true)
          .or("image_url.is.null,image_url.eq.")
          .select("id")
          .maybeSingle();
        if (updateError) throw new Error(`restaurant_image_update_failed:${updateError.message}`);

        if (!updatedRestaurant) {
          const { data: current } = await supabase
            .from("restaurants")
            .select("image_url")
            .eq("id", restaurantId)
            .maybeSingle();
          if (!String(current?.image_url || "").trim()) throw new Error("restaurant_image_update_lost_race");
        }

        await updateJob(supabase, restaurantId, {
          status: "success",
          next_attempt_at: null,
          last_error: null,
          source_page_url: candidate.pageUrl || null,
          source_image_url: candidate.imageUrl,
        });
        successCount++;
      } catch (error) {
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        errorCount++;
        try {
          await updateJob(supabase, restaurantId, {
            status: "error",
            next_attempt_at: retryDelayIso("error"),
            last_error: message,
          });
        } catch (jobError) {
          log.error("job_failure_persist_failed", {
            restaurant_id: restaurantId,
            message: jobError instanceof Error ? jobError.message : "unknown",
          });
        }
        log.warn("restaurant_image_scrape_failed", { restaurant_id: restaurantId, message });
      }
    }

    const result = {
      success: true,
      engine: "native_scraper",
      claimed: restaurantIds.length,
      enriched: successCount,
      not_found: notFoundCount,
      errors: errorCount,
      jobs: await getStatus(supabase),
    };

    await writeAuditLog({
      adminClient: supabase,
      actor,
      request: req,
      functionName: "enrich-directory-images",
      action: "directory_image_scraper_batch",
      status: "success",
      targetEntityType: "restaurants",
      metadata: {
        engine: "native_scraper",
        source: String(body?.source || "manual"),
        claimed: restaurantIds.length,
        enriched: successCount,
        not_found: notFoundCount,
        errors: errorCount,
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