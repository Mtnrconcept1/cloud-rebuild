import {
  buildSanitizedAuthRedirectUrl,
  getSupabaseAuthRedirectState,
} from "@/lib/authRedirect";

export const TOK_MARKETING_APP_HOST = "marketing.thetok.ch";
export const TOK_MARKETING_APP_ORIGIN = `https://${TOK_MARKETING_APP_HOST}`;
export const TOK_MARKETING_ROOT_PATH = "/marketing";
export const TOK_PUBLIC_APP_HOST = "www.thetok.ch";
export const TOK_PUBLIC_APP_ORIGIN = `https://${TOK_PUBLIC_APP_HOST}`;

type RedirectInput = {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
};

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TOK_VERCEL_PRODUCTION_HOST = "cloud-rebuild-recovered.vercel.app";
const TOK_VERCEL_PREVIEW_REGEX =
  /^cloud-rebuild-recovered-[a-z0-9-]+-mtnrconcepts-projects\.vercel\.app$/;
const AUTH_CONTROL_KEYS = [
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "expires_in",
  "expires_at",
] as const;

function normalizeHostname(hostname: string | null | undefined) {
  return String(hostname || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isLocalAppHost(hostname: string | null | undefined) {
  return LOCAL_APP_HOSTS.has(normalizeHostname(hostname));
}

export function isOwnedMarketingPreviewHost(hostname: string | null | undefined) {
  const normalized = normalizeHostname(hostname);
  return normalized === TOK_VERCEL_PRODUCTION_HOST || TOK_VERCEL_PREVIEW_REGEX.test(normalized);
}

function normalizePath(path: string | null | undefined, fallback = TOK_MARKETING_ROOT_PATH) {
  const value = path?.trim() || fallback;
  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
}

function withUrlParts(pathname: string, search = "", hash = "") {
  return `${normalizePath(pathname, "/")}${search || ""}${hash || ""}`;
}

function fragmentContainsAuthControl(hash: string) {
  if (!hash) return false;
  const fragment = hash.replace(/^#/, "");
  const paramsStart = fragment.startsWith("/") ? fragment.indexOf("?") : -1;
  const params = new URLSearchParams(paramsStart >= 0 ? fragment.slice(paramsStart + 1) : fragment);
  return AUTH_CONTROL_KEYS.some((key) => params.has(key));
}

function sanitizeCrossOriginLocation(href: string) {
  const url = new URL(href, TOK_PUBLIC_APP_ORIGIN);
  const authState = getSupabaseAuthRedirectState(url.href);
  const hasAuthControl = AUTH_CONTROL_KEYS.some((key) => url.searchParams.has(key))
    || fragmentContainsAuthControl(url.hash);
  const isAuthCallback = url.pathname === "/auth/callback";

  if (!authState.hasAuthRedirect && !hasAuthControl && !isAuthCallback) {
    return url;
  }

  const sanitized = new URL(buildSanitizedAuthRedirectUrl(url.href), url.origin);
  AUTH_CONTROL_KEYS.forEach((key) => sanitized.searchParams.delete(key));
  sanitized.hash = "";
  if (isAuthCallback) sanitized.pathname = "/auth";
  return sanitized;
}

export function isMarketingAppHost(hostname: string | null | undefined) {
  return normalizeHostname(hostname) === TOK_MARKETING_APP_HOST;
}

export function isMarketingPath(pathname: string | null | undefined) {
  const path = normalizePath(pathname, "/");
  return path === TOK_MARKETING_ROOT_PATH || path.startsWith(`${TOK_MARKETING_ROOT_PATH}/`);
}

export function getMarketingNavigationHref(pathname = TOK_MARKETING_ROOT_PATH, hostname?: string) {
  const requestedPath = normalizePath(pathname);
  const path = isMarketingPath(requestedPath) ? requestedPath : TOK_MARKETING_ROOT_PATH;
  const currentHostname = hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");

  if (
    isLocalAppHost(currentHostname)
    || isOwnedMarketingPreviewHost(currentHostname)
    || isMarketingAppHost(currentHostname)
  ) return path;
  return `${TOK_MARKETING_APP_ORIGIN}${path}`;
}

export function getMarketingHostRedirectTarget({
  hostname,
  pathname,
  search = "",
  hash = "",
}: RedirectInput) {
  if (isLocalAppHost(hostname)) return null;

  const path = normalizePath(pathname, "/");
  const targetPath = withUrlParts(path, search, hash);

  if (isMarketingAppHost(hostname)) {
    if (path === "/") {
      return `${TOK_MARKETING_APP_ORIGIN}${TOK_MARKETING_ROOT_PATH}${search || ""}${hash || ""}`;
    }
    if (isMarketingPath(path)) return null;
    return `${TOK_PUBLIC_APP_ORIGIN}${targetPath}`;
  }

  // Keep local and owned Vercel deployments inspectable. Every other host,
  // including admin/commercial/public hosts, canonicalizes /marketing here.
  if (isMarketingPath(path) && !isOwnedMarketingPreviewHost(hostname)) {
    return `${TOK_MARKETING_APP_ORIGIN}${targetPath}`;
  }

  return null;
}

/**
 * Resolve a host transition after removing OAuth/PKCE controls and legacy
 * token fragments. Callers must use this function, not the raw redirect helper,
 * when the input comes from window.location.
 */
export function getSanitizedMarketingHostRedirectTarget(href: string) {
  const originalLocation = new URL(href, TOK_PUBLIC_APP_ORIGIN);
  const safeLocation = sanitizeCrossOriginLocation(href);
  const canonicalTarget = getMarketingHostRedirectTarget({
    hostname: safeLocation.hostname,
    pathname: safeLocation.pathname,
    search: safeLocation.search,
    hash: safeLocation.hash,
  });
  if (canonicalTarget) return canonicalTarget;
  return safeLocation.href !== originalLocation.href ? safeLocation.href : null;
}
