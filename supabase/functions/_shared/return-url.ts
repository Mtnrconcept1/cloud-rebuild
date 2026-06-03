const DEFAULT_ALLOWED_RETURN_HOSTS = [
  "thetok.ch",
  "www.thetok.ch",
  "app.thetok.ch",
];

const LOCAL_RETURN_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type CheckoutReturnUrlOptions = {
  env?: (name: string) => string | undefined;
};

function defaultEnv(name: string) {
  const deno = (globalThis as unknown as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}

function normalizeHost(hostname: string) {
  return hostname.replace(/\.$/, "").toLowerCase();
}

function parseHostFromUrl(rawUrl: string | undefined) {
  if (!rawUrl?.trim()) return null;
  try {
    return normalizeHost(new URL(rawUrl.trim()).hostname);
  } catch {
    return null;
  }
}

function parseAllowedHosts(env: (name: string) => string | undefined) {
  const configuredHosts = (env("CHECKOUT_RETURN_HOSTS") || "")
    .split(",")
    .map((entry) => normalizeHost(entry.trim()))
    .filter(Boolean);

  const appHosts = [
    parseHostFromUrl(env("APP_BASE_URL")),
    parseHostFromUrl(env("PUBLIC_APP_URL")),
    parseHostFromUrl(env("SITE_URL")),
    ...(env("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((entry) => parseHostFromUrl(entry)),
  ].filter((entry): entry is string => Boolean(entry));

  return new Set([
    ...DEFAULT_ALLOWED_RETURN_HOSTS.map(normalizeHost),
    ...configuredHosts,
    ...appHosts,
  ]);
}

export function normalizeCheckoutReturnUrl(
  rawUrl: unknown,
  options: CheckoutReturnUrlOptions = {},
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  const env = options.env || defaultEnv;

  try {
    const url = new URL(rawUrl.trim());
    const hostname = normalizeHost(url.hostname);

    if (LOCAL_RETURN_HOSTS.has(hostname)) {
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if ((env("ALLOW_LOCAL_RETURN_URLS") || "").toLowerCase() !== "true") return null;
      return url.toString();
    }

    if (url.protocol !== "https:") return null;
    if (hostname.endsWith(".vercel.app")) return url.toString();
    if (!parseAllowedHosts(env).has(hostname)) return null;

    return url.toString();
  } catch {
    return null;
  }
}
