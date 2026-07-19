export const TOK_CANONICAL_AUTH_HOST = "www.thetok.ch";
export const TOK_CANONICAL_AUTH_ORIGIN = `https://${TOK_CANONICAL_AUTH_HOST}`;
export const TOK_CANONICAL_AUTH_PATH = "/auth";
export const TOK_WORKSPACE_CHOOSER_PATH = "/espaces";

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string | null | undefined) {
  return String(hostname || "").replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "").toLowerCase();
}

export function isCanonicalAuthHost(hostname: string | null | undefined) {
  return normalizeHostname(hostname) === TOK_CANONICAL_AUTH_HOST;
}

export function getCanonicalAuthHref(hostname?: string) {
  const currentHostname = hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (LOCAL_APP_HOSTS.has(normalizeHostname(currentHostname))) {
    return typeof window !== "undefined"
      ? `${window.location.origin}${TOK_CANONICAL_AUTH_PATH}`
      : TOK_CANONICAL_AUTH_PATH;
  }
  return `${TOK_CANONICAL_AUTH_ORIGIN}${TOK_CANONICAL_AUTH_PATH}`;
}

export function getCanonicalAuthCallbackHref(hostname?: string) {
  const authHref = getCanonicalAuthHref(hostname);
  return `${authHref}/callback`;
}

export function getWorkspaceChooserHref(hostname?: string) {
  const currentHostname = hostname
    ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (LOCAL_APP_HOSTS.has(normalizeHostname(currentHostname))) {
    return typeof window !== "undefined"
      ? `${window.location.origin}${TOK_WORKSPACE_CHOOSER_PATH}`
      : TOK_WORKSPACE_CHOOSER_PATH;
  }
  return `${TOK_CANONICAL_AUTH_ORIGIN}${TOK_WORKSPACE_CHOOSER_PATH}`;
}
