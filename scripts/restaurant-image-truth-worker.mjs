import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_VERIFY_PER_RUN = 500;
export const MAX_DISCOVERY_PER_RUN = 250;

const REQUEST_TIMEOUT_MS = 18_000;
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_CONCURRENCY = 3;
const DEFAULT_MODEL = "gpt-4.1-mini";
const BAD_IMAGE_TOKEN = /(?:^|[\/_\-.])(logo|favicon|icon|sprite|avatar|pixel|tracking|placeholder|default|blank|spacer|loader|loading|map|badge|qr)(?:[\/_\-.]|$)/i;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const REJECTED_IMAGE_KINDS = new Set([
  "logo",
  "menu",
  "map",
  "stock",
  "person",
  "unrelated",
]);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeHost(hostname) {
  return String(hostname || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateIpv4(address) {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpAddress(address) {
  const normalized = normalizeHost(address);
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return false;

  const compact = normalized.toLowerCase();
  return (
    compact === "::" ||
    compact === "::1" ||
    compact.startsWith("fc") ||
    compact.startsWith("fd") ||
    compact.startsWith("fe8") ||
    compact.startsWith("fe9") ||
    compact.startsWith("fea") ||
    compact.startsWith("feb") ||
    compact.startsWith("ff") ||
    compact.startsWith("2001:db8:") ||
    compact.startsWith("::ffff:127.") ||
    compact.startsWith("::ffff:10.") ||
    compact.startsWith("::ffff:192.168.")
  );
}

export function isSafePublicImageUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (url.port && !new Set(["80", "443"]).has(url.port)) return false;

    const hostname = normalizeHost(url.hostname);
    if (!hostname) return false;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      return false;
    }
    if (isIP(hostname) && isPrivateIpAddress(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function assertPublicDns(url) {
  const hostname = normalizeHost(url.hostname);
  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error("private_network_url");
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("private_network_dns_resolution");
  }
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function resolveCandidate(rawValue, baseUrl) {
  const value = String(rawValue || "").trim().replace(/&amp;/g, "&");
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!isSafePublicImageUrl(url.href)) return null;
    if (BAD_IMAGE_TOKEN.test(`${url.pathname}${url.search}`)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function collectJsonLdImages(value, output, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectJsonLdImages(item, output, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (key.toLowerCase() === "image") {
      if (typeof nested === "string") output.push(nested);
      else if (Array.isArray(nested)) {
        for (const item of nested.slice(0, 20)) {
          if (typeof item === "string") output.push(item);
          else if (item && typeof item === "object" && typeof item.url === "string") output.push(item.url);
        }
      } else if (nested && typeof nested === "object" && typeof nested.url === "string") {
        output.push(nested.url);
      }
    }
    collectJsonLdImages(nested, output, depth + 1);
  }
}

export function extractOfficialImageCandidates(html, pageUrl) {
  const ranked = [];
  let order = 0;
  const pushCandidate = (rawValue, priority) => {
    const resolved = resolveCandidate(rawValue, pageUrl);
    if (!resolved) return;
    ranked.push({ url: resolved, priority, order: order++ });
  };

  for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = String(attributes.property || attributes.name || "").toLowerCase();
    const content = attributes.content;
    if (!content) continue;
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url") {
      pushCandidate(content, 100);
    } else if (key === "twitter:image" || key === "twitter:image:src") {
      pushCandidate(content, 70);
    }
  }

  for (const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const images = [];
      collectJsonLdImages(parsed, images);
      for (const image of images) pushCandidate(image, 95);
    } catch {
      // Invalid JSON-LD must not prevent extraction from other evidence.
    }
  }

  for (const match of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const width = Number.parseInt(attributes.width || "0", 10);
    const height = Number.parseInt(attributes.height || "0", 10);
    if ((width > 0 && width <= 32) || (height > 0 && height <= 32)) continue;

    const descriptiveText = `${attributes.alt || ""} ${attributes.title || ""}`.trim();
    const source = attributes.src || attributes["data-src"] || attributes["data-lazy-src"];
    if (source) pushCandidate(source, /restaurant|salle|terrasse|fa[cç]ade|interieur|intérieur/i.test(descriptiveText) ? 90 : 60);

    const sourceSet = attributes.srcset || attributes["data-srcset"];
    if (sourceSet) {
      const largest = sourceSet
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0])
        .filter(Boolean)
        .at(-1);
      if (largest) pushCandidate(largest, 65);
    }
  }

  const seen = new Set();
  return ranked
    .sort((left, right) => right.priority - left.priority || left.order - right.order)
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .slice(0, 8)
    .map((candidate) => candidate.url);
}

export function decideImageTruth(result) {
  const imageKind = String(result?.image_kind || "unknown").toLowerCase();
  const confidence = Number(result?.confidence || 0);

  if (result?.contradiction === true) return "rejected";
  if (result?.exact_restaurant_match !== true) return "rejected";
  if (REJECTED_IMAGE_KINDS.has(imageKind)) return "rejected";

  if (
    new Set(["exterior", "interior", "terrace"]).has(imageKind) &&
    result?.depicts_real_venue === true &&
    result?.official_source_consistent === true &&
    confidence >= 0.86
  ) {
    return "verified";
  }

  if (
    imageKind === "food" &&
    result?.official_source_consistent === true &&
    confidence >= 0.96
  ) {
    return "verified";
  }

  return "manual_review";
}

function sanitizeText(value, maximum = 1200) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function sourceHostsMatch(candidateUrl, sourceUrl) {
  if (!sourceUrl || !isSafePublicImageUrl(candidateUrl) || !isSafePublicImageUrl(sourceUrl)) return false;
  const candidateHost = normalizeHost(new URL(candidateUrl).hostname).replace(/^www\./, "");
  const sourceHost = normalizeHost(new URL(sourceUrl).hostname).replace(/^www\./, "");
  return candidateHost === sourceHost || candidateHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${candidateHost}`);
}

function hasVisibleIdentityEvidence(result, restaurantName) {
  const evidence = Array.isArray(result?.visible_identity_evidence)
    ? result.visible_identity_evidence.map((item) => sanitizeText(item, 160).toLowerCase())
    : [];
  const significantTokens = sanitizeText(restaurantName, 200)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !new Set(["restaurant", "cafe", "hotel", "geneve"]).has(token));
  return significantTokens.some((token) => evidence.some((item) => item.normalize("NFKD").replace(/\p{Diacritic}/gu, "").includes(token)));
}

async function readBoundedResponse(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("response_too_large");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("response_too_large").catch(() => undefined);
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function fetchBounded(urlValue, expectedKind) {
  if (!isSafePublicImageUrl(urlValue)) throw new Error("unsafe_public_url");
  const initialUrl = new URL(urlValue);
  await assertPublicDns(initialUrl);

  const response = await fetch(initialUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: expectedKind === "image"
        ? "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1"
        : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      "User-Agent": "TOK-Restaurant-Image-Truth/1.0 (+https://www.thetok.ch)",
    },
  });

  if (!response.ok) throw new Error(`remote_http_${response.status}`);
  if (!isSafePublicImageUrl(response.url)) throw new Error("unsafe_redirect_url");
  await assertPublicDns(new URL(response.url));

  const contentType = String(response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const maximumBytes = expectedKind === "image" ? MAX_IMAGE_BYTES : MAX_HTML_BYTES;
  const bytes = await readBoundedResponse(response, maximumBytes);

  if (expectedKind === "image" && !ACCEPTED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`unsupported_image_type_${contentType || "missing"}`);
  }
  if (expectedKind === "html" && !/^(text\/html|application\/xhtml\+xml)$/.test(contentType)) {
    throw new Error(`unsupported_html_type_${contentType || "missing"}`);
  }

  return { bytes, contentType, finalUrl: response.url };
}

function buildImageTruthSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "exact_restaurant_match",
      "depicts_real_venue",
      "official_source_consistent",
      "image_kind",
      "confidence",
      "contradiction",
      "reason",
      "visible_identity_evidence",
    ],
    properties: {
      exact_restaurant_match: { type: "boolean" },
      depicts_real_venue: { type: "boolean" },
      official_source_consistent: { type: "boolean" },
      image_kind: {
        type: "string",
        enum: [
          "exterior",
          "interior",
          "terrace",
          "food",
          "logo",
          "menu",
          "map",
          "stock",
          "person",
          "unrelated",
          "unknown",
        ],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      contradiction: { type: "boolean" },
      reason: { type: "string", maxLength: 600 },
      visible_identity_evidence: {
        type: "array",
        maxItems: 5,
        items: { type: "string", maxLength: 160 },
      },
    },
  };
}

function extractAssistantJson(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return JSON.parse(content);
  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item?.type === "text" || item?.type === "output_text")
      .map((item) => item.text)
      .join("");
    return JSON.parse(text);
  }
  throw new Error("openai_structured_output_missing");
}

async function classifyImageWithOpenAI({ row, bytes, contentType, reviewEvidence }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  const model = process.env.TOK_IMAGE_TRUTH_MODEL?.trim() || DEFAULT_MODEL;
  const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  const candidateOrigin = reviewEvidence?.candidate_origin === "official_page"
    ? "official_page"
    : "legacy_or_external";

  const response_format = {
    type: "json_schema",
    json_schema: {
      name: "tok_restaurant_image_truth",
      strict: true,
      schema: buildImageTruthSchema(),
    },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "TOK-Restaurant-Image-Truth/1.0",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 450,
      response_format,
      messages: [
        {
          role: "system",
          content: [
            "You verify restaurant directory photos for TOK.",
            "Be strict: the image may be published only when it can be tied to the exact named restaurant, not merely to a cuisine or generic venue.",
            "Reject logos, menus, maps, stock photography, unrelated people, screenshots, generic city views, and any image showing another business.",
            "An interior, exterior, terrace, or food image is acceptable only with exact identity evidence or a verified official-page origin supplied in the text.",
            "Never infer that a generic dish belongs to the restaurant without official-source evidence.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                restaurant_name: sanitizeText(row.restaurant_name, 240),
                address: sanitizeText(row.restaurant_address, 320),
                city: sanitizeText(row.restaurant_city, 160),
                candidate_url: sanitizeText(row.candidate_url, 1200),
                source_url: sanitizeText(row.source_url, 1200),
                candidate_origin: candidateOrigin,
                source_and_candidate_hosts_match: sourceHostsMatch(row.candidate_url, row.source_url),
                instruction: "Return only the required structured classification. Visible signage or a clearly matching official-page origin is required for exact identity.",
              }),
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "low" },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`openai_http_${response.status}`);
  const payload = await response.json();
  const result = extractAssistantJson(payload);
  const originIsOfficial = candidateOrigin === "official_page" && Boolean(row.source_url);
  const deterministicSourceMatch = sourceHostsMatch(row.candidate_url, row.source_url);
  const identityVisible = hasVisibleIdentityEvidence(result, row.restaurant_name);

  result.official_source_consistent = Boolean(
    result.official_source_consistent &&
    (originIsOfficial || deterministicSourceMatch || identityVisible)
  );
  if (!originIsOfficial && !deterministicSourceMatch && !identityVisible) {
    result.exact_restaurant_match = false;
  }

  return { result, model };
}

function supabaseHeaders(extra = {}) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("supabase_service_role_key_missing");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function supabaseUrl(pathname) {
  const baseUrl = process.env.SUPABASE_URL?.trim();
  if (!baseUrl) throw new Error("supabase_url_missing");
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
}

async function rpc(functionName, payload = {}) {
  const response = await fetch(supabaseUrl(`/rest/v1/rpc/${functionName}`), {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = sanitizeText(await response.text().catch(() => ""), 500);
    throw new Error(`supabase_rpc_${functionName}_${response.status}_${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function restGet(pathname) {
  const response = await fetch(supabaseUrl(pathname), {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: supabaseHeaders(),
  });
  if (!response.ok) throw new Error(`supabase_get_${response.status}`);
  return response.json();
}

async function restUpsert(table, rows, onConflict) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const url = new URL(supabaseUrl(`/rest/v1/${table}`));
  url.searchParams.set("on_conflict", onConflict);
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const body = sanitizeText(await response.text().catch(() => ""), 500);
    throw new Error(`supabase_upsert_${table}_${response.status}_${body}`);
  }
}

async function getReviewEvidence(reviewId) {
  const query = new URLSearchParams({
    id: `eq.${reviewId}`,
    select: "evidence",
    limit: "1",
  });
  const rows = await restGet(`/rest/v1/restaurant_image_truth_reviews?${query}`);
  return rows?.[0]?.evidence && typeof rows[0].evidence === "object"
    ? rows[0].evidence
    : {};
}

async function settleReview(row, decision, details = {}) {
  return rpc("settle_restaurant_image_truth_review", {
    p_review_id: row.review_id,
    p_lease_token: row.lease_token,
    p_decision: decision,
    p_confidence: Number(details.confidence || 0),
    p_image_kind: details.imageKind || "unknown",
    p_reason: sanitizeText(details.reason || "", 1200),
    p_model: sanitizeText(details.model || "", 160),
    p_image_sha256: details.sha256 || null,
    p_mime_type: details.mimeType || null,
    p_size_bytes: Number.isFinite(details.sizeBytes) ? details.sizeBytes : null,
    p_evidence: details.evidence || {},
  });
}

function isPermanentImageFailure(errorCode) {
  return /^(?:unsafe_|private_network_|response_too_large|unsupported_image_type_|remote_http_(?:400|401|403|404|410))/.test(errorCode);
}

async function processVerification(row) {
  let sha256 = null;
  let mimeType = null;
  let sizeBytes = null;
  try {
    const reviewEvidence = await getReviewEvidence(row.review_id);
    const image = await fetchBounded(row.candidate_url, "image");
    sha256 = createHash("sha256").update(image.bytes).digest("hex");
    mimeType = image.contentType;
    sizeBytes = image.bytes.byteLength;

    const duplicatesQuery = new URLSearchParams({
      image_sha256: `eq.${sha256}`,
      status: "eq.verified",
      restaurant_id: `neq.${row.restaurant_id}`,
      select: "restaurant_id",
      limit: "1",
    });
    const duplicates = await restGet(`/rest/v1/restaurant_image_truth_reviews?${duplicatesQuery}`);
    if (duplicates.length > 0) {
      await settleReview(row, "rejected", {
        confidence: 1,
        imageKind: "stock",
        reason: "The exact same image bytes are already verified for another restaurant.",
        model: "sha256-duplicate-guard",
        sha256,
        mimeType,
        sizeBytes,
        evidence: { duplicate_verified_image: true },
      });
      return { decision: "rejected", reason: "duplicate_hash" };
    }

    const { result, model } = await classifyImageWithOpenAI({
      row,
      bytes: image.bytes,
      contentType: image.contentType,
      reviewEvidence,
    });
    const decision = decideImageTruth(result);
    await settleReview(row, decision, {
      confidence: result.confidence,
      imageKind: result.image_kind,
      reason: result.reason,
      model,
      sha256,
      mimeType,
      sizeBytes,
      evidence: {
        exact_restaurant_match: result.exact_restaurant_match,
        depicts_real_venue: result.depicts_real_venue,
        official_source_consistent: result.official_source_consistent,
        contradiction: result.contradiction,
        visible_identity_evidence: result.visible_identity_evidence,
        candidate_origin: reviewEvidence.candidate_origin || "legacy_or_external",
      },
    });
    return { decision, reason: "classified" };
  } catch (error) {
    const errorCode = sanitizeText(error instanceof Error ? error.message : String(error), 240);
    const permanent = isPermanentImageFailure(errorCode) || Number(row.attempt_number || 0) >= 3;
    const decision = permanent ? "rejected" : "retry";
    await settleReview(row, decision, {
      confidence: 0,
      imageKind: "unknown",
      reason: errorCode,
      model: "transport-guard",
      sha256,
      mimeType,
      sizeBytes,
      evidence: { error_code: errorCode },
    }).catch(() => undefined);
    return { decision, reason: errorCode };
  }
}

async function processDiscovery(row) {
  let candidates = [];
  let errorCode = null;
  try {
    if (!row.source_url) throw new Error("source_url_missing");
    const page = await fetchBounded(row.source_url, "html");
    const html = new TextDecoder("utf-8", { fatal: false }).decode(page.bytes);
    candidates = extractOfficialImageCandidates(html, page.finalUrl).slice(0, 5);

    if (candidates.length > 0) {
      await restUpsert(
        "restaurant_image_truth_reviews",
        candidates.map((candidateUrl, index) => ({
          restaurant_id: row.restaurant_id,
          candidate_url: candidateUrl,
          source_url: page.finalUrl,
          source_host: normalizeHost(new URL(page.finalUrl).hostname),
          status: "queued",
          next_attempt_at: new Date().toISOString(),
          evidence: {
            candidate_origin: "official_page",
            source_page_url: page.finalUrl,
            candidate_rank: index + 1,
          },
          updated_at: new Date().toISOString(),
        })),
        "restaurant_id,candidate_url",
      );
    }
  } catch (error) {
    errorCode = sanitizeText(error instanceof Error ? error.message : String(error), 240);
  }

  await rpc("settle_restaurant_image_discovery_job", {
    p_restaurant_id: row.restaurant_id,
    p_lease_token: row.lease_token,
    p_candidates: candidates,
    p_error: errorCode,
  });
  return { candidates: candidates.length, error: errorCode };
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length || 1) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

export async function runBackfill(options = {}) {
  const rounds = clampInteger(options.rounds, 5, 1, 30);
  const verifyLimit = clampInteger(options.verifyLimit, 20, 1, 25);
  const discoveryLimit = clampInteger(options.discoveryLimit, 15, 1, 25);
  const concurrency = clampInteger(options.concurrency, 2, 1, MAX_CONCURRENCY);

  const summary = {
    rounds_requested: rounds,
    rounds_completed: 0,
    reviews_claimed: 0,
    verified: 0,
    rejected: 0,
    manual_review: 0,
    retry: 0,
    discovery_claimed: 0,
    candidates_discovered: 0,
    discovery_errors: 0,
    started_at: new Date().toISOString(),
  };

  for (let round = 0; round < rounds; round += 1) {
    const remainingVerify = MAX_VERIFY_PER_RUN - summary.reviews_claimed;
    const remainingDiscovery = MAX_DISCOVERY_PER_RUN - summary.discovery_claimed;
    if (remainingVerify <= 0 && remainingDiscovery <= 0) break;

    const reviewRows = remainingVerify > 0
      ? await rpc("claim_restaurant_image_truth_reviews", {
          p_limit: Math.min(verifyLimit, remainingVerify),
        })
      : [];
    const reviewResults = await mapConcurrent(reviewRows || [], concurrency, processVerification);
    summary.reviews_claimed += reviewRows?.length || 0;
    for (const result of reviewResults) {
      if (result?.decision in summary) summary[result.decision] += 1;
    }

    const discoveryRows = remainingDiscovery > 0
      ? await rpc("claim_restaurant_image_discovery_jobs", {
          p_limit: Math.min(discoveryLimit, remainingDiscovery),
        })
      : [];
    const discoveryResults = await mapConcurrent(discoveryRows || [], concurrency, processDiscovery);
    summary.discovery_claimed += discoveryRows?.length || 0;
    for (const result of discoveryResults) {
      summary.candidates_discovered += result?.candidates || 0;
      if (result?.error) summary.discovery_errors += 1;
    }

    summary.rounds_completed += 1;
    if ((reviewRows?.length || 0) === 0 && (discoveryRows?.length || 0) === 0) break;
  }

  summary.finished_at = new Date().toISOString();
  summary.catalog = await rpc("get_restaurant_image_truth_stats", {});
  return summary;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [key, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (key === "--rounds") options.rounds = value;
    if (key === "--verify-limit") options.verifyLimit = value;
    if (key === "--discovery-limit") options.discoveryLimit = value;
    if (key === "--concurrency") options.concurrency = value;
    if (!inlineValue && new Set(["--rounds", "--verify-limit", "--discovery-limit", "--concurrency"]).has(key)) {
      index += 1;
    }
  }
  return options;
}

async function main() {
  if (!process.env.SUPABASE_URL?.trim()) throw new Error("SUPABASE_URL is required");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required");

  const summary = await runBackfill(parseArguments(process.argv.slice(2)));
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  process.stdout.write(serialized);
  const outputPath = process.env.IMAGE_TRUTH_SUMMARY_PATH?.trim();
  if (outputPath) await writeFile(outputPath, serialized, { encoding: "utf8" });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(sanitizeText(error instanceof Error ? error.message : String(error), 1000));
    process.exitCode = 1;
  });
}
