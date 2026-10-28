// Import-free on purpose: shared by Edge Functions, the Studio preview and the
// browser first-touch capture. Convention: docs/marketing/analytics-evidence.md.

export const MARKETING_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type MarketingUtmKey = typeof MARKETING_UTM_KEYS[number];
export type MarketingUtm = Partial<Record<MarketingUtmKey, string>>;

/** Same pattern as marketing_utm_plans and marketing_acquisition_touches. */
export const MARKETING_UTM_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
export const TOK_PUBLIC_HOSTS: ReadonlySet<string> = new Set(["www.thetok.ch", "thetok.ch"]);
export const META_UTM_MEDIUM = "social";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z0-9-]{1,63}$/;
const PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,199}$/;
const MAX_CAMPAIGN_SLUG_LENGTH = 60;

function foldAscii(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Lowercase, accent-free and bounded, or null: never a value the database would reject. */
export function normalizeUtmValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = foldAscii(value.trim()).replace(/\s+/g, "-");
  return MARKETING_UTM_VALUE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeUtm(value: unknown): MarketingUtm {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const utm: MarketingUtm = {};
  for (const key of MARKETING_UTM_KEYS) {
    const normalized = normalizeUtmValue(input[key]);
    if (normalized) utm[key] = normalized;
  }
  return utm;
}

export function readUtmFromSearch(search: string | URLSearchParams): MarketingUtm {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return normalizeUtm(Object.fromEntries(MARKETING_UTM_KEYS.map((key) => [key, params.get(key)])));
}

/** Host only: a referrer URL can carry search terms, tokens or personal paths. */
export function normalizeReferrerHost(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let host = value.trim().toLowerCase();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
      const url = new URL(host);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      host = url.hostname;
    }
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  return HOST_PATTERN.test(host) ? host : null;
}

/** Pathname only: query strings and fragments may contain personal data. */
export function normalizeLandingPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0];
  return PATH_PATTERN.test(path) ? path : null;
}

export function hasUtmParameters(url: URL) {
  return Array.from(url.searchParams.keys()).some((key) => key.toLowerCase().startsWith("utm_"));
}

export function marketingCampaignSlug(name: unknown) {
  const slug = foldAscii(typeof name === "string" ? name : "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_CAMPAIGN_SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug || "tok";
}

/** Calendar month in Switzerland, so a post scheduled on the 1st at 00:30 belongs to that month. */
export function zurichYearMonth(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit" })
    .formatToParts(at);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return `${year}${month}`;
}

/**
 * utm_content is the calendar item id: the server resolves the campaign from
 * that published item, never from a campaign value supplied by a browser.
 */
export function metaPublicationUtm(input: {
  channel: "instagram" | "facebook";
  campaignName?: string | null;
  itemId: string;
  at: Date;
}): MarketingUtm | null {
  if (!UUID_PATTERN.test(input.itemId) || !Number.isFinite(input.at.getTime())) return null;
  const utm = normalizeUtm({
    utm_source: input.channel,
    utm_medium: META_UTM_MEDIUM,
    utm_campaign: `${marketingCampaignSlug(input.campaignName)}_${zurichYearMonth(input.at)}`,
    utm_content: input.itemId,
  });
  return utm.utm_source && utm.utm_medium && utm.utm_campaign && utm.utm_content ? utm : null;
}

/** Adds UTMs to a TOK public link only; other hosts and already tagged links are returned unchanged. */
export function withTokUtm(rawUrl: string, utm: MarketingUtm) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !TOK_PUBLIC_HOSTS.has(url.hostname.toLowerCase()) || hasUtmParameters(url)) return rawUrl;
  const entries = MARKETING_UTM_KEYS.flatMap((key) => {
    const value = normalizeUtmValue(utm[key]);
    return value ? [[key, value] as const] : [];
  });
  if (!entries.length) return rawUrl;
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return url.toString();
}

/** Destinations are chosen upstream from the public catalog; tagging never changes host or path. */
export function tagTokUrlsInText(text: string, utm: MarketingUtm) {
  return text.replace(/https?:\/\/[^\s<>"']+/g, (match) => {
    const [, core, trailing] = match.match(/^(.*?)([),.;:!?]*)$/) || [match, match, ""];
    return `${withTokUtm(core, utm)}${trailing}`;
  });
}

export type AcquisitionTouch = {
  utm: MarketingUtm;
  referrerHost: string | null;
  landingPath: string | null;
  touchedAt: string;
};

/** Defensive decoding shared by the browser store and the ingestion endpoint. */
export function normalizeAcquisitionTouch(value: unknown): AcquisitionTouch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const utm = normalizeUtm(input.utm && typeof input.utm === "object" ? input.utm : input);
  const referrerHost = normalizeReferrerHost(input.referrerHost ?? input.referrer_host);
  const landingPath = normalizeLandingPath(input.landingPath ?? input.landing_path);
  const rawTouchedAt = input.touchedAt ?? input.touched_at;
  const touchedAtMs = typeof rawTouchedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rawTouchedAt)
    ? Date.parse(rawTouchedAt)
    : Number.NaN;
  // A campaign touch needs its source; a referral needs its host.
  if (!utm.utm_source) {
    for (const key of MARKETING_UTM_KEYS) delete utm[key];
  }
  if ((!utm.utm_source && !referrerHost) || !Number.isFinite(touchedAtMs)) return null;
  return { utm, referrerHost, landingPath, touchedAt: new Date(touchedAtMs).toISOString() };
}
