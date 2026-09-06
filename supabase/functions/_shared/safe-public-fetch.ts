export type FetchPublicUrlOptions = {
  init?: RequestInit;
  timeoutMs?: number;
  maxRedirects?: number;
};

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function expandIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const [headRaw, tailRaw] = normalized.split("::");
  const head = headRaw ? headRaw.split(":").filter(Boolean) : [];
  const tail = tailRaw ? tailRaw.split(":").filter(Boolean) : [];
  if (!normalized.includes("::") && head.length !== 8) return null;
  if (normalized.includes("::") && head.length + tail.length > 7) return null;

  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function mappedIpv4FromIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!normalized.startsWith("::ffff:")) return null;

  const mapped = normalized.slice("::ffff:".length);
  if (mapped.includes(".")) return mapped;

  const groups = expandIpv6(normalized);
  if (!groups || groups.slice(0, 5).some((group) => group !== 0) || groups[5] !== 0xffff) return null;
  const high = groups[6];
  const low = groups[7];
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    const mapped = mappedIpv4FromIpv6(normalized);
    return !mapped || isPrivateIpv4(mapped);
  }

  const groups = expandIpv6(normalized);
  if (!groups) return true;
  const first = groups[0];
  const second = groups[1];

  return groups.every((group) => group === 0)
    || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xff00) === 0xff00
    || (first === 0x2001 && second === 0x0db8);
}

function isIpLiteral(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "").split("%")[0];
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}

async function hostIsPublic(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIpLiteral(host)) return host.includes(":") ? !isPrivateIpv6(host) : !isPrivateIpv4(host);

  const records: string[] = [];
  const [ipv4, ipv6] = await Promise.allSettled([
    Deno.resolveDns(host, "A"),
    Deno.resolveDns(host, "AAAA"),
  ]);
  if (ipv4.status === "fulfilled") records.push(...ipv4.value);
  if (ipv6.status === "fulfilled") records.push(...ipv6.value);
  if (records.length === 0) return false;
  return records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
}

export async function assertSafePublicUrl(input: string | URL) {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new Error("invalid_url");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsafe_protocol");
  if (url.username || url.password) throw new Error("unsafe_credentials");
  if (!await hostIsPublic(url.hostname)) throw new Error("unsafe_or_private_host");
  return url;
}

function isTimeoutError(error: unknown) {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function fetchPublicUrl(input: string | URL, options: FetchPublicUrlOptions = {}) {
  let current = await assertSafePublicUrl(input);
  const maxRedirects = Math.max(0, Math.min(6, options.maxRedirects ?? 3));
  const timeoutMs = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 12_000));

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    current = await assertSafePublicUrl(current);

    let response: Response;
    try {
      response = await fetch(current, {
        ...(options.init || {}),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) throw new Error("request_timeout");
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === maxRedirects) throw new Error("redirect_limit");
      current = await assertSafePublicUrl(new URL(location, current));
      continue;
    }

    return response;
  }

  throw new Error("redirect_limit");
}
