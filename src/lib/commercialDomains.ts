import type { UserRole } from "@/lib/auth-context";
import { COMMERCIAL_DEMO_HOSTNAME } from "@/lib/commercialDemoHostSecurity";
import {
  TOK_CANONICAL_AUTH_ORIGIN,
  TOK_WORKSPACE_CHOOSER_PATH,
} from "@/lib/authDomains";
import { DEMO_WORKSPACES, getDemoWorkspacePath } from "@/lib/demoWorkspaces";

export const TOK_COMMERCIAL_APP_HOST = COMMERCIAL_DEMO_HOSTNAME;
export const TOK_COMMERCIAL_APP_ORIGIN = `https://${TOK_COMMERCIAL_APP_HOST}`;
export const TOK_PUBLIC_APP_ORIGIN = "https://www.thetok.ch";
export const TOK_ADMIN_APP_ORIGIN = "https://admin.thetok.ch";

type CommercialHostRedirectInput = {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
  authResolved?: boolean;
  isAuthenticated?: boolean;
  activeRole?: UserRole | null;
  roles?: readonly UserRole[];
  accountType?: string | null;
  serverCommercialDemoRestricted?: boolean;
};

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TOK_PRODUCTION_HOSTS = new Set([
  "thetok.ch",
  "www.thetok.ch",
  "app.thetok.ch",
  "admin.thetok.ch",
  "auth.thetok.ch",
  "cloud-rebuild-recovered.vercel.app",
]);
const TOK_OWNED_PREVIEW_HOST = /^cloud-rebuild-recovered-[a-z0-9-]+-mtnrconcepts-projects\.vercel\.app$/;
const AUTH_CALLBACK_QUERY_KEYS = ["code", "error", "error_code", "error_description", "state"];
const SENSITIVE_AUTH_FRAGMENT_KEYS = [
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "expires_in",
  "expires_at",
];
const COMMERCIAL_HOST_EXACT_PATHS = new Set([
  "/auth",
  "/auth/callback",
  "/commercial",
  "/commercial/prospection",
  "/commercial/comptabilite",
  "/commercial/demo-live",
]);
const COMMERCIAL_DEMO_FRAME_PATH = /^\/commercial\/demo-live\/frame\/(client|restaurant|courier|commercial)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/|$)/i;

function normalizeHostname(hostname: string | null | undefined) {
  return (hostname || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isLocalAppHost(hostname: string | null | undefined) {
  return LOCAL_APP_HOSTS.has(normalizeHostname(hostname));
}

function isTokProductionHost(hostname: string | null | undefined) {
  return TOK_PRODUCTION_HOSTS.has(normalizeHostname(hostname));
}

export function isOwnedTokPreviewHost(hostname: string | null | undefined) {
  return TOK_OWNED_PREVIEW_HOST.test(normalizeHostname(hostname));
}

function normalizePath(pathname: string | null | undefined) {
  const value = String(pathname || "/").trim();
  const normalized = `/${value.replace(/^\/+/, "")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function withUrlParts(pathname: string, search = "", hash = "") {
  return `${normalizePath(pathname)}${search || ""}${hash || ""}`;
}

function getFragmentParams(hash: string) {
  const fragment = String(hash || "").replace(/^#/, "");
  const queryStart = fragment.startsWith("/") ? fragment.indexOf("?") : -1;
  return new URLSearchParams(queryStart >= 0 ? fragment.slice(queryStart + 1) : fragment);
}

function withoutCrossOriginAuthSecrets(pathname: string, search = "", hash = "") {
  const searchParams = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const fragmentParams = getFragmentParams(hash);
  const hasAuthRedirect = AUTH_CALLBACK_QUERY_KEYS.some((key) => searchParams.has(key) || fragmentParams.has(key))
    || SENSITIVE_AUTH_FRAGMENT_KEYS.some((key) => searchParams.has(key) || fragmentParams.has(key));

  if (!hasAuthRedirect) return withUrlParts(pathname, search, hash);

  for (const key of AUTH_CALLBACK_QUERY_KEYS) searchParams.delete(key);
  for (const key of SENSITIVE_AUTH_FRAGMENT_KEYS) searchParams.delete(key);
  const safeSearch = searchParams.toString();
  return `${normalizePath(pathname)}${safeSearch ? `?${safeSearch}` : ""}`;
}

function getNonCommercialRoleTarget(activeRole: UserRole | null | undefined) {
  if (activeRole === "admin") return `${TOK_ADMIN_APP_ORIGIN}/admin`;
  if (activeRole === "restaurateur") return `${TOK_PUBLIC_APP_ORIGIN}/dashboard`;
  if (activeRole === "courier") return `${TOK_PUBLIC_APP_ORIGIN}/courier`;
  if (activeRole === "client") return `${TOK_PUBLIC_APP_ORIGIN}/mon-espace`;
  return TOK_PUBLIC_APP_ORIGIN;
}

export function isCommercialAppHost(hostname: string | null | undefined) {
  return normalizeHostname(hostname) === TOK_COMMERCIAL_APP_HOST;
}

export function getDemoWorkspaceSurfaceForHost(hostname: string | null | undefined) {
  const normalizedHostname = normalizeHostname(hostname);
  return DEMO_WORKSPACES.find((workspace) => workspace.hostname === normalizedHostname)?.surface || null;
}

export function isDemoWorkspaceHost(hostname: string | null | undefined) {
  return getDemoWorkspaceSurfaceForHost(hostname) !== null;
}

export function isCommercialDemoFrameHostPath(pathname: string | null | undefined) {
  return COMMERCIAL_DEMO_FRAME_PATH.test(normalizePath(pathname));
}

/**
 * The commercial origin intentionally exposes only authentication, the
 * commercial workspace and session-scoped demo frames. Public discovery,
 * production client pages and operational back-offices must never mount there.
 */
export function isCommercialHostPathAllowed(pathname: string | null | undefined) {
  const path = normalizePath(pathname);
  return COMMERCIAL_HOST_EXACT_PATHS.has(path.toLowerCase())
    || isCommercialDemoFrameHostPath(path);
}

export function isCommercialNamespacePath(pathname: string | null | undefined) {
  const path = normalizePath(pathname).toLowerCase();
  return path === "/commercial" || path.startsWith("/commercial/");
}

export function isManagedCommercialAccount(
  roles: readonly UserRole[] = [],
  accountType: string | null | undefined = null,
  serverCommercialDemoRestricted = false,
) {
  // Durable server-managed markers always win, including when support grants
  // an admin role. An unmarked administrator may legitimately carry every
  // operational role and must retain access to the production back-office.
  const isMarkedCommercialDemo = String(accountType || "")
    .trim()
    .toLowerCase() === "commercial_demo";

  return serverCommercialDemoRestricted
    || isMarkedCommercialDemo
    || (roles.includes("commercial") && !roles.includes("admin"));
}

export function canOperateCommercialDemoHost(roles: readonly UserRole[] = []) {
  return roles.includes("commercial") || roles.includes("admin");
}

export function getCommercialNavigationHref(
  pathname = "/commercial",
  hostname?: string,
) {
  const targetPath = normalizePath(pathname);
  const currentHostname = hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");

  if (
    isLocalAppHost(currentHostname)
    || isOwnedTokPreviewHost(currentHostname)
    || isCommercialAppHost(currentHostname)
  ) {
    return targetPath;
  }

  return `${TOK_COMMERCIAL_APP_ORIGIN}${targetPath}`;
}

/** All authentication starts on the canonical public origin. */
export function getCommercialReauthenticationHref(
  _target: string | null | undefined = "/commercial",
) {
  return `${TOK_CANONICAL_AUTH_ORIGIN}/auth`;
}

/**
 * Computes a canonical cross-host redirect without ever forwarding an unsafe
 * production path or Supabase callback credential to the commercial origin.
 */
export function getCommercialHostRedirectTarget({
  hostname,
  pathname,
  search = "",
  hash = "",
  authResolved = false,
  isAuthenticated = false,
  activeRole = null,
  roles = [],
  accountType = null,
  serverCommercialDemoRestricted = false,
}: CommercialHostRedirectInput) {
  if (isLocalAppHost(hostname)) return null;

  const path = normalizePath(pathname);
  const targetPath = withoutCrossOriginAuthSecrets(path, search, hash);
  const isAllowedCommercialPath = isCommercialHostPathAllowed(path);
  const isCommercialNamespace = isCommercialNamespacePath(path);
  const isManagedCommercial = isManagedCommercialAccount(
    roles,
    accountType,
    serverCommercialDemoRestricted,
  );
  const canOperateHost = canOperateCommercialDemoHost(roles);
  const demoWorkspaceSurface = getDemoWorkspaceSurfaceForHost(hostname);

  if (demoWorkspaceSurface) {
    const demoOrigin = `https://${normalizeHostname(hostname)}`;
    if (path === "/auth" || path === "/auth/callback") {
      return `${TOK_CANONICAL_AUTH_ORIGIN}${path}`;
    }
    if (path === TOK_WORKSPACE_CHOOSER_PATH) {
      return `${TOK_PUBLIC_APP_ORIGIN}${TOK_WORKSPACE_CHOOSER_PATH}`;
    }
    if (path === "/") {
      return `${demoOrigin}${getDemoWorkspacePath(demoWorkspaceSurface)}`;
    }

    const isAllowedDemoWorkspacePath = path === "/commercial/demo-live"
      || isCommercialDemoFrameHostPath(path);
    if (!isAllowedDemoWorkspacePath) return `${TOK_COMMERCIAL_APP_ORIGIN}/commercial`;
    if (!authResolved || !isAuthenticated || canOperateHost) return null;
    return getNonCommercialRoleTarget(activeRole);
  }

  if (isCommercialAppHost(hostname)) {
    if (path === "/auth" || path === "/auth/callback") {
      return `${TOK_CANONICAL_AUTH_ORIGIN}${path}`;
    }

    if (!isAllowedCommercialPath) {
      if (authResolved && isAuthenticated && !isManagedCommercial) {
        return getNonCommercialRoleTarget(activeRole);
      }
      return `${TOK_COMMERCIAL_APP_ORIGIN}/commercial`;
    }

    if (!authResolved || !isAuthenticated || canOperateHost) return null;
    return getNonCommercialRoleTarget(activeRole);
  }

  // Owned branch previews stay self-contained for testing. The same route and
  // identity barriers still apply, but a preview never signs the user out or
  // transfers them into the production commercial origin.
  if (isOwnedTokPreviewHost(hostname)) {
    if (isCommercialNamespace) return isAllowedCommercialPath ? null : "/commercial";
    if (authResolved && isAuthenticated && isManagedCommercial) return "/commercial";
    return null;
  }

  if (isTokProductionHost(hostname) && (path === "/auth" || path === "/auth/callback")) {
    return null;
  }

  // Commercial workspaces and copied frame URLs must never execute on the
  // public/admin deployment. Redirect before authentication so credentials
  // are entered directly on the canonical origin (web storage is origin-bound).
  if (isCommercialNamespace) {
    return isAllowedCommercialPath
      ? `${TOK_COMMERCIAL_APP_ORIGIN}${targetPath}`
      : `${TOK_COMMERCIAL_APP_ORIGIN}/commercial`;
  }

  if (!authResolved || !isAuthenticated || !isManagedCommercial) return null;
  if (isTokProductionHost(hostname) && path === TOK_WORKSPACE_CHOOSER_PATH) return null;

  // Commercial accounts may preserve only their own workspace/demo URLs. A
  // public restaurant/search URL is deliberately collapsed to the safe home.
  return `${TOK_COMMERCIAL_APP_ORIGIN}/commercial`;
}
