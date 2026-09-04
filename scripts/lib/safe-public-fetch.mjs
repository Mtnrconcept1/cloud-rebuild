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
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

function isBlockedIpv4Octets(octets) {
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

function parseIpv6Words(address) {
  let source = address;
  if (source.includes(".")) {
    const lastColon = source.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(source.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    source = `${source.slice(0, lastColon)}:${high}:${low}`;
  }

  const compressed = source.split("::");
  if (compressed.length > 2) return null;

  const left = compressed[0] ? compressed[0].split(":") : [];
  const right = compressed.length === 2 && compressed[1] ? compressed[1].split(":") : [];
  let words;

  if (compressed.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    words = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    if (left.length !== 8) return null;
    words = left;
  }

  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
  return words.map((word) => Number.parseInt(word, 16));
}

function embeddedIpv4Octets(address) {
  const words = parseIpv6Words(address);
  if (!words) return null;

  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (!ipv4Compatible && !ipv4Mapped) return null;

  return [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff];
}

export function isBlockedIpAddress(value) {
  const address = normalizeHost(value);
  const version = isIP(address);
  if (version === 4) {
    const octets = parseIpv4(address);
    return !octets || isBlockedIpv4Octets(octets);
  }
  if (version !== 6) return false;

  const embeddedIpv4 = embeddedIpv4Octets(address);
  if (embeddedIpv4 && isBlockedIpv4Octets(embeddedIpv4)) return true;

  return (
    address === "::" ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    /^fe[89ab]/.test(address) ||
    address.startsWith("ff") ||
    address.startsWith("2001:db8:")
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
