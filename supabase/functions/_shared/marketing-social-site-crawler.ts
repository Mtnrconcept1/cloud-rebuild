import { requestPinnedPublicHttp, waitForPublicHttpSignal } from "./pinned-public-http.ts";
import { isUnsafePublicHostname, resolveSafePublicUrl } from "./public-url-validation.ts";
import {
  canonicalizeSocialProfileUrl,
  extractSocialProfilesFromHtml,
  extractSocialWebsiteLinks,
  MAX_SOCIAL_PROFILE_CANDIDATES,
  type SocialProfileCandidate,
} from "./marketing-social-profile.ts";

export type SocialWebsiteCrawlStatus = "success" | "no_profiles" | "no_website" | "robots_blocked" | "error";
export type SocialWebsiteCrawlResult = {
  profiles: SocialProfileCandidate[];
  crawlStatus: SocialWebsiteCrawlStatus;
  visitedUrls: string[];
  diagnostics: string[];
  networkAttempted: boolean;
  retryAfter?: string;
};
export type SocialOriginReservation =
  | { kind: "reserved"; requestToken: string }
  | { kind: "cached"; robotsPolicy: SocialRobotsPolicy; robotsExpiresAt: string }
  | { kind: "deferred"; retryAfter: string };
export type SocialOriginCoordinator = {
  reserve: (input: { origin: string; kind: "robots" | "html"; signal: AbortSignal }) => Promise<SocialOriginReservation>;
  finish: (input: { origin: string; requestToken: string; robotsPolicy?: SocialRobotsPolicy; retryAfter?: string; signal: AbortSignal }) => Promise<{ nextAllowedAt: string }>;
};
export type SocialWebsiteCrawlOptions = { signal?: AbortSignal; budgetMs?: number; originCoordinator?: SocialOriginCoordinator };

const USER_AGENT_TOKEN = "TokSocialProfileBot";
const USER_AGENT = `${USER_AGENT_TOKEN}/1.0 (+https://www.thetok.ch; public restaurant social links)`;
const DEFAULT_BUDGET_MS = 12_000;
const HTML_TIMEOUT_MS = 6_000;
const ROBOTS_TIMEOUT_MS = 4_000;
const HTML_BYTES = 1_048_576;
const ROBOTS_BYTES = 262_144;
const MIN_REQUEST_INTERVAL_MS = 500;
const MAX_REDIRECTS = 3;
const MAX_ORIGINS = 250;
const ROBOTS_CACHE_MS = 30 * 60 * 1_000;
const MAX_ROBOTS_RULES = 1_000;
const MAX_ROBOTS_POLICY_CHARS = 32_768;
const FINISH_TIMEOUT_MS = 1_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const NEVER_CRAWL_HOSTS = [
  "instagram.com", "facebook.com", "fb.com", "fb.me", "fb.watch", "meta.com", "threads.com", "threads.net",
  "messenger.com", "whatsapp.com", "wa.me", "tiktok.com", "linkedin.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "linktr.ee", "bit.ly", "tinyurl.com",
];

type RobotsRule = { allow: boolean; path: string };
export type SocialRobotsPolicy = { rules: RobotsRule[]; crawlDelayMs: number; denyAll: boolean };
type OriginState = {
  tail: Promise<void>;
  pending: number;
  lastRequestAt: number | null;
  nextAllowedAt: number;
  robots?: SocialRobotsPolicy;
  robotsCoordinated?: boolean;
  robotsExpiresAt: number;
  robotsInFlight?: Promise<SocialRobotsPolicy>;
};
type CrawlContext = { signal: AbortSignal; deadlineAt: number; coordinator?: SocialOriginCoordinator; networkAttempted: boolean; halted: boolean };
type DocumentResult = { status: number; headers: Headers; text: string; policy?: SocialRobotsPolicy; policyExpiresAt?: number };
const originStates = new Map<string, OriginState>();

class CrawlError extends Error {
  constructor(public code: string, public retryAfter?: string) { super(code); }
}

function futureIso(timestamp: number) {
  return Number.isFinite(timestamp) && timestamp > Date.now() && timestamp < 8.64e15 ? new Date(timestamp).toISOString() : undefined;
}

function retryAfter(headers: Headers) {
  const value = headers.get("retry-after")?.trim();
  if (!value) return undefined;
  return futureIso(/^\d+(?:\.\d+)?$/.test(value) ? Date.now() + Number(value) * 1_000 : Date.parse(value));
}

function publicWebsiteUrl(input: string | URL, base?: URL) {
  const raw = input instanceof URL ? input.toString() : input.trim();
  // eslint-disable-next-line no-control-regex -- Do not accept URL parser repairs or embedded credentials.
  if (!raw || raw.length > 2_048 || /[\x00-\x20\x7f\\]/.test(raw)) throw new CrawlError("invalid_website_url");
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(base ? raw : raw.startsWith("//") ? `https:${raw}` : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`, base);
  } catch { throw new CrawlError("invalid_website_url"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) throw new CrawlError("unsafe_website_url");
  if (isUnsafePublicHostname(host)) throw new CrawlError("unsafe_or_private_host");
  if (NEVER_CRAWL_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) throw new CrawlError("social_or_redirector_host_not_crawled");
  url.hash = "";
  return url;
}

function originState(origin: string) {
  const existing = originStates.get(origin);
  if (existing) return existing;
  if (originStates.size >= MAX_ORIGINS) {
    const available = [...originStates].find(([, entry]) => entry.pending === 0 && !entry.robotsInFlight && entry.nextAllowedAt <= Date.now());
    if (available) originStates.delete(available[0]);
    else throw new CrawlError("site_pool_busy", futureIso(Date.now() + 60_000));
  }
  const state: OriginState = { tail: Promise.resolve(), pending: 0, lastRequestAt: null, nextAllowedAt: 0, robotsExpiresAt: 0 };
  originStates.set(origin, state);
  return state;
}

async function waitUntil(timestamp: number, context: CrawlContext) {
  if (context.signal.aborted) throw new CrawlError("crawl_cancelled");
  if (context.halted) throw new CrawlError("origin_coordination_failed");
  const delay = Math.max(0, timestamp - Date.now());
  if (delay + (context.coordinator ? FINISH_TIMEOUT_MS + 250 : 250) >= context.deadlineAt - Date.now()) throw new CrawlError("crawl_delay_deferred", futureIso(timestamp));
  if (delay === 0) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); context.signal.removeEventListener("abort", abort); reject(new CrawlError("crawl_cancelled")); };
    const timer = setTimeout(() => { context.signal.removeEventListener("abort", abort); resolve(); }, delay);
    context.signal.addEventListener("abort", abort, { once: true });
    if (context.signal.aborted) abort();
  });
}

/** One request per origin, including concurrent restaurants sharing a website. */
async function requestDocument(url: URL, kind: "robots" | "html", context: CrawlContext): Promise<DocumentResult> {
  const state = originState(url.origin);
  state.pending++;
  const pending = state.tail.then(async () => {
    try {
      await waitUntil(context.coordinator && kind === "robots" ? 0 : state.nextAllowedAt, context);
      let requestToken: string | undefined;
      if (context.coordinator) {
        for (let attempt = 0; attempt < 4; attempt++) {
          let reservation: SocialOriginReservation;
          try {
            reservation = await waitForPublicHttpSignal(context.coordinator.reserve({ origin: url.origin, kind, signal: context.signal }), context.signal);
          } catch { context.halted = true; throw new CrawlError("origin_coordination_failed"); }
          if (reservation?.kind === "cached" && kind === "robots") {
            const expiresAt = Date.parse(reservation.robotsExpiresAt);
            if (!validSocialRobotsPolicy(reservation.robotsPolicy) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
              context.halted = true; throw new CrawlError("origin_coordination_failed");
            }
            return { status: 200, headers: new Headers(), text: "", policy: reservation.robotsPolicy, policyExpiresAt: expiresAt };
          }
          if (reservation?.kind === "reserved" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservation.requestToken)) {
            requestToken = reservation.requestToken;
            break;
          }
          if (reservation?.kind !== "deferred" || !futureIso(Date.parse(reservation.retryAfter))) {
            context.halted = true; throw new CrawlError("origin_coordination_failed");
          }
          if (attempt === 3) throw new CrawlError("crawl_delay_deferred", reservation.retryAfter);
          await waitUntil(Date.parse(reservation.retryAfter), context);
        }
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted) controller.abort();
      const timer = setTimeout(abort, Math.min(kind === "robots" ? ROBOTS_TIMEOUT_MS : HTML_TIMEOUT_MS,
        Math.max(1, context.deadlineAt - Date.now() - (context.coordinator ? FINISH_TIMEOUT_MS : 0))));
      state.lastRequestAt = Date.now();
      state.nextAllowedAt = state.lastRequestAt + (state.robots?.crawlDelayMs ?? MIN_REQUEST_INTERVAL_MS);
      let response: Response | undefined;
      let policy: SocialRobotsPolicy | undefined;
      let remoteRetryAfter: string | undefined;
      const readDocument = async (): Promise<DocumentResult> => {
        const target = await waitForPublicHttpSignal(resolveSafePublicUrl(url), controller.signal);
        context.networkAttempted = true;
        response = await requestPinnedPublicHttp(target, {
          method: "GET", signal: controller.signal, maxResponseBytes: kind === "robots" ? ROBOTS_BYTES : HTML_BYTES,
          headers: {
            "user-agent": USER_AGENT,
            "accept": kind === "robots" ? "text/plain" : "text/html,application/xhtml+xml",
            "accept-language": "fr-CH,fr;q=0.9,en;q=0.7",
          },
        });
        const headers = new Headers(response.headers);
        remoteRetryAfter = retryAfter(headers);
        if (remoteRetryAfter && !response.ok) state.nextAllowedAt = Math.max(state.nextAllowedAt, Date.parse(remoteRetryAfter));
        if (kind === "robots" && response.status === 404) policy = { rules: [], crawlDelayMs: MIN_REQUEST_INTERVAL_MS, denyAll: false };
        if (REDIRECTS.has(response.status) || !response.ok) return { status: response.status, headers, text: "", policy };
        const contentType = (headers.get("content-type") || "").toLowerCase();
        if (kind === "html" && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/.test(contentType)) throw new CrawlError("non_html_response");
        const maximum = kind === "robots" ? ROBOTS_BYTES : HTML_BYTES;
        const advertised = headers.get("content-length");
        if (advertised && Number(advertised) > maximum) throw new CrawlError("response_too_large");
        const text = await response.text();
        if (kind === "robots" && response.status === 200 && !/<(?:!doctype\s+html|html|title|body)\b/i.test(text)) policy = parseSocialRobotsPolicy(text);
        return { status: response.status, headers, text, policy };
      };
      let document: DocumentResult | undefined;
      let requestError: unknown;
      try { document = await readDocument(); }
      catch (error) { requestError = error; }
      await response?.body?.cancel().catch(() => undefined);
      clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
      if (requestToken && context.coordinator) {
        // Preserve the observed delay even after a user cancellation. This is a
        // bounded database cleanup inside the site deadline, never another HTTP read.
        const cleanup = new AbortController();
        const remaining = Math.min(FINISH_TIMEOUT_MS, context.deadlineAt - Date.now());
        const cleanupTimer = setTimeout(() => cleanup.abort(), Math.max(0, remaining));
        if (remaining <= 0) cleanup.abort();
        try {
          const finished = await waitForPublicHttpSignal(context.coordinator.finish({ origin: url.origin, requestToken,
            ...(policy ? { robotsPolicy: policy } : {}), ...(remoteRetryAfter ? { retryAfter: remoteRetryAfter } : {}), signal: cleanup.signal }), cleanup.signal);
          const nextAllowedAt = Date.parse(finished?.nextAllowedAt);
          if (!Number.isFinite(nextAllowedAt)) throw new Error("invalid_origin_deadline");
          state.nextAllowedAt = Math.max(state.nextAllowedAt, nextAllowedAt);
        } catch { context.halted = true; requestError = new CrawlError("origin_coordination_failed"); }
        finally { clearTimeout(cleanupTimer); }
      }
      if (requestError) throw requestError;
      if (!document) throw new CrawlError("website_fetch_failed");
      return document;
    } finally { state.pending--; }
  });
  state.tail = pending.then(() => undefined, () => undefined);
  // The inner public request observes the signal; allow its bounded finish to
  // persist the cooldown before returning the cancellation to the caller.
  return context.coordinator ? await pending : await waitForPublicHttpSignal(pending, context.signal);
}

function normalizeRobotsPath(value: string) {
  return value.replace(/%[0-9a-f]{2}/gi, (encoded) => {
    const character = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
    return /^[a-z0-9._~-]$/i.test(character) ? character : encoded.toUpperCase();
  }).replace(/[^\x21-\x7e]/gu, (character) => {
    try { return encodeURIComponent(character); } catch { return "%EF%BF%BD"; }
  });
}

/** Validate shared cache data before it can authorize an HTML request. */
export function validSocialRobotsPolicy(value: unknown): value is SocialRobotsPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).some((key) => !["rules", "crawlDelayMs", "denyAll"].includes(key))
    || typeof policy.denyAll !== "boolean" || typeof policy.crawlDelayMs !== "number"
    || !Number.isSafeInteger(policy.crawlDelayMs) || policy.crawlDelayMs < MIN_REQUEST_INTERVAL_MS
    || !Array.isArray(policy.rules) || policy.rules.length > MAX_ROBOTS_RULES) return false;
  for (const rule of policy.rules) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)
      || Object.keys(rule).some((key) => key !== "allow" && key !== "path")
      || typeof rule.allow !== "boolean" || typeof rule.path !== "string" || !rule.path || rule.path.length > 2_048
      || /[^\x21-\x7e]/.test(rule.path)) return false;
  }
  return JSON.stringify(policy).length <= MAX_ROBOTS_POLICY_CHARS;
}

export function parseSocialRobotsPolicy(text: string): SocialRobotsPolicy {
  if (text.length > ROBOTS_BYTES || text.split("\n", 10_001).length > 10_000) {
    return { rules: [], crawlDelayMs: MIN_REQUEST_INTERVAL_MS, denyAll: true };
  }
  type Group = { agents: string[]; rules: RobotsRule[]; delay: number };
  const groups: Group[] = [];
  let group: Group = { agents: [], rules: [], delay: MIN_REQUEST_INTERVAL_MS };
  let sawDirective = false;
  const flush = () => { if (group.agents.length) groups.push(group); group = { agents: [], rules: [], delay: MIN_REQUEST_INTERVAL_MS }; sawDirective = false; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") { if (sawDirective) flush(); group.agents.push(value.toLowerCase()); }
    else if (group.agents.length && (key === "allow" || key === "disallow")) {
      sawDirective = true;
      if (value) group.rules.push({ allow: key === "allow", path: normalizeRobotsPath(value) });
    } else if (group.agents.length && key === "crawl-delay") {
      sawDirective = true;
      if (/^\d+(?:\.\d+)?$/.test(value)) group.delay = Math.max(group.delay, Math.ceil(Number(value) * 1_000));
    }
  }
  flush();
  const token = USER_AGENT_TOKEN.toLowerCase();
  const specificity = (entry: Group) => Math.max(-1, ...entry.agents.map((agent) => agent === "*" ? 0 : agent && token.includes(agent) ? agent.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  const selected = best < 0 ? [] : groups.filter((entry) => specificity(entry) === best);
  const crawlDelayMs = Math.max(MIN_REQUEST_INTERVAL_MS, ...selected.map((entry) => entry.delay));
  const policy = { rules: selected.flatMap((entry) => entry.rules), crawlDelayMs, denyAll: false };
  if (validSocialRobotsPolicy(policy)) return policy;
  // An oversized policy is denied in full, never truncated into an accidental Allow.
  return { rules: [], crawlDelayMs: Number.isSafeInteger(crawlDelayMs) ? crawlDelayMs : Number.MAX_SAFE_INTEGER, denyAll: true };
}

/** Bounded wildcard matching avoids executing a regex supplied by a remote robots.txt. */
function robotsPathMatches(rule: string, path: string) {
  const end = rule.endsWith("$");
  const pattern = end ? rule.slice(0, -1) : rule;
  let input = 0;
  let cursor = 0;
  let star = -1;
  let retry = 0;
  while (input < path.length) {
    if (cursor === pattern.length && !end) return true;
    if (cursor < pattern.length && pattern[cursor] === "*") { star = cursor++; retry = input; }
    else if (cursor < pattern.length && pattern[cursor] === path[input]) { input++; cursor++; }
    else if (star >= 0) { cursor = star + 1; input = ++retry; }
    else return false;
  }
  while (pattern[cursor] === "*") cursor++;
  return cursor === pattern.length;
}

export function socialRobotsAllows(policy: SocialRobotsPolicy, url: URL) {
  if (policy.denyAll) return false;
  const path = normalizeRobotsPath(`${url.pathname}${url.search}` || "/");
  const matching = policy.rules.filter((rule) => robotsPathMatches(rule.path, path))
    .sort((left, right) => right.path.replace(/[*$]/g, "").length - left.path.replace(/[*$]/g, "").length || Number(right.allow) - Number(left.allow));
  return matching.length === 0 || matching[0].allow;
}

function redirectTarget(location: string | null, current: URL, count: number) {
  if (!location || count >= MAX_REDIRECTS) throw new CrawlError("redirect_limit");
  const next = publicWebsiteUrl(location, current);
  if (current.protocol === "https:" && next.protocol !== "https:") throw new CrawlError("unsafe_redirect_protocol");
  return next;
}

async function robotsPolicy(url: URL, context: CrawlContext) {
  const state = originState(url.origin);
  if (state.robots && state.robotsCoordinated === Boolean(context.coordinator) && state.robotsExpiresAt > Date.now()) return state.robots;
  if (!state.robotsInFlight) {
    const load = async () => {
      let current = new URL("/robots.txt", url.origin);
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const result = await requestDocument(current, "robots", context);
        if (REDIRECTS.has(result.status)) {
          const next = redirectTarget(result.headers.get("location"), current, redirects);
          // A cache/reservation belongs to its physical origin. Cross-origin
          // robots redirects require a separate ownership protocol; defer safely.
          if (next.origin !== url.origin) throw new CrawlError("robots_redirect_origin_unsupported");
          current = next;
          continue;
        }
        if (result.policy) {
          if (result.policyExpiresAt) state.robotsExpiresAt = result.policyExpiresAt;
          return result.policy;
        }
        if (result.status === 404) return { rules: [], crawlDelayMs: MIN_REQUEST_INTERVAL_MS, denyAll: false };
        if (result.status !== 200) throw new CrawlError(`robots_http_${result.status}`, retryAfter(result.headers));
        if (/<(?:!doctype\s+html|html|title|body)\b/i.test(result.text)) throw new CrawlError("robots_unreadable");
        return parseSocialRobotsPolicy(result.text);
      }
      throw new CrawlError("robots_redirect_limit");
    };
    state.robotsInFlight = load().then((policy) => {
      state.robots = policy;
      state.robotsCoordinated = Boolean(context.coordinator);
      state.robotsExpiresAt = Math.max(state.robotsExpiresAt, Date.now() + ROBOTS_CACHE_MS);
      if (state.lastRequestAt !== null) state.nextAllowedAt = Math.max(state.nextAllowedAt, state.lastRequestAt + policy.crawlDelayMs);
      return policy;
    }).finally(() => { state.robotsInFlight = undefined; });
  }
  return await waitForPublicHttpSignal(state.robotsInFlight, context.signal);
}

async function htmlPage(initial: URL, context: CrawlContext) {
  let current = initial;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    let policy: SocialRobotsPolicy;
    try { policy = await robotsPolicy(current, context); }
    catch (error) {
      if (error instanceof CrawlError && error.code.startsWith("robots_")) throw error;
      if (error instanceof CrawlError && error.code === "crawl_delay_deferred") throw error;
      if (error instanceof CrawlError && error.code === "origin_coordination_failed") throw error;
      throw new CrawlError("robots_unavailable");
    }
    if (!socialRobotsAllows(policy, current)) throw new CrawlError("robots_disallowed");
    const result = await requestDocument(current, "html", context);
    if (REDIRECTS.has(result.status)) { current = redirectTarget(result.headers.get("location"), current, redirects); continue; }
    if (result.status < 200 || result.status >= 300) throw new CrawlError(`website_http_${result.status}`, retryAfter(result.headers));
    const title = result.text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || "";
    if (/(?:just a moment|attention required|access denied|verify (?:that )?you are human|security verification)/i.test(title)) throw new CrawlError("website_access_challenge");
    return { url: current.toString(), html: result.text };
  }
  throw new CrawlError("redirect_limit");
}

/** Read only the supplied public website. Discovered Meta URLs are never requested. */
export async function crawlRestaurantSocialProfiles(
  website: string | null | undefined,
  options: SocialWebsiteCrawlOptions = {},
): Promise<SocialWebsiteCrawlResult> {
  const result: SocialWebsiteCrawlResult = { profiles: [], crawlStatus: "no_website", visitedUrls: [], diagnostics: [], networkAttempted: false };
  if (typeof website !== "string" || !website.trim()) return result;
  const suppliedProfile = canonicalizeSocialProfileUrl(website);
  if (suppliedProfile) return { ...result, crawlStatus: "success", profiles: [{ ...suppliedProfile, sourceUrl: suppliedProfile.url, context: "Lien social renseigné comme site web ; identité à vérifier" }], diagnostics: ["social_url_provided_as_website"] };
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  if (!Number.isFinite(budget) || budget < 1 || budget > DEFAULT_BUDGET_MS) return { ...result, crawlStatus: "error", diagnostics: ["invalid_crawl_budget"] };
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, budget);
  const context: CrawlContext = { signal: controller.signal, deadlineAt: Date.now() + budget, coordinator: options.originCoordinator, networkAttempted: false, halted: false };
  const profiles = new Map<string, SocialProfileCandidate>();
  const seen = new Set<string>();
  let failure = false;
  let robotsBlocked = false;
  const recordError = (error: unknown) => {
    let code = error instanceof CrawlError ? error.code : "website_fetch_failed";
    if (controller.signal.aborted) code = options.signal?.aborted ? "crawl_cancelled" : "crawl_timeout";
    else if (!(error instanceof CrawlError) && error instanceof Error && ["unsafe_or_private_host", "request_timeout", "http_response_body_too_large", "unsupported_http_content_encoding"].includes(error.message)) code = error.message;
    if (!result.diagnostics.includes(code)) result.diagnostics.push(code);
    if (code.startsWith("robots_")) robotsBlocked = true; else failure = true;
    if (error instanceof CrawlError && error.retryAfter) {
      result.retryAfter = result.retryAfter && result.retryAfter > error.retryAfter ? result.retryAfter : error.retryAfter;
    }
  };
  try {
    const queue: URL[] = [publicWebsiteUrl(website)];
    let pages = 0;
    while (queue.length && pages < 3 && profiles.size < MAX_SOCIAL_PROFILE_CANDIDATES) {
      const url = queue.shift()!;
      if (seen.has(url.toString())) continue;
      seen.add(url.toString());
      pages++;
      try {
        const page = await htmlPage(url, context);
        seen.add(page.url);
        result.visitedUrls.push(page.url);
        for (const profile of extractSocialProfilesFromHtml(page.html, page.url)) {
          if (profiles.size >= MAX_SOCIAL_PROFILE_CANDIDATES) break;
          const key = `${profile.platform}:${profile.canonicalKey}`;
          if (!profiles.has(key)) profiles.set(key, profile);
        }
        if (pages === 1) queue.push(...extractSocialWebsiteLinks(page.html, page.url).map((link) => publicWebsiteUrl(link)));
      } catch (error) { recordError(error); if (pages === 1 || controller.signal.aborted || context.halted) break; }
    }
  } catch (error) { recordError(error); }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
  result.profiles = [...profiles.values()];
  result.networkAttempted = context.networkAttempted;
  result.crawlStatus = failure ? "error" : robotsBlocked ? "robots_blocked" : result.profiles.length ? "success" : "no_profiles";
  return result;
}
