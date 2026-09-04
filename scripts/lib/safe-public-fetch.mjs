import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "apikey",
  "x-internal-cron-secret",
]);

function normalizeHost(value) {
  return String(value || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function parseIpv4(address) {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return octets;
}

export function isBlockedIpAddress(value) {
  const address = normalizeHost(value);
  const version = isIP(address);
  if (version === 4) {
    const octets = parseIpv4(address);
    if (!octets) return true;
    const [a, b, c] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (version !== 6) return false;

  return (
    address === "::" ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    /^fe[89ab]/.test(address) ||
    address.startsWith("ff") ||
    address.startsWith("2001:db8:") ||
    address.startsWith("::ffff:127.") ||
    address.startsWith("::ffff:10.") ||
    address.startsWith("::ffff:192.168.")
  );
}

export function isSafeRemoteUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (url.port && !new Set(["80", "443"]).has(url.port)) return false;

    const hostname = normalizeHost(url.hostname);
    if (!hostname) return false;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      return false;
    }
    if (isIP(hostname) && isBlockedIpAddress(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function assertPublicResolution(url, dnsLookup) {
  if (!isSafeRemoteUrl(url)) throw new Error("unsafe_public_url");
  const hostname = normalizeHost(url.hostname);
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) throw new Error("private_network_url");
    return;
  }

  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("dns_resolution_empty");
  }
  if (addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new Error("private_network_dns_resolution");
  }
}

function copyRedirectHeaders(headers, sameOrigin) {
  const output = new Headers(headers);
  if (!sameOrigin) {
    for (const header of SENSITIVE_REDIRECT_HEADERS) output.delete(header);
  }
  return output;
}

function redirectedMethod(method, status) {
  if (status === 303 && method !== "HEAD") return "GET";
  if ((status === 301 || status === 302) && method === "POST") return "GET";
  return method;
}

export function createGuardedFetch({
  fetchImpl = globalThis.fetch.bind(globalThis),
  dnsLookup = defaultLookup,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
} = {}) {
  return async function guardedFetch(input, init = {}) {
    let request = input instanceof Request
      ? new Request(input, init)
      : new Request(input, init);

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const currentUrl = new URL(request.url);
      await assertPublicResolution(currentUrl, dnsLookup);

      const response = await fetchImpl(request, { redirect: "manual" });
      if (!REDIRECT_STATUSES.has(response.status)) return response;

      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_location_missing");
      if (redirectCount === maxRedirects) throw new Error("redirect_limit_exceeded");

      const nextUrl = new URL(location, currentUrl);
      await assertPublicResolution(nextUrl, dnsLookup);

      const currentMethod = request.method.toUpperCase();
      const nextMethod = redirectedMethod(currentMethod, response.status);
      if (!["GET", "HEAD"].includes(currentMethod) && nextMethod === currentMethod) {
        throw new Error("unsafe_non_get_redirect");
      }

      const sameOrigin = currentUrl.origin === nextUrl.origin;
      const headers = copyRedirectHeaders(request.headers, sameOrigin);
      if (nextMethod === "GET" || nextMethod === "HEAD") {
        headers.delete("content-length");
        headers.delete("content-type");
      }

      await response.body?.cancel("redirect_followed").catch(() => undefined);
      request = new Request(nextUrl, {
        method: nextMethod,
        headers,
        redirect: "manual",
      });
    }

    throw new Error("redirect_limit_exceeded");
  };
}
