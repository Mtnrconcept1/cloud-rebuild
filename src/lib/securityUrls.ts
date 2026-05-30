type SocialPlatform = "instagram" | "facebook" | "tiktok" | "website";

const SOCIAL_HOSTS: Record<SocialPlatform, string[] | null> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  website: null,
};

function withHttpsScheme(value: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

function normalizeHost(hostname: string) {
  return hostname.replace(/\.$/, "").toLowerCase();
}

function isAllowedHost(hostname: string, allowedHosts: string[]) {
  const host = normalizeHost(hostname);
  return allowedHosts.some((allowedHost) => host === normalizeHost(allowedHost));
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === "http:" && (
    url.hostname === "localhost" || url.hostname === "127.0.0.1"
  );
}

export function normalizeExternalHttpsUrl(
  rawUrl: string | null | undefined,
  allowedHosts?: string[],
): string | null {
  if (typeof rawUrl !== "string") return null;

  const value = rawUrl.trim();
  if (!value) return null;

  try {
    const url = new URL(withHttpsScheme(value));
    if (url.protocol !== "https:") return null;
    if (allowedHosts?.length && !isAllowedHost(url.hostname, allowedHosts)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeSocialUrl(
  rawUrl: string | null | undefined,
  platform: SocialPlatform,
): string | null {
  return normalizeExternalHttpsUrl(rawUrl, SOCIAL_HOSTS[platform] || undefined);
}

export function normalizePublicImageUrl(
  rawUrl: string | null | undefined,
  fallback = "/images/kebab-box-spread.jpeg",
): string {
  if (typeof rawUrl !== "string") return fallback;

  const value = rawUrl.trim();
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.protocol === "https:" || isLocalHttpUrl(url)) return url.toString();
    return fallback;
  } catch {
    return fallback;
  }
}

