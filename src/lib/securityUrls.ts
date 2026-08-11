type SocialPlatform = "instagram" | "facebook" | "tiktok" | "website";

const SOCIAL_HOSTS: Record<SocialPlatform, string[] | null> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  website: null,
};

const TRUSTED_CHECKOUT_REDIRECT_HOSTS = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
  "connect.stripe.com",
]);

const TOK_PUBLIC_ASSET_HOSTS = new Set([
  "admin.thetok.ch",
  "cloud-rebuild-recovered.vercel.app",
  "thetok.ch",
  "www.thetok.ch",
]);

const SAFE_NATIVE_APP_SCHEMES = new Set(["capacitor:", "tok:"]);

const PUBLIC_IMAGE_URL_ALIASES: Record<string, string> = {
  "/images/fondue moiti\u00e9 moiti\u00e9.jpg": "/images/fondue-moitie-moitie.jpg",
  "/images/meringue double.webp": "/images/meringue-double.webp",
  "/images/milshake oreo.jpg": "/images/milkshake-oreo.jpg",
  "/images/milshake vanille.jpeg": "/images/milkshake-vanille.jpeg",
  "/images/moshi glac\u00e9s.jpg": "/images/mochi-glaces.jpg",
  "/images/r\u00f6sti bernois.jpg": "/images/rosti-bernois.jpg",
  "/images/salade du march\u00e9.jpg": "/images/salade-du-marche.jpg",
  "/images/taboul\u00e9.webp": "/images/taboule.webp",
};

type CheckoutRedirectOptions = {
  origin?: string;
  assign?: (url: string) => void;
};

type ExternalOpenOptions = {
  allowedHosts?: string[];
  open?: (url: string, target: string, features: string) => Window | null;
};

function withHttpsScheme(value: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

function tryDecodeUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function canonicalizeKnownPublicImageUrl(rawUrl: string): string {
  const normalized = rawUrl.trim().replace(/\\/g, "/");
  const decoded = tryDecodeUrl(normalized);
  return PUBLIC_IMAGE_URL_ALIASES[normalized] ?? PUBLIC_IMAGE_URL_ALIASES[decoded] ?? normalized;
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

function isTokPublicAssetUrl(url: URL) {
  if (isLocalHttpUrl(url)) return true;
  return url.protocol === "https:" && TOK_PUBLIC_ASSET_HOSTS.has(normalizeHost(url.hostname));
}

function getCurrentOrigin() {
  const origin = globalThis.location?.origin;
  if (!origin) throw new Error("Origine de redirection indisponible");
  return origin;
}

function isAllowedSameOriginRedirect(url: URL, base: URL) {
  if (SAFE_NATIVE_APP_SCHEMES.has(base.protocol)) {
    return url.protocol === base.protocol
      && normalizeHost(url.hostname) === normalizeHost(base.hostname);
  }

  if (url.origin !== base.origin) return false;
  if (url.protocol === "https:") return true;
  return isLocalHttpUrl(url);
}

export function normalizeTrustedCheckoutRedirectUrl(
  rawUrl: string | null | undefined,
  options: Pick<CheckoutRedirectOptions, "origin"> = {},
): string | null {
  if (typeof rawUrl !== "string") return null;

  const value = rawUrl.trim();
  if (!value) return null;

  try {
    const base = new URL(options.origin || getCurrentOrigin());
    const url = new URL(value, base);
    const host = normalizeHost(url.hostname);

    if (isAllowedSameOriginRedirect(url, base)) return url.toString();
    if (url.protocol === "https:" && TRUSTED_CHECKOUT_REDIRECT_HOSTS.has(host)) return url.toString();

    return null;
  } catch {
    return null;
  }
}

export function redirectToTrustedCheckoutUrl(
  rawUrl: string | null | undefined,
  options: CheckoutRedirectOptions = {},
) {
  const url = normalizeTrustedCheckoutRedirectUrl(rawUrl, options);
  if (!url) throw new Error("URL de paiement non fiable");

  const assign = options.assign || globalThis.location?.assign?.bind(globalThis.location);
  if (!assign) throw new Error("Redirection indisponible");
  assign(url);
  return url;
}

export function openExternalHttpsUrl(
  rawUrl: string | null | undefined,
  options: ExternalOpenOptions = {},
) {
  const url = normalizeExternalHttpsUrl(rawUrl, options.allowedHosts);
  if (!url) return null;

  const open = options.open || globalThis.window?.open?.bind(globalThis.window);
  if (!open) return null;

  open(url, "_blank", "noopener,noreferrer");
  return url;
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
  if (value.startsWith("/") && !value.startsWith("//")) return canonicalizeKnownPublicImageUrl(value);

  try {
    const url = new URL(value);
    if (url.protocol === "https:" || isLocalHttpUrl(url)) {
      if (!isTokPublicAssetUrl(url)) return url.toString();
      url.pathname = canonicalizeKnownPublicImageUrl(url.pathname);
      return url.toString();
    }
    return fallback;
  } catch {
    return fallback;
  }
}
