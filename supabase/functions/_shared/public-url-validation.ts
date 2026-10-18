export type PublicNetworkAddress = { address: string; family: 4 | 6 };

export type ResolvedPublicUrl = {
  url: URL;
  addresses: PublicNetworkAddress[];
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
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function expandIpv6(value: string) {
  let normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.includes("%") || normalized.split("::").length > 2) return null;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const octets = normalized.slice(separator + 1).split(".");
    if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
    const [a, b, c, d] = octets.map(Number);
    normalized = `${normalized.slice(0, separator)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
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

function isPrivateIpv6(value: string) {
  const groups = expandIpv6(value);
  if (!groups) return true;
  // Inspect the parsed address, not a textual "::ffff:" prefix: DNS may return
  // the expanded IPv4-mapped notation, including a dotted IPv4 suffix.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPrivateIpv4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
  }
  const first = groups[0];
  const second = groups[1];
  // Fail closed outside global unicast. This also rejects IPv4-compatible,
  // NAT64, link/site-local and multicast targets. Reject special transition
  // and documentation prefixes inside global unicast as well.
  return (first & 0xe000) !== 0x2000
    || (first === 0x2001 && second < 0x0200)
    || (first === 0x2001 && second === 0x0db8)
    || first === 0x2002
    || first === 0x3fff;
}

function isIpLiteral(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "").split("%")[0];
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}

export function isUnsafePublicHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host.includes("%") || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")
    || host.endsWith(".home") || host.endsWith(".home.arpa")) return true;
  if (isIpLiteral(host)) return host.includes(":") ? isPrivateIpv6(host) : isPrivateIpv4(host);
  return !host.includes(".");
}

async function resolvePublicHost(hostname: string): Promise<PublicNetworkAddress[]> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isUnsafePublicHostname(host)) throw new Error("unsafe_or_private_host");
  if (isIpLiteral(host)) return [{ address: host, family: host.includes(":") ? 6 : 4 }];

  const records: string[] = [];
  const [ipv4, ipv6] = await Promise.allSettled([
    Deno.resolveDns(host, "A"),
    Deno.resolveDns(host, "AAAA"),
  ]);
  if (ipv4.status === "fulfilled") records.push(...ipv4.value);
  if (ipv6.status === "fulfilled") records.push(...ipv6.value);
  if (records.length === 0 || records.some((address) => address.includes(":") ? isPrivateIpv6(address) : isPrivateIpv4(address))) {
    throw new Error("unsafe_or_private_host");
  }
  return [...new Set(records)].map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

export async function resolveSafePublicUrl(input: string | URL): Promise<ResolvedPublicUrl> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new Error("invalid_url");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsafe_protocol");
  if (url.username || url.password) throw new Error("unsafe_credentials");
  return { url, addresses: await resolvePublicHost(url.hostname) };
}

export async function assertSafePublicUrl(input: string | URL) {
  return (await resolveSafePublicUrl(input)).url;
}
