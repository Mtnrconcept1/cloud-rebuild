import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "enrich-thefork-images";
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const RESTAURANT_IMAGE_BUCKET = "restaurant-images";
const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 6;
const MAX_HTML_CHARACTERS = 1_000_000;
const MAX_ROBOTS_CHARACTERS = 160_000;
const MAX_PAGES_PER_SITE = 4;
const MAX_IMAGE_CANDIDATES = 12;
const FETCH_TIMEOUT_MS = 7_000;
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_STORED_IMAGE_BYTES = 7_500_000;
const MIN_STORED_IMAGE_BYTES = 12_000;
const USER_AGENT = "TOK-TheFork-Recovery/1.0 (+https://www.thetok.ch)";

const REJECTED_SITE_HOSTS = [
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
];

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
  "dummy",
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

const PAGE_LINK_KEYWORDS = [
  "restaurant",
  "gallery",
  "galerie",
  "photo",
  "photos",
  "cuisine",
  "food",
  "menu",
  "carte",
  "about",
  "a-propos",
  "concept",
];

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
  website: string | null;
  email: string | null;
  attempt_number: number;
};

type LeadHints = {
  website: string | null;
  email: string | null;
};

type DiscoveryMethod = "catalog_website" | "business_email_domain" | "verified_search_result";

type CrawledPage = {
  url: string;
  html: string;
  identityScore: number;
  discoveryMethod: DiscoveryMethod;
};

type ImageCandidate = {
  imageUrl: string;
  pageUrl: string;
  score: number;
};

type DownloadedImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  finalUrl: string;
};

type IdentityScore = {
  score: number;
  nameMatched: boolean;
  cityMatched: boolean;
  addressMatched: boolean;
};

type RobotsRule = { allow: boolean; path: string };
type RobotsPolicy = { rules: RobotsRule[]; crawlDelayMs: number; denyAll: boolean };

const dnsSafetyCache = new Map<string, Promise<boolean>>();
const robotsCache = new Map<string, Promise<RobotsPolicy>>();
const lastRequestAt = new Map<string, number>();

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
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return normalized.split(".").includes("thefork");
}

function isRejectedSiteHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  if (isTheForkHost(normalized)) return true;
  return REJECTED_SITE_HOSTS.some(
    (blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`),
  );
}

function isLikelyOfficialRestaurantHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  if (!normalized || isRejectedSiteHost(normalized)) return false;
  if (normalized.endsWith(".wixsite.com") || normalized.endsWith(".wordpress.com")) return true;
  return normalized.includes(".") && !normalized.endsWith("supabase.co");
}

function normalizeHttpUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function canonicalPageUrl(value: unknown) {
  const url = normalizeHttpUrl(String(value || ""));
  if (!url || isRejectedSiteHost(url.hostname)) return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function businessEmailDomain(email: string | null) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain || FREE_EMAIL_DOMAINS.has(domain) || isRejectedSiteHost(domain)) return null;
  return domain;
}

function getLeadHints(job: ClaimRow): LeadHints {
  return {
    website: String(job.website || "").trim() || null,
    email: String(job.email || "").trim() || null,
  };
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

function looksLikeUsableImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (!/^https?:\/\//i.test(value)) return false;
  if (/\.(?:svg|gif)(?:$|[?#])/i.test(value)) return false;
  if (REJECTED_IMAGE_PARTS.some((part) => lower.includes(part))) return false;
  const dimensionMatch = lower.match(/(?:^|[,/_-])w[_=-]?(\d{2,4})[,/_-]+h[_=-]?(\d{2,4})/);
  if (dimensionMatch) {
    const width = Number(dimensionMatch[1]);
    const height = Number(dimensionMatch[2]);
    if (width < 500 || height < 300) return false;
  }
  return true;
}

function normalizeImageDeliveryUrl(value: string) {
  try {
    const url = new URL(value);
    if (hostOf(url.toString()).endsWith("static.wixstatic.com")) {
      url.pathname = url.pathname
        .replace(/,enc_avif(?=,|\/|$)/g, "")
        .replace(/enc_avif,(?=[^/])/g, "");
    }
    return url.toString();
  } catch {
    return value;
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

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
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
  const rules: RobotsRule[] = [];
  let relevant = false;
  let crawlDelayMs = 250;
  let denyAll = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
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
    if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) crawlDelayMs = Math.min(10_000, seconds * 1000);
    }
  }

  return { rules, crawlDelayMs, denyAll };
}

async function getRobotsPolicy(url: URL) {
  const origin = url.origin;
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const robotsUrl = new URL("/robots.txt", origin);
        const { response } = await fetchPublic(robotsUrl, { timeoutMs: 4_000 });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: 250, denyAll: false };
        }
        return parseRobotsPolicy(await responseTextLimited(response, MAX_ROBOTS_CHARACTERS));
      } catch {
        return { rules: [], crawlDelayMs: 250, denyAll: false };
      }
    })());
  }
  return await robotsCache.get(origin)!;
}

function robotsAllows(policy: RobotsPolicy, url: URL) {
  if (policy.denyAll && policy.rules.every((rule) => !rule.allow)) return false;
  const target = `${url.pathname}${url.search}`;
  const matches = policy.rules
    .filter((rule) => rule.path && target.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matches.length === 0 ? true : matches[0].allow;
}

async function respectCrawlDelay(url: URL, delayMs: number) {
  const key = url.origin;
  const last = lastRequestAt.get(key) || 0;
  const wait = Math.max(0, last + delayMs - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt.set(key, Date.now());
}

async function fetchHtmlPage(input: string | URL) {
  const initialUrl = input instanceof URL ? new URL(input) : new URL(input);
  if (isRejectedSiteHost(initialUrl.hostname)) return null;
  const policy = await getRobotsPolicy(initialUrl);
  if (!robotsAllows(policy, initialUrl)) return null;
  await respectCrawlDelay(initialUrl, policy.crawlDelayMs);

  try {
    const { response, finalUrl } = await fetchPublic(initialUrl, { timeoutMs: FETCH_TIMEOUT_MS });
    if (isRejectedSiteHost(finalUrl.hostname)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
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

function scoreSiteIdentity(job: ClaimRow, html: string, pageUrl: string): IdentityScore {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const blob = normalizeText(`${titleMatch?.[1] || ""} ${stripHtml(html).slice(0, 140_000)} ${pageUrl}`);
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
  const nameRatio = nameTokens.length > 0 ? matchingNameTokens / nameTokens.length : 0;
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

function extractInternalLinks(pageUrl: string, html: string) {
  const base = new URL(pageUrl);
  const output = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const resolved = resolvePageUrl(raw, pageUrl);
    if (!resolved) continue;
    const url = new URL(resolved);
    if (url.hostname !== base.hostname) continue;
    const blob = normalizeText(`${url.pathname} ${raw}`);
    if (!PAGE_LINK_KEYWORDS.some((keyword) => blob.includes(normalizeText(keyword)))) continue;
    url.search = "";
    url.hash = "";
    output.add(url.toString());
    if (output.size >= MAX_PAGES_PER_SITE - 1) break;
  }
  return [...output];
}

function imageCandidateScore(page: CrawledPage, url: string, source: string, attrs: Record<string, string>) {
  let score = Math.min(6, page.identityScore);
  if (source === "og" || source === "jsonld") score += 9;
  else if (source === "twitter") score += 8;
  else if (source === "image_src") score += 7;
  else if (source === "css") score += 4;
  else score += 2;
  const lower = url.toLowerCase();
  if (/restaurant|interior|terrace|food|dish|plate|gallery|galerie|cuisine|hero|banner/.test(lower)) score += 3;
  const alt = normalizeText(`${attrs.alt || ""} ${attrs.title || ""}`);
  if (/restaurant|interior|terrace|plat|menu|food|dish|cuisine/.test(alt)) score += 2;
  return score;
}

function extractImageCandidates(job: ClaimRow, page: CrawledPage): ImageCandidate[] {
  const candidates = new Map<string, ImageCandidate>();
  const add = (rawUrl: string | undefined, source: string, attrs: Record<string, string> = {}) => {
    if (!rawUrl) return;
    const resolved = resolvePageUrl(rawUrl, page.url);
    if (!resolved) return;
    const normalized = normalizeImageDeliveryUrl(resolved);
    if (!looksLikeUsableImageUrl(normalized)) return;
    const sourceHost = hostOf(page.url);
    const imageHost = hostOf(normalized);
    if (isRejectedSiteHost(sourceHost) || isRejectedSiteHost(imageHost)) return;
    const alt = normalizeText(`${attrs.alt || ""} ${attrs.title || ""}`);
    if (REJECTED_IMAGE_PARTS.some((part) => alt.includes(part))) return;
    const score = imageCandidateScore(page, normalized, source, attrs);
    const existing = candidates.get(normalized);
    if (!existing || score > existing.score) candidates.set(normalized, { imageUrl: normalized, pageUrl: page.url, score });
  };

  for (const match of page.html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key === "og:image" || key === "og:image:url") add(attrs.content, "og", attrs);
    if (key === "twitter:image" || key === "twitter:image:src") add(attrs.content, "twitter", attrs);
  }

  for (const match of page.html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    if ((attrs.rel || "").toLowerCase().includes("image_src")) add(attrs.href, "image_src", attrs);
  }

  for (const match of page.html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0]);
    const srcset = attrs.srcset || attrs["data-srcset"] || "";
    const largestSrcset = srcset
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1);
    add(largestSrcset || attrs.src || attrs["data-src"] || attrs["data-lazy-src"], "img", attrs);
  }

  for (const match of page.html.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/gi)) {
    add(match[1] ?? match[2] ?? match[3], "css");
  }

  for (const script of page.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(script[1]);
      const stack: unknown[] = [parsed];
      let visited = 0;
      while (stack.length > 0 && visited < 400) {
        visited += 1;
        const node = stack.pop();
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        if (!node || typeof node !== "object") continue;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (["image", "contentUrl", "thumbnailUrl"].includes(key)) {
            if (typeof value === "string") add(value, "jsonld");
            if (value && typeof value === "object" && !Array.isArray(value)) {
              const record = value as Record<string, unknown>;
              for (const imageKey of ["url", "contentUrl", "thumbnailUrl"]) {
                if (typeof record[imageKey] === "string") add(String(record[imageKey]), "jsonld");
              }
            }
          }
          if (value && typeof value === "object") stack.push(value);
        }
      }
    } catch {
      // Ignore malformed JSON-LD from third-party sites.
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.score >= 8)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_IMAGE_CANDIDATES);
}

async function crawlOfficialSite(job: ClaimRow, input: string, discoveryMethod: DiscoveryMethod) {
  const initial = normalizeHttpUrl(input);
  if (!initial || !isLikelyOfficialRestaurantHost(initial.hostname)) return null;

  let homepage = await fetchHtmlPage(initial);
  if (!homepage && initial.protocol === "https:") {
    const fallback = new URL(initial);
    fallback.protocol = "http:";
    homepage = await fetchHtmlPage(fallback);
  }
  if (!homepage) return null;

  const identity = scoreSiteIdentity(job, homepage.html, homepage.url);
  const requiredScore = discoveryMethod === "verified_search_result" ? 8 : 6;
  if (!identity.nameMatched || identity.score < requiredScore) return null;
  if (discoveryMethod === "verified_search_result" && !identity.addressMatched && !identity.cityMatched) return null;

  const pages: CrawledPage[] = [{ ...homepage, identityScore: identity.score, discoveryMethod }];
  for (const link of extractInternalLinks(homepage.url, homepage.html)) {
    const page = await fetchHtmlPage(link);
    if (!page) continue;
    const pageIdentity = scoreSiteIdentity(job, page.html, page.url);
    if (!pageIdentity.nameMatched || pageIdentity.score < 5) continue;
    pages.push({ ...page, identityScore: pageIdentity.score, discoveryMethod });
    if (pages.length >= MAX_PAGES_PER_SITE) break;
  }

  const candidates = pages.flatMap((page) => extractImageCandidates(job, page));
  candidates.sort((left, right) => right.score - left.score);
  return { homepage: pages[0], candidates };
}

async function discoverOfficialSiteWithSearch(job: ClaimRow) {
  const apiKey = env("FIRECRAWL_API_KEY");
  if (!apiKey || !String(job.restaurant_address || "").trim()) return null;

  const query = `"${job.restaurant_name}" "${job.restaurant_address}" ${job.restaurant_city || "Genève"} restaurant official`;
  let payload: any;
  try {
    const response = await fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        sources: ["web"],
        limit: 8,
        location: "Geneva,Switzerland",
        country: "CH",
        safe: true,
      }),
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }

  const webResults = Array.isArray(payload?.data?.web) ? payload.data.web : [];
  const verifiedOfficialPages: CrawledPage[] = [];
  for (const result of webResults) {
    const pageUrl = canonicalPageUrl(result?.url);
    if (!pageUrl) continue;
    const host = hostOf(pageUrl);
    if (!isLikelyOfficialRestaurantHost(host)) continue;
    const crawled = await crawlOfficialSite(job, pageUrl, "verified_search_result");
    if (!crawled) continue;
    verifiedOfficialPages.push(crawled.homepage);
    if (crawled.candidates.length > 0) return crawled;
  }

  return verifiedOfficialPages.length > 0
    ? { homepage: verifiedOfficialPages[0], candidates: [] as ImageCandidate[] }
    : null;
}

async function downloadImage(candidate: ImageCandidate): Promise<DownloadedImage | null> {
  const imageUrl = normalizeImageDeliveryUrl(candidate.imageUrl);
  try {
    const { response, finalUrl } = await fetchPublic(imageUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { Accept: "image/webp,image/png,image/jpeg;q=0.95,*/*;q=0.1" },
    });
    const finalHost = hostOf(finalUrl.toString());
    if (isRejectedSiteHost(finalHost)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("image_redirected_to_rejected_host");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const supported = contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp";
    if (!supported) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < MIN_STORED_IMAGE_BYTES || bytes.byteLength > MAX_STORED_IMAGE_BYTES) return null;
    const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
    return {
      bytes,
      contentType: contentType as DownloadedImage["contentType"],
      extension,
      finalUrl: finalUrl.toString(),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "image_redirected_to_rejected_host") throw error;
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function persistRestaurantImage(
  supabase: any,
  job: ClaimRow,
  candidate: ImageCandidate,
  downloaded: DownloadedImage,
) {
  const hash = await sha256Hex(downloaded.bytes);
  const storagePath = `thefork-recovery/${job.restaurant_id}/${hash.slice(0, 24)}.${downloaded.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(RESTAURANT_IMAGE_BUCKET)
    .upload(storagePath, downloaded.bytes, {
      contentType: downloaded.contentType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw new Error(`storage_upload_failed:${uploadError.message}`);

  const { data: publicData } = supabase.storage.from(RESTAURANT_IMAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = String(publicData?.publicUrl || "").trim();
  if (!publicUrl) throw new Error("storage_public_url_missing");

  const { error: restaurantError } = await supabase
    .from("restaurants")
    .update({ image_url: publicUrl })
    .eq("id", job.restaurant_id);
  if (restaurantError) throw new Error(`restaurant_candidate_update_failed:${restaurantError.message}`);

  const { data: quarantine, error: quarantineError } = await supabase
    .from("restaurant_image_truth_reviews")
    .select("id, status")
    .eq("restaurant_id", job.restaurant_id)
    .eq("candidate_url", publicUrl)
    .limit(1)
    .maybeSingle();
  if (quarantineError || !quarantine) throw new Error("quarantine_not_created");

  return {
    publicUrl,
    storagePath,
    imageHash: hash,
    quarantineStatus: quarantine.status,
    metadata: {
      provider: "verified_official_site",
      source_page_url: candidate.pageUrl,
      source_image_url: candidate.imageUrl,
      final_image_url: downloaded.finalUrl,
    },
  };
}

async function recoverRestaurantImage(supabase: any, job: ClaimRow) {
  const hints = getLeadHints(job);
  const knownSources: Array<{ value: string; method: DiscoveryMethod }> = [];
  if (hints.website) knownSources.push({ value: hints.website, method: "catalog_website" });
  const emailDomain = businessEmailDomain(hints.email);
  if (emailDomain) knownSources.push({ value: emailDomain, method: "business_email_domain" });

  for (const source of knownSources) {
    const crawled = await crawlOfficialSite(job, source.value, source.method);
    if (!crawled) continue;
    for (const candidate of crawled.candidates) {
      const downloaded = await downloadImage(candidate);
      if (!downloaded) continue;
      const stored = await persistRestaurantImage(supabase, job, candidate, downloaded);
      return { candidate, stored };
    }
  }

  const searched = await discoverOfficialSiteWithSearch(job);
  if (searched) {
    for (const candidate of searched.candidates) {
      const downloaded = await downloadImage(candidate);
      if (!downloaded) continue;
      const stored = await persistRestaurantImage(supabase, job, candidate, downloaded);
      return { candidate, stored };
    }
  }

  return null;
}

async function updateJob(
  supabase: any,
  job: ClaimRow,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("restaurant_directory_image_jobs")
    .update({
      locked_at: null,
      updated_at: new Date().toISOString(),
      ...values,
    })
    .eq("restaurant_id", job.restaurant_id);
  if (error) throw new Error(`job_update_failed:${error.message}`);
}

async function processOne(supabase: any, job: ClaimRow) {
  try {
    const result = await recoverRestaurantImage(supabase, job);
    if (!result) {
      await updateJob(supabase, job, {
        status: "not_found",
        next_attempt_at: null,
        last_error: "thefork_recovery:permanent:no_verified_official_image",
      });
      return { restaurant_id: job.restaurant_id, status: "not_found" };
    }

    await updateJob(supabase, job, {
      status: "success",
      next_attempt_at: null,
      source_page_url: result.candidate.pageUrl,
      source_image_url: result.candidate.imageUrl,
      last_error: null,
    });
    return { restaurant_id: job.restaurant_id, status: "candidate_queued" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const permanent = message === "image_redirected_to_rejected_host";
    await updateJob(supabase, job, {
      status: permanent ? "not_found" : "error",
      next_attempt_at: permanent ? null : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      last_error: permanent
        ? `thefork_recovery:permanent:${message}`.slice(0, 500)
        : `thefork_recovery:transient:${message}`.slice(0, 500),
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
      "service_claim_thefork_image_discovery_jobs",
      { p_limit: limit },
    );
    if (claimError) return json({ success: false, error: `claim_failed:${claimError.message}` }, 500);

    const jobs = (claimed || []) as ClaimRow[];
    const results = await mapWithConcurrency(jobs, 3, (job) => processOne(supabase, job));
    const candidateQueued = results.filter((result: any) => result?.status === "candidate_queued").length;
    const notFound = results.filter((result: any) => result?.status === "not_found").length;
    const errors = results.filter((result: any) => result?.status === "error").length;

    try {
      await supabase.from("edge_function_audit_logs").insert({
        function_name: FUNCTION_NAME,
        action: "thefork_image_recovery_batch",
        actor_user_id: null,
        actor_roles: ["scheduler"],
        is_service_role: true,
        status: errors > 0 ? "partial" : "success",
        target_entity_type: "restaurants",
        request_metadata: {
          source: String((body as any)?.source || "manual"),
          claimed: jobs.length,
          candidate_queued: candidateQueued,
          not_found: notFound,
          errors,
        },
      });
    } catch {
      // Audit is best effort; image pipeline state remains authoritative.
    }

    return json({
      success: true,
      claimed: jobs.length,
      candidate_queued: candidateQueued,
      not_found: notFound,
      errors,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({ fn: FUNCTION_NAME, msg: "request_failed", message }));
    return json({ success: false, error: message }, 500);
  }
});
