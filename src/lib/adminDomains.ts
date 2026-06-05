export const TOK_PUBLIC_APP_HOST = "www.thetok.ch";
export const TOK_PUBLIC_APP_ORIGIN = `https://${TOK_PUBLIC_APP_HOST}`;
export const TOK_ADMIN_APP_HOST = "admin.thetok.ch";
export const TOK_ADMIN_APP_ORIGIN = `https://${TOK_ADMIN_APP_HOST}`;

type RedirectInput = {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
};

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string | null | undefined) {
  return (hostname || "").replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "").toLowerCase();
}

function isLocalAppHost(hostname: string | null | undefined) {
  return LOCAL_APP_HOSTS.has(normalizeHostname(hostname));
}

function normalizePath(path: string | null | undefined, fallback = "/admin") {
  const value = path?.trim() || fallback;
  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
}

function withUrlParts(pathname: string, search = "", hash = "") {
  return `${normalizePath(pathname, "/")}${search || ""}${hash || ""}`;
}

export function isAdminAppHost(hostname: string | null | undefined) {
  return normalizeHostname(hostname) === TOK_ADMIN_APP_HOST;
}

export function isAdminPath(pathname: string | null | undefined) {
  const path = normalizePath(pathname, "/");
  return path === "/admin" || path.startsWith("/admin/");
}

export function getAdminNavigationHref(pathname = "/admin", hostname?: string) {
  const path = normalizePath(pathname, "/admin");
  const currentHostname = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");

  if (isLocalAppHost(currentHostname) || isAdminAppHost(currentHostname)) return path;
  return `${TOK_ADMIN_APP_ORIGIN}${path}`;
}

export function getAdminHostRedirectTarget({
  hostname,
  pathname,
  search = "",
  hash = "",
}: RedirectInput) {
  if (isLocalAppHost(hostname)) return null;

  const path = normalizePath(pathname, "/");
  const targetPath = withUrlParts(path, search, hash);

  if (isAdminAppHost(hostname)) {
    if (path === "/") return `${TOK_ADMIN_APP_ORIGIN}/admin${search || ""}${hash || ""}`;
    if (isAdminPath(path) || path === "/auth") return null;
    return `${TOK_PUBLIC_APP_ORIGIN}${targetPath}`;
  }

  if (isAdminPath(path)) return `${TOK_ADMIN_APP_ORIGIN}${targetPath}`;

  return null;
}
