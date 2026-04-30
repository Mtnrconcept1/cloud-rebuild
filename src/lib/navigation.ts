import { isAllowedAppLinkHost } from "@/lib/mobile-domains";

function ensureLeadingSlash(value: string) {
  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
}

export function normalizeInternalNavigationTarget(
  rawTarget: string | null | undefined,
  fallback = "/",
) {
  if (typeof rawTarget !== "string") return fallback;

  const value = rawTarget.trim();
  if (!value) return fallback;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;

    return `${url.pathname || "/"}${url.search}${url.hash}`;
  } catch {
    return ensureLeadingSlash(value);
  }
}

export function getNavigationTargetFromAppUrl(rawUrl: string, fallback = "/") {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === "http:" || url.protocol === "https:") {
      if (!isAllowedAppLinkHost(url.hostname)) return fallback;

      return normalizeInternalNavigationTarget(
        `${url.pathname || "/"}${url.search}${url.hash}`,
        fallback,
      );
    }

    const hostSegment = url.host ? `/${url.host}` : "";
    const candidate = `${hostSegment}${url.pathname || ""}${url.search}${url.hash}`;
    return normalizeInternalNavigationTarget(candidate || fallback, fallback);
  } catch {
    return fallback;
  }
}
