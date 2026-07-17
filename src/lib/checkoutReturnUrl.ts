import { appendPaymentAttemptToUrl } from "./paymentAttempt";

const ALLOWED_CHECKOUT_RETURN_HOSTS = new Set([
  "thetok.ch",
  "www.thetok.ch",
  "app.thetok.ch",
]);

const LOCAL_CHECKOUT_RETURN_HOSTS = new Set(["localhost", "127.0.0.1"]);

type CheckoutReturnUrlOptions = {
  origin?: string;
  paymentAttemptId?: string | null;
};

function getCurrentOrigin() {
  const location = globalThis.location;
  if (!location?.origin) throw new Error("URL de retour indisponible");
  return location.origin;
}

function normalizeHost(hostname: string) {
  return hostname.replace(/\.$/, "").toLowerCase();
}

function isAllowedCheckoutReturnOrigin(url: URL) {
  const host = normalizeHost(url.hostname);
  if (LOCAL_CHECKOUT_RETURN_HOSTS.has(host)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  return url.protocol === "https:" && ALLOWED_CHECKOUT_RETURN_HOSTS.has(host);
}

export function buildCheckoutReturnUrl(pathOrUrl: string, options: CheckoutReturnUrlOptions = {}) {
  const origin = options.origin || getCurrentOrigin();
  const base = new URL(origin);
  const returnUrl = new URL(pathOrUrl, base);

  if (returnUrl.origin !== base.origin || !isAllowedCheckoutReturnOrigin(returnUrl)) {
    throw new Error("URL de retour invalide");
  }

  const trustedReturnUrl = returnUrl.toString();
  return options.paymentAttemptId
    ? appendPaymentAttemptToUrl(trustedReturnUrl, options.paymentAttemptId)
    : trustedReturnUrl;
}

export function buildCurrentCheckoutReturnUrl(options: CheckoutReturnUrlOptions = {}) {
  const location = globalThis.location;
  if (!location?.pathname) throw new Error("URL de retour indisponible");
  return buildCheckoutReturnUrl(`${location.pathname}${location.search}`, options);
}
