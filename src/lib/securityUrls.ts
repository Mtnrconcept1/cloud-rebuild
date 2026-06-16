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

function getCurrentOrigin() {
  const origin = globalThis.location?.origin;
  if (!origin) throw new Error("Origine de redirection indisponible");
  return origin;
}

function isAllowedSameOriginRedirect(url: URL, base: URL) {
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
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.protocol === "https:" || isLocalHttpUrl(url)) return url.toString();
    return fallback;
  } catch {
    return fallback;
  }
}
