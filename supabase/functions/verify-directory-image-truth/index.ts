import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "verify-directory-image-truth";
const VERIFIER_MODEL = "tok-official-source-verifier-v1";
const DEFAULT_BATCH_SIZE = 6;
const MAX_BATCH_SIZE = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 12_000;
const MIN_WIDTH = 500;
const MIN_HEIGHT = 300;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_SOURCE_HTML = 900_000;
const USER_AGENT = "TOK-Directory-Image-Verifier/1.0 (+https://www.thetok.ch)";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BLOCKED_HOSTS = [
  "tripadvisor.ch",
  "tripadvisor.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "local.ch",
  "search.ch",
  "google.com",
  "google.ch",
  "bing.com",
  "yelp.com",
  "ubereats.com",
  "just-eat.ch",
  "smood.ch",
  "restaurantguru.com",
  "falstaff.com",
  "mapstr.com",
];
const BLOCKED_IMAGE_PARTS = [
  "logo",
  "favicon",
  "icon",
  "avatar",
  "sprite",
  "pixel",
  "tracking",
  "emoji",
  "badge",
  "placeholder",
  "default-image",
  "map-marker",
  "spinner",
  "loader",
  "payment",
  "social",
  "dummy",
];
const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "bar",
  "brasserie",
  "auberge",
  "geneve",
  "sarl",
  "sa",
  "gmbh",
  "ag",
  "sagl",
  "ltd",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-internal-cron-secret, x-cron-secret",
  Vary: "Origin",
};

type ClaimRow = {
  review_id: string;
  lease_token: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_address: string | null;
  restaurant_city: string | null;
  candidate_url: string;
  source_url: string | null;
  directory_source: string | null;
  attempt_number: number;
};

type ImageJob = {
  source_page_url: string | null;
  source_image_url: string | null;
};

type DownloadedImage = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  finalUrl: string;
};

type IdentityScore = {
  score: number;
  nameMatched: boolean;
  cityMatched: boolean;
  addressMatched: boolean;
};

type VerificationDecision = {
  decision: "verified" | "rejected" | "manual_review" | "retry";
  confidence: number;
  imageKind: "exterior" | "interior" | "terrace" | "food" | "logo" | "menu" | "map" | "stock" | "person" | "unrelated" | "unknown";
  reason: string;
  evidence: Record<string, unknown>;
  imageSha256?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

const dnsCache = new Map<string, Promise<boolean>>();

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function boundedBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulNameTokens(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function hostOf(value: string | null | undefined) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isTheForkHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "").split(".").includes("thefork");
}

function isBlockedHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  if (isTheForkHost(normalized)) return true;
  return BLOCKED_HOSTS.some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function validHttpUrl(value: string | null | undefined) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice("::ffff:".length));
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("2001:db8:");
}

function isIpLiteral(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}

async function hostIsPublic(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIpLiteral(host)) return host.includes(":") ? !isPrivateIpv6(host) : !isPrivateIpv4(host);
  if (!dnsCache.has(host)) {
    dnsCache.set(host, (async () => {
      const records: string[] = [];
      const [ipv4, ipv6] = await Promise.allSettled([
        Deno.resolveDns(host, "A"),
        Deno.resolveDns(host, "AAAA"),
      ]);
      if (ipv4.status === "fulfilled") records.push(...ipv4.value);
      if (ipv6.status === "fulfilled") records.push(...ipv6.value);
      if (records.length === 0) return false;
      return records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }
  return await dnsCache.get(host)!;
}

async function fetchPublic(
  input: string,
  options: { accept?: string; timeoutMs?: number; maxRedirects?: number } = {},
) {
  let current = new URL(input);
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!await hostIsPublic(current.hostname)) throw new Error("unsafe_or_private_host");
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === maxRedirects) throw new Error("redirect_limit");
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("redirect_limit");
}

async function readTextLimited(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= limit) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, limit);
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceIdentity(row: ClaimRow, html: string, sourceUrl: string): IdentityScore {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const blob = normalizeText(`${title} ${stripHtml(html).slice(0, 160_000)} ${sourceUrl}`);
  const normalizedName = normalizeText(row.restaurant_name);
  const tokens = meaningfulNameTokens(row.restaurant_name);
  const normalizedCity = normalizeText(row.restaurant_city);
  const addressTokens = normalizeText(row.restaurant_address)
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 7);
  const streetNumber = String(row.restaurant_address || "").match(/\b\d{1,4}[a-z]?\b/i)?.[0]?.toLowerCase() || "";

  const exactName = Boolean(normalizedName && blob.includes(normalizedName));
  const matching = tokens.filter((token) => blob.includes(token)).length;
  const nameRatio = tokens.length ? matching / tokens.length : 0;
  const nameMatched = exactName || nameRatio >= 0.6;
  const cityMatched = Boolean(normalizedCity && blob.includes(normalizedCity));
  const addressCount = addressTokens.filter((token) => blob.includes(token)).length;
  const addressMatched = addressCount >= Math.min(2, Math.max(1, addressTokens.length))
    || Boolean(streetNumber && blob.includes(streetNumber) && addressCount >= 1);

  let score = 0;
  if (exactName) score += 7;
  else if (nameRatio >= 0.75) score += 5;
  else if (nameRatio >= 0.6) score += 3;
  if (cityMatched) score += 2;
  if (addressMatched) score += 5;
  return { score, nameMatched, cityMatched, addressMatched };
}

function imageDimensions(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mimeType === "image/jpeg" && bytes.length >= 12) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 1 >= bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }
      offset += length;
    }
  }

  if (mimeType === "image/webp" && bytes.length >= 30) {
    const signature = new TextDecoder().decode(bytes.subarray(0, 16));
    if (signature.startsWith("RIFF") && signature.includes("WEBP")) {
      const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
      if (chunk === "VP8X" && bytes.length >= 30) {
        const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        return { width, height };
      }
      if (chunk === "VP8 " && bytes.length >= 30) {
        const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
        const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
        return { width, height };
      }
      if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
        const b1 = bytes[21];
        const b2 = bytes[22];
        const b3 = bytes[23];
        const b4 = bytes[24];
        return {
          width: 1 + (((b2 & 0x3f) << 8) | b1),
          height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        };
      }
    }
  }

  return null;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function imageKindFromUrl(value: string): VerificationDecision["imageKind"] {
  const lower = value.toLowerCase();
  if (/logo|brand|favicon/.test(lower)) return "logo";
  if (/menu|carte/.test(lower)) return "menu";
  if (/terrace|terrasse/.test(lower)) return "terrace";
  if (/interior|inside|salle|restaurant/.test(lower)) return "interior";
  if (/food|dish|plate|plat|cuisine/.test(lower)) return "food";
  if (/exterior|facade|outside/.test(lower)) return "exterior";
  return "unknown";
}

function pageReferencesImage(html: string, imageUrl: string) {
  if (!imageUrl) return false;
  const decoded = html.replace(/&amp;/gi, "&").replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
  if (decoded.includes(imageUrl)) return true;
  try {
    const url = new URL(imageUrl);
    if (decoded.includes(url.pathname)) return true;
    const filename = url.pathname.split("/").filter(Boolean).at(-1) || "";
    if (filename.length >= 10 && decoded.includes(filename)) return true;
  } catch {
    return false;
  }
  return false;
}

async function downloadImage(candidateUrl: string): Promise<DownloadedImage> {
  const { response, finalUrl } = await fetchPublic(candidateUrl, {
    accept: "image/webp,image/png,image/jpeg;q=0.95,*/*;q=0.1",
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  if (isTheForkHost(finalUrl.hostname) || isBlockedHost(finalUrl.hostname)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("blocked_candidate_host");
  }
  if (!response.ok) throw new Error(`candidate_http_${response.status}`);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) throw new Error("unsupported_image_type");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  if (bytes.byteLength < MIN_IMAGE_BYTES) throw new Error("image_too_small_bytes");
  return { bytes, mimeType: mimeType as DownloadedImage["mimeType"], finalUrl: finalUrl.toString() };
}

async function fetchSourcePage(sourceUrl: string) {
  const url = validHttpUrl(sourceUrl);
  if (!url || isBlockedHost(url.hostname)) return null;
  const { response, finalUrl } = await fetchPublic(url.toString(), { timeoutMs: FETCH_TIMEOUT_MS });
  if (isBlockedHost(finalUrl.hostname) || !response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  return { url: finalUrl.toString(), html: await readTextLimited(response, MAX_SOURCE_HTML) };
}

async function loadImageJob(supabase: any, restaurantId: string): Promise<ImageJob | null> {
  const { data, error } = await supabase
    .from("restaurant_directory_image_jobs")
    .select("source_page_url, source_image_url")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(`image_job_lookup_failed:${error.message}`);
  return data as ImageJob | null;
}

async function verifiedHashOwner(supabase: any, hash: string) {
  const { data, error } = await supabase
    .from("restaurant_image_truth_reviews")
    .select("restaurant_id")
    .eq("status", "verified")
    .eq("image_sha256", hash)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`hash_lookup_failed:${error.message}`);
  return data?.restaurant_id ? String(data.restaurant_id) : null;
}

async function verifyOfficialSource(
  supabase: any,
  row: ClaimRow,
): Promise<VerificationDecision> {
  const candidateHost = hostOf(row.candidate_url);
  if (!candidateHost || isTheForkHost(candidateHost) || isBlockedHost(candidateHost)) {
    return {
      decision: "rejected",
      confidence: 1,
      imageKind: "unrelated",
      reason: "blocked_candidate_host",
      evidence: { candidate_host: candidateHost },
    };
  }
  if (BLOCKED_IMAGE_PARTS.some((part) => row.candidate_url.toLowerCase().includes(part))) {
    return {
      decision: "rejected",
      confidence: 0.99,
      imageKind: "logo",
      reason: "blocked_image_url_pattern",
      evidence: {},
    };
  }

  let downloaded: DownloadedImage;
  try {
    downloaded = await downloadImage(row.candidate_url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "candidate_download_failed";
    const retryable = /^candidate_http_5/.test(message) || message.includes("timeout") || message.includes("network");
    return {
      decision: retryable && row.attempt_number < 5 ? "retry" : "rejected",
      confidence: retryable ? 0.2 : 0.98,
      imageKind: "unknown",
      reason: message,
      evidence: {},
    };
  }

  const dimensions = imageDimensions(downloaded.bytes, downloaded.mimeType);
  if (!dimensions) {
    return {
      decision: "manual_review",
      confidence: 0.5,
      imageKind: "unknown",
      reason: "image_dimensions_unreadable",
      evidence: { mime_type: downloaded.mimeType },
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }
  if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) {
    return {
      decision: "rejected",
      confidence: 0.99,
      imageKind: "logo",
      reason: "image_dimensions_too_small",
      evidence: dimensions,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }

  const imageHash = await sha256Hex(downloaded.bytes);
  const existingOwner = await verifiedHashOwner(supabase, imageHash);
  if (existingOwner && existingOwner !== row.restaurant_id) {
    return {
      decision: "manual_review",
      confidence: 0.4,
      imageKind: "unknown",
      reason: "verified_hash_already_used_by_other_restaurant",
      evidence: { existing_owner: existingOwner, ...dimensions },
      imageSha256: imageHash,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }

  const imageJob = await loadImageJob(supabase, row.restaurant_id);
  const sourceCandidates = [
    imageJob?.source_page_url,
    row.source_url,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  let sourcePage: { url: string; html: string } | null = null;
  let identity: IdentityScore | null = null;
  for (const sourceCandidate of sourceCandidates) {
    const parsed = validHttpUrl(sourceCandidate);
    if (!parsed || isBlockedHost(parsed.hostname)) continue;
    try {
      const page = await fetchSourcePage(sourceCandidate);
      if (!page) continue;
      const score = sourceIdentity(row, page.html, page.url);
      if (!score.nameMatched || score.score < 8 || (!score.addressMatched && !score.cityMatched)) continue;
      sourcePage = page;
      identity = score;
      break;
    } catch {
      continue;
    }
  }

  if (!sourcePage || !identity) {
    return {
      decision: row.attempt_number < 5 ? "retry" : "manual_review",
      confidence: 0.35,
      imageKind: imageKindFromUrl(row.candidate_url),
      reason: "official_source_identity_not_verified",
      evidence: { source_candidates: sourceCandidates, ...dimensions },
      imageSha256: imageHash,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }

  const sourceHost = hostOf(sourcePage.url);
  if (!sourceHost || isBlockedHost(sourceHost)) {
    return {
      decision: "rejected",
      confidence: 1,
      imageKind: "unrelated",
      reason: "blocked_source_host",
      evidence: { source_host: sourceHost },
      imageSha256: imageHash,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }

  const originalImageUrl = String(imageJob?.source_image_url || "").trim();
  const originalReferenced = originalImageUrl ? pageReferencesImage(sourcePage.html, originalImageUrl) : false;
  const candidateReferenced = pageReferencesImage(sourcePage.html, row.candidate_url);
  const candidateSameHost = hostOf(row.candidate_url) === sourceHost;
  const originalSameHost = originalImageUrl ? hostOf(originalImageUrl) === sourceHost : false;
  const storageCandidate = candidateHost.endsWith("supabase.co");
  const provenanceVerified = candidateReferenced
    || candidateSameHost
    || originalReferenced
    || (storageCandidate && Boolean(originalImageUrl) && (originalReferenced || originalSameHost));

  if (!provenanceVerified) {
    return {
      decision: "manual_review",
      confidence: 0.55,
      imageKind: imageKindFromUrl(originalImageUrl || row.candidate_url),
      reason: "official_source_image_provenance_ambiguous",
      evidence: {
        source_url: sourcePage.url,
        source_image_url: originalImageUrl || null,
        identity_score: identity.score,
        ...dimensions,
      },
      imageSha256: imageHash,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.byteLength,
    };
  }

  const confidence = Math.min(0.98, 0.9 + Math.min(identity.score, 8) * 0.01);
  return {
    decision: "verified",
    confidence,
    imageKind: imageKindFromUrl(originalImageUrl || row.candidate_url),
    reason: "official_source_identity_verified",
    evidence: {
      source_url: sourcePage.url,
      source_host: sourceHost,
      source_image_url: originalImageUrl || null,
      identity_score: identity.score,
      name_matched: identity.nameMatched,
      city_matched: identity.cityMatched,
      address_matched: identity.addressMatched,
      candidate_referenced: candidateReferenced,
      original_referenced: originalReferenced,
      candidate_same_host: candidateSameHost,
      original_same_host: originalSameHost,
      ...dimensions,
    },
    imageSha256: imageHash,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.bytes.byteLength,
  };
}

async function settle(supabase: any, row: ClaimRow, result: VerificationDecision) {
  const { data, error } = await supabase.rpc("settle_restaurant_image_truth_review", {
    p_review_id: row.review_id,
    p_lease_token: row.lease_token,
    p_decision: result.decision,
    p_confidence: result.confidence,
    p_image_kind: result.imageKind,
    p_reason: result.reason,
    p_model: VERIFIER_MODEL,
    p_image_sha256: result.imageSha256 || null,
    p_mime_type: result.mimeType || null,
    p_size_bytes: result.sizeBytes || null,
    p_evidence: result.evidence,
  });
  if (error) throw new Error(`settle_failed:${error.message}`);
  return data === true;
}

async function processOne(supabase: any, row: ClaimRow) {
  try {
    const result = await verifyOfficialSource(supabase, row);
    const settled = await settle(supabase, row, result);
    return {
      review_id: row.review_id,
      restaurant_id: row.restaurant_id,
      decision: result.decision,
      settled,
      reason: result.reason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "verification_failed";
    try {
      await settle(supabase, row, {
        decision: row.attempt_number < 5 ? "retry" : "manual_review",
        confidence: 0.2,
        imageKind: "unknown",
        reason: message.slice(0, 500),
        evidence: { worker_error: message },
      });
    } catch {
      // The lease may have expired; a later claim can recover it.
    }
    return {
      review_id: row.review_id,
      restaurant_id: row.restaurant_id,
      decision: "error",
      settled: false,
      reason: message,
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function authorize(req: Request, supabase: any) {
  const provided = req.headers.get("x-internal-cron-secret") || req.headers.get("x-cron-secret") || "";
  const configured = env("INTERNAL_CRON_SECRET") || env("CRON_SECRET");
  if (configured && provided && safeEqual(provided, configured)) return true;
  if (provided) {
    try {
      const { data, error } = await supabase.rpc("verify_internal_cron_secret", { p_secret: provided });
      if (!error && data === true) return true;
    } catch {
      // Continue to service-role bearer fallback.
    }
  }
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return Boolean(token && env("SUPABASE_SERVICE_ROLE_KEY") && safeEqual(token, env("SUPABASE_SERVICE_ROLE_KEY")));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ success: false, error: "supabase_configuration_missing" }, 503);
  const supabase = createClient(supabaseUrl, serviceRole);
  if (!await authorize(req, supabase)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String((body as any)?.mode || "process_batch");
    if (mode !== "process_batch") return json({ success: false, error: "Invalid mode" }, 400);
    const limit = boundedBatchSize((body as any)?.limit);

    const { data: claimed, error: claimError } = await supabase.rpc(
      "service_claim_thefork_image_truth_reviews",
      { p_limit: limit },
    );
    if (claimError) return json({ success: false, error: `claim_failed:${claimError.message}` }, 500);

    const reviews = (claimed || []) as ClaimRow[];
    const results = await mapWithConcurrency(reviews, 4, (row) => processOne(supabase, row));
    const verified = results.filter((result: any) => result?.decision === "verified" && result?.settled).length;
    const rejected = results.filter((result: any) => result?.decision === "rejected" && result?.settled).length;
    const manualReview = results.filter((result: any) => result?.decision === "manual_review" && result?.settled).length;
    const retry = results.filter((result: any) => result?.decision === "retry" && result?.settled).length;
    const errors = results.filter((result: any) => result?.decision === "error").length;

    console.log(JSON.stringify({
      fn: FUNCTION_NAME,
      model: VERIFIER_MODEL,
      claimed: reviews.length,
      verified,
      rejected,
      manual_review: manualReview,
      retry,
      errors,
    }));

    return json({
      success: true,
      model: VERIFIER_MODEL,
      claimed: reviews.length,
      verified,
      rejected,
      manual_review: manualReview,
      retry,
      errors,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(JSON.stringify({ fn: FUNCTION_NAME, msg: "request_failed", message }));
    return json({ success: false, error: message }, 500);
  }
});
