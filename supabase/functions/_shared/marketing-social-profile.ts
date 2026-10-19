export type SocialProfilePlatform = "instagram" | "facebook";

export type CanonicalSocialProfile = {
  platform: SocialProfilePlatform;
  canonicalKey: string;
  url: string;
};

export type SocialProfileCandidate = CanonicalSocialProfile & {
  sourceUrl: string;
  context: string;
};

export const MAX_SOCIAL_PROFILE_CANDIDATES = 20;
const MAX_HTML_LENGTH = 1_048_576;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]);
const INSTAGRAM_ROUTES = new Set([
  "about", "accounts", "ads", "api", "ar", "challenge", "developer", "developers", "direct", "directory",
  "emails", "explore", "legal", "login", "oauth", "p", "press", "privacy", "reel", "reels", "session",
  "share", "stories", "terms", "tv", "web", "your_activity",
]);
const FACEBOOK_ROUTES = new Set([
  "about", "accounts", "ads", "ad_center", "ajax", "business", "checkpoint", "connect", "dialog", "events",
  "feed", "friends", "gaming", "groups", "help", "home.php", "l.php", "login", "login.php", "logout.php",
  "marketplace", "messages", "notifications", "oauth", "pages", "people", "permalink.php", "photo",
  "photo.php", "photos", "plugins", "policies", "privacy", "reel", "reels", "recover", "search", "settings",
  "share", "sharer", "sharer.php", "stories", "story.php", "terms", "video.php", "videos", "watch",
]);

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, entity: string) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? whole;
    const hex = entity[1].toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

function plainContext(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    // eslint-disable-next-line no-control-regex -- Context is inert, bounded display text.
    .replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function attribute(tag: string, name: string) {
  const expression = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+))", "i");
  const match = expression.exec(tag);
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "") : null;
}

/** A profile-shaped URL is a candidate, never proof of account ownership or privacy. */
export function canonicalizeSocialProfileUrl(
  value: unknown,
  expectedPlatform?: SocialProfilePlatform,
): CanonicalSocialProfile | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  const raw = decodeHtmlEntities(value.trim());
  // eslint-disable-next-line no-control-regex -- Reject URL parser repair of control bytes.
  if (!raw || /[\x00-\x20\x7f\\]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.pathname.includes("%") || /\/{2,}/.test(url.pathname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);

  if (INSTAGRAM_HOSTS.has(host) && (!expectedPlatform || expectedPlatform === "instagram")) {
    if (segments.length !== 1) return null;
    const name = segments[0].toLowerCase();
    if (!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(name) || name.includes("..") || INSTAGRAM_ROUTES.has(name)) return null;
    return { platform: "instagram", canonicalKey: name, url: `https://www.instagram.com/${name}/` };
  }
  if (!FACEBOOK_HOSTS.has(host) || (expectedPlatform && expectedPlatform !== "facebook")) return null;
  // A photo, story or share query must not become a followable profile by dropping its query string.
  if (["fbid", "story_fbid", "v", "video_id", "share_id"].some((key) => url.searchParams.has(key))) return null;
  let id: string | null = null;
  if (segments.length === 1 && segments[0].toLowerCase() === "profile.php") {
    const ids = url.searchParams.getAll("id");
    if (ids.length !== 1) return null;
    id = ids[0];
  } else if (segments.length === 3 && ["people", "pages"].includes(segments[0].toLowerCase())) {
    id = segments[2];
  } else if (segments.length === 1 && /^\d+$/.test(segments[0])) {
    id = segments[0];
  }
  if (id !== null) {
    if (!/^[1-9]\d{4,31}$/.test(id)) return null;
    return { platform: "facebook", canonicalKey: `id:${id}`, url: `https://www.facebook.com/profile.php?id=${id}` };
  }
  const slug = segments.length === 1 ? segments[0].toLowerCase() : null;
  if (!slug || !/^[a-z0-9][a-z0-9.]{0,99}$/.test(slug) || FACEBOOK_ROUTES.has(slug) || slug.endsWith(".php")) return null;
  return { platform: "facebook", canonicalKey: `slug:${slug}`, url: `https://www.facebook.com/${slug}/` };
}

/** Extract links only. Do not execute scripts, visit Meta, or infer an account's private/public status. */
export function extractSocialProfilesFromHtml(html: string, sourceUrl: string): SocialProfileCandidate[] {
  const source = html.slice(0, MAX_HTML_LENGTH).replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const anchors = source
    .replace(/<(script|style)\b[^>]{0,8192}>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  const profiles = new Map<string, SocialProfileCandidate>();
  const add = (raw: unknown, context: string) => {
    if (profiles.size >= MAX_SOCIAL_PROFILE_CANDIDATES) return;
    const profile = canonicalizeSocialProfileUrl(raw);
    if (!profile) return;
    const key = `${profile.platform}:${profile.canonicalKey}`;
    if (!profiles.has(key)) profiles.set(key, { ...profile, sourceUrl, context: plainContext(context) });
  };

  let tags = 0;
  for (const match of anchors.matchAll(/<a\b[^>]{0,8192}>/gi)) {
    if (++tags > 2_000 || profiles.size >= MAX_SOCIAL_PROFILE_CANDIDATES) break;
    const href = attribute(match[0], "href");
    const contentStart = (match.index ?? 0) + match[0].length;
    const content = anchors.slice(contentStart, contentStart + 300).split(/<\/a\s*>/i)[0];
    add(href, `${attribute(match[0], "aria-label") || attribute(match[0], "title") || ""} ${content}`);
  }

  let nodes = 0;
  const visit = (value: unknown, depth = 0) => {
    if (++nodes > 2_000 || depth > 10 || profiles.size >= MAX_SOCIAL_PROFILE_CANDIDATES || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const child of value.slice(0, 200)) visit(child, depth + 1); return; }
    const node = value as Record<string, unknown>;
    const sameAs = typeof node.sameAs === "string" ? [node.sameAs] : Array.isArray(node.sameAs) ? node.sameAs.slice(0, 100) : [];
    const name = typeof node.name === "string" ? node.name : "Profil lié depuis les données structurées";
    for (const link of sameAs) add(link, name);
    for (const [key, child] of Object.entries(node).slice(0, 200)) if (key !== "sameAs") visit(child, depth + 1);
  };
  let scripts = 0;
  for (const match of source.matchAll(/<script\b([^>]{0,8192})>([\s\S]*?)<\/script\s*>/gi)) {
    if (++scripts > 100 || profiles.size >= MAX_SOCIAL_PROFILE_CANDIDATES) break;
    if (attribute(match[1], "type")?.toLowerCase() !== "application/ld+json") continue;
    try { visit(JSON.parse(match[2])); } catch { /* Malformed structured data is not executable and is ignored. */ }
  }
  return [...profiles.values()];
}

/** At most two useful same-origin links supplement the supplied homepage. */
export function extractSocialWebsiteLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const links = new Map<string, number>();
  let tags = 0;
  const anchors = html.slice(0, MAX_HTML_LENGTH).replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style)\b[^>]{0,8192}>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  for (const match of anchors.matchAll(/<a\b[^>]{0,8192}>/gi)) {
    if (++tags > 2_000) break;
    const href = attribute(match[0], "href");
    if (!href || href.startsWith("#")) continue;
    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    if (url.origin !== base.origin || url.username || url.password || url.port) continue;
    url.hash = "";
    if (url.toString() === base.toString() || /\.(?:pdf|jpe?g|png|webp|gif|zip|mp4|svg)$/i.test(url.pathname)) continue;
    if (/(?:^|\/)(?:login|auth|connexion|logout|admin|wp-admin|checkout|cart|panier)(?:\/|$)/i.test(url.pathname)) continue;
    const path = decodeHtmlEntities(url.pathname).toLowerCase();
    const score = /contact/.test(path) ? 3 : /(?:a-propos|about|impressum|mentions)/.test(path) ? 2 : /(?:restaurant|etablissement)/.test(path) ? 1 : 0;
    if (score > 0) links.set(url.toString(), score);
  }
  return [...links].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([url]) => url);
}
